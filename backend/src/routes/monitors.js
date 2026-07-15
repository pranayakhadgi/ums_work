"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitorsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const monitors_1 = require("../data/monitors");
const pinger_1 = require("../services/pinger");
const environment_1 = require("../utils/environment");
const schema_1 = require("../db/schema");
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const router = (0, express_1.Router)();
exports.monitorsRouter = router;
const createMonitorSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Name is required'),
    url: zod_1.z.string().url('Must be a valid URL').startsWith('http', 'URL must start with http:// or https://').optional(),
    environment: zod_1.z.enum(['Dev', 'QA', 'Prod']).optional(),
    discoveredAppId: zod_1.z.string().uuid().optional(),
}).refine((data) => data.url || data.discoveredAppId, { message: 'either url or discoveredAppId is required' });
const bulkItemSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    url: zod_1.z.string().url().startsWith('http'),
});
const enableSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
});
// GET /api/monitors
router.get('/', async (req, res) => {
    try {
        const all = await (0, monitors_1.getAllMonitors)();
        res.json({ monitors: all });
    }
    catch (error) {
        console.error('[monitors] GET / error:', error);
        res.status(500).json({ error: 'Failed to fetch monitors' });
    }
});
// GET /api/monitors/:id
router.get('/:id', async (req, res) => {
    try {
        const monitor = await (0, monitors_1.getMonitorById)(req.params.id);
        if (!monitor)
            return res.status(404).json({ error: 'Monitor not found' });
        res.json({ monitor });
    }
    catch (error) {
        console.error('[monitors] GET /:id error:', error);
        res.status(500).json({ error: 'Failed to fetch monitor' });
    }
});
// GET /api/monitors/:id/history
router.get('/:id/history', async (req, res) => {
    try {
        const history = await (0, monitors_1.getMonitorHistory)(req.params.id, 100);
        res.json({ history });
    }
    catch (error) {
        console.error('[monitors] GET /:id/history error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});
// GET /api/monitors/aggregate/health - last N checks across all monitors
router.get('/aggregate/health', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 60;
        const safelimit = Math.min(limit, 200); //sets the boundary for the aggregate
        const checks = await db_1.db.select({
            checkedAt: schema_1.checkResults.checkedAt,
            status: schema_1.checkResults.status
        }).from(schema_1.checkResults).orderBy((0, drizzle_orm_1.desc)(schema_1.checkResults.checkedAt)).limit(safelimit);
        // aggregate by minute bucket. keep all three status buckets so the frontend
        // can render a true stacked area instead of a derived percentage.
        const aggregated = new Map();
        for (const check of checks) {
            const time = new Date(check.checkedAt);
            time.setSeconds(0, 0);
            const key = time.toISOString();
            const existing = aggregated.get(key);
            if (existing) {
                existing.total++;
                if (check.status === 'UP')
                    existing.up++;
                else if (check.status === 'DOWN')
                    existing.down++;
                else if (check.status === 'UNKNOWN')
                    existing.unknown++;
            }
            else {
                aggregated.set(key, {
                    time,
                    up: check.status === 'UP' ? 1 : 0,
                    down: check.status === 'DOWN' ? 1 : 0,
                    unknown: check.status === 'UNKNOWN' ? 1 : 0,
                    total: 1,
                });
            }
        }
        const sorted = Array.from(aggregated.values())
            .sort((a, b) => a.time.getTime() - b.time.getTime())
            .map((b) => ({
            timestamp: b.time.toISOString(),
            // keep healthscore for any existing consumers
            healthScore: b.total > 0 ? Math.round((b.up / b.total) * 100) : 0,
            upCount: b.up,
            downCount: b.down,
            unknownCount: b.unknown,
            totalCount: b.total,
        }));
        res.json({ data: sorted });
    }
    catch (error) {
        console.error('[monitors] GET /aggregate/health error:', error);
        res.status(500).json({ error: 'Failed to fetch aggregate health' });
    }
});
// GET /api/monitors/:id/transitions
router.get('/:id/transitions', async (req, res) => {
    try {
        const transitions = await (0, monitors_1.getStateTransitions)(req.params.id, 50);
        res.json({ transitions });
    }
    catch (error) {
        console.error('[monitors] GET /:id/transitions error:', error);
        res.status(500).json({ error: 'Failed to fetch transitions' });
    }
});
// POST /api/monitors (manual create)
router.post('/', async (req, res) => {
    try {
        const parsed = createMonitorSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Validation failed',
                details: parsed.error.flatten().fieldErrors,
            });
        }
        const { name, url, environment, discoveredAppId } = parsed.data;
        const monitor = await (0, monitors_1.createMonitor)({
            name,
            url,
            environment: environment ?? (url ? (0, environment_1.inferEnvironment)(url) : 'Dev'),
            discoveredAppId,
        });
        res.status(201).json(monitor);
    }
    catch (error) {
        console.error('[monitors] POST / error:', error);
        res.status(500).json({ error: 'Failed to create monitor' });
    }
});
// POST /api/monitors/bulk — parallel with bounded concurrency
router.post('/bulk', async (req, res) => {
    try {
        const { monitors: items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'monitors array is required' });
        }
        const validationResults = items.map((item, index) => ({
            index,
            parsed: bulkItemSchema.safeParse(item),
        }));
        const failures = validationResults
            .filter((r) => !r.parsed.success)
            .map((r) => ({
            index: r.index,
            errors: r.parsed.error.flatten().fieldErrors,
        }));
        if (failures.length > 0) {
            return res.status(400).json({
                error: 'Some items failed validation',
                failures,
            });
        }
        const validItems = validationResults
            .filter((r) => r.parsed.success)
            .map((r) => r.parsed.data);
        const { default: pLimit } = await import('p-limit');
        const limit = pLimit(5);
        const results = await Promise.all(validItems.map((item) => limit(async () => {
            const { name, url } = item;
            const pingResult = await (0, pinger_1.pingUrl)(url);
            const monitor = await (0, monitors_1.createMonitor)({
                name,
                url,
                environment: (0, environment_1.inferEnvironment)(url),
            });
            return (0, monitors_1.updateMonitorStatus)(monitor.id, pingResult);
        })));
        res.status(201).json(results);
    }
    catch (error) {
        console.error('[monitors] POST /bulk error:', error);
        res.status(500).json({ error: 'Failed to bulk create monitors' });
    }
});
// PATCH /api/monitors/:id/enable
router.patch('/:id/enable', async (req, res) => {
    try {
        const parsed = enableSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Validation failed',
                details: parsed.error.flatten().fieldErrors,
            });
        }
        const updated = await (0, monitors_1.toggleMonitor)(req.params.id, parsed.data.enabled);
        if (!updated)
            return res.status(404).json({ error: 'Monitor not found' });
        res.json({ monitor: updated });
    }
    catch (error) {
        console.error('[monitors] PATCH /:id/enable error:', error);
        res.status(500).json({ error: 'Failed to update monitor' });
    }
});
// DELETE /api/monitors/:id
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await (0, monitors_1.deleteMonitor)(req.params.id);
        if (!deleted)
            return res.status(404).json({ error: 'Monitor not found' });
        res.json({ deleted: true, monitor: deleted });
    }
    catch (error) {
        console.error('[monitors] DELETE /:id error:', error);
        res.status(500).json({ error: 'Failed to delete monitor' });
    }
});
