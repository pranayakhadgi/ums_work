"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitorsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const monitors_1 = require("../data/monitors");
const environment_1 = require("../utils/environment");
const schema_1 = require("../db/schema");
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const healthScore_1 = require("../services/healthScore");
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
// GET /api/monitors/aggregate/health
// Query params:
//   ?window=N  — look-back in hours, default 4, max 24
//   ?bucket=N  — bucket width in minutes, default 5, max 60
// Returns ONLY buckets that contain at least one check (sparse).
// Field names match frontend contracts: up, down, unknown, total, t, timestamp, etc.
router.get('/aggregate/health', async (req, res) => {
    try {
        const windowHours = Math.min(24, Math.max(1, parseInt(String(req.query.window ?? '4'), 10) || 4));
        const bucketMinutes = Math.min(60, Math.max(1, parseInt(String(req.query.bucket ?? '5'), 10) || 5));
        const bucketMs = bucketMinutes * 60_000;
        const now = Date.now();
        const windowStart = new Date(now - windowHours * 60 * 60 * 1000);
        // Fetch all checks in the window, ascending
        const rawChecks = await db_1.db
            .select({
            checkedAt: schema_1.checkResults.checkedAt,
            status: schema_1.checkResults.status,
            responseTimeMs: schema_1.checkResults.responseTimeMs,
            errorCategory: schema_1.checkResults.errorCategory,
            monitorId: schema_1.checkResults.monitorId,
        })
            .from(schema_1.checkResults)
            .where((0, drizzle_orm_1.gte)(schema_1.checkResults.checkedAt, windowStart))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.checkResults.checkedAt));
        // Aggregate into sparse buckets keyed by floor(ts / bucketMs)
        const bucketMap = new Map();
        for (const check of rawChecks) {
            const ts = new Date(check.checkedAt).getTime();
            const key = Math.floor(ts / bucketMs) * bucketMs;
            if (!bucketMap.has(key)) {
                bucketMap.set(key, { key, up: 0, down: 0, unknown: 0, total: 0, latencies: [], degradedChecks: 0, errorCategories: [] });
            }
            const b = bucketMap.get(key);
            b.total++;
            if (check.status === 'UP')
                b.up++;
            else if (check.status === 'DOWN')
                b.down++;
            else
                b.unknown++;
            if (check.responseTimeMs != null)
                b.latencies.push(check.responseTimeMs);
            if (check.errorCategory != null) {
                b.errorCategories.push(check.errorCategory);
                if (check.status === 'UP')
                    b.degradedChecks++;
            }
        }
        // Build response — only buckets with data, sorted ascending
        const data = Array.from(bucketMap.values())
            .sort((a, b) => a.key - b.key)
            .map((b) => {
            const scoreResult = (0, healthScore_1.calculateHealthScore)({
                latencies: b.latencies,
                degradedChecks: b.degradedChecks,
                downChecks: b.down,
                totalChecks: b.total,
            });
            const avgLatency = b.latencies.length > 0
                ? Math.round(b.latencies.reduce((a, c) => a + c, 0) / b.latencies.length)
                : 0;
            const sortedLat = [...b.latencies].sort((a, c) => a - c);
            const p95Latency = sortedLat.length > 0
                ? sortedLat[Math.floor(sortedLat.length * 0.95)]
                : 0;
            const totalUp = b.total - b.down;
            const degradedRate = totalUp > 0 ? Math.round((b.degradedChecks / totalUp) * 100) : 0;
            const downRate = b.total > 0 ? Math.round((b.down / b.total) * 100) : 0;
            return {
                timestamp: new Date(b.key).toISOString(),
                t: b.key,
                up: b.up,
                down: b.down,
                unknown: b.unknown,
                total: b.total,
                healthScore: scoreResult.score,
                avgLatency,
                p95Latency,
                degradedRate,
                downRate,
            };
        });
        res.json({ data });
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
