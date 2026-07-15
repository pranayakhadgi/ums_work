"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const router = (0, express_1.Router)();
// GET /api/health/latest — latest snapshot per connector
router.get('/latest', async (req, res) => {
    try {
        //fetch last 50 snapshots, then deduplicate in memory
        const rows = await db_1.db
            .select()
            .from(schema_1.instanceHealthSnapshots)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.instanceHealthSnapshots.collectedAt))
            .limit(50);
        // Keep only the latest per connector
        const latestMap = new Map();
        for (const row of rows) {
            const existing = latestMap.get(row.connectorName);
            if (!existing) {
                latestMap.set(row.connectorName, row);
                continue;
            }
            const existingTime = existing.collectedAt ? new Date(existing.collectedAt).getTime() : 0;
            const rowTime = row.collectedAt ? new Date(row.collectedAt).getTime() : 0;
            if (rowTime > existingTime) {
                latestMap.set(row.connectorName, row);
            }
        }
        res.json({ success: true, data: Array.from(latestMap.values()) });
    }
    catch (err) {
        console.error('[health] GET /latest error:', err);
        res.status(500).json({ success: false, error: String(err) });
    }
});
// GET /api/health/history?connector=http-nio-8080
router.get('/history', async (req, res) => {
    const { connector, limit = '50' } = req.query;
    try {
        const whereClause = connector
            ? (0, drizzle_orm_1.eq)(schema_1.instanceHealthSnapshots.connectorName, connector)
            : undefined;
        const data = await db_1.db.select().from(schema_1.instanceHealthSnapshots)
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.instanceHealthSnapshots.collectedAt))
            .limit(parseInt(limit, 10));
        res.json({ success: true, data });
    }
    catch (err) {
        console.error('[health] GET /history error:', err);
        res.status(500).json({ success: false, error: String(err) });
    }
});
exports.default = router;
