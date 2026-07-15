"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoveryRouter = void 0;
// backend/src/routes/discovery.ts
const express_1 = require("express");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const tomcatScraper_1 = require("../services/tomcatScraper");
const crypto_1 = require("crypto");
const instances_1 = require("../data/instances");
const router = (0, express_1.Router)();
exports.discoveryRouter = router;
function getEnv() {
    return {
        promote: process.env.AUTO_PROMOTE || '',
    };
}
// POST /api/discovery — trigger scan, return discovered apps
router.post('/', async (req, res) => {
    const startTime = Date.now();
    try {
        const apps = await (0, tomcatScraper_1.discoverApps)();
        const instance = await (0, instances_1.getOrCreateDefaultInstance)();
        const instanceId = instance.id;
        // Upsert discovered apps
        const results = [];
        for (const app of apps) {
            const existing = await db_1.db.select().from(schema_1.discoveredApps).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discoveredApps.contextPath, app.contextPath), (0, drizzle_orm_1.eq)(schema_1.discoveredApps.instanceId, instanceId)));
            if (existing.length === 0) {
                const [inserted] = await db_1.db.insert(schema_1.discoveredApps).values({
                    id: (0, crypto_1.randomUUID)(),
                    instanceId,
                    name: app.displayName || app.contextPath,
                    contextPath: app.contextPath,
                    tomcatState: app.state,
                    discoveredAt: new Date(),
                    lastSeenAt: new Date(),
                    isPromoted: false,
                }).returning();
                results.push({ action: 'inserted', app: inserted });
            }
            else {
                await db_1.db.update(schema_1.discoveredApps)
                    .set({ lastSeenAt: new Date(), tomcatState: app.state })
                    .where((0, drizzle_orm_1.eq)(schema_1.discoveredApps.id, existing[0].id));
                results.push({ action: 'updated', app: existing[0] });
            }
        }
        res.status(200).json({
            meta: {
                discovered: apps.length,
                durationMs: Date.now() - startTime,
            },
            apps: results.map(r => r.app),
        });
    }
    catch (error) {
        console.error('[discover] POST / error:', error);
        res.status(502).json({ error: 'Discovery failed', message: error.message });
    }
});
// GET /api/discover/candidates — all discovered apps
router.get('/candidates', async (req, res) => {
    const env = getEnv();
    try {
        const candidates = await db_1.db.select().from(schema_1.discoveredApps).orderBy((0, drizzle_orm_1.desc)(schema_1.discoveredApps.discoveredAt));
        res.json({ success: true, data: candidates, meta: { autoPromote: env.promote !== 'off', mode: env.promote }, });
    }
    catch (error) {
        console.error('[discovery] GET /candidates error:', error);
        res.status(500).json({ error: 'Failed to fetch candidates' });
    }
});
// GET /api/discovery/debug — raw scraper output, no DB write
router.get('/debug', async (req, res) => {
    try {
        const [apps, health, jvm] = await Promise.all([
            (0, tomcatScraper_1.discoverApps)(),
            (0, tomcatScraper_1.fetchInstanceHealth)(),
            (0, tomcatScraper_1.fetchJvmSnapshot)(),
        ]);
        res.json({
            success: true,
            appCount: apps.length,
            apps: apps.slice(0, 10),
            healthConnectors: health.connectors.length,
            memoryInfo: health.memoryInfo,
            jvmRuntime: jvm.runtimeInfo,
            jvmOs: jvm.osInfo,
            jvmPoolCount: jvm.memoryPools?.length,
            jvmPools: jvm.memoryPools,
            jvmGcCount: jvm.gcInfo?.length,
            jvmGc: jvm.gcInfo,
        });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message, stack: error.stack });
    }
});
