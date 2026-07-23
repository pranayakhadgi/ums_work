/**
 * Express router for instance health snapshots — latest per connector and historical data
 */
import { Router } from 'express';
import { db } from '../db';
import { instanceHealthSnapshots } from '../db/schema';
import { eq, desc } from 'drizzle-orm';


const router = Router();

// GET /api/health/latest — latest snapshot per connector
router.get('/latest', async (req, res) => {
    try {
        const { instanceId } = req.query;

        // Fetch last 50 snapshots (filtered by instance if provided), then deduplicate by connector in memory
        const query = db
            .select()
            .from(instanceHealthSnapshots)
            .orderBy(desc(instanceHealthSnapshots.collectedAt))
            .limit(50);

        const rows = instanceId && typeof instanceId === 'string'
            ? await query.where(eq(instanceHealthSnapshots.instanceId, instanceId))
            : await query;

        // Keep only the latest per connector
        const latestMap = new Map<string, typeof rows[number]>();
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
    } catch (err) {
        console.error('[health] GET /latest error:', err);
        res.status(500).json({ success: false, error: String(err) });
    }
});

// GET /api/health/history?connector=http-nio-8080
router.get('/history', async (req, res) => {
    const { connector, limit = '50' } = req.query;
    try {
        const whereClause = connector
            ? eq(instanceHealthSnapshots.connectorName, connector as string)
            : undefined;

        const data = await db.select().from(instanceHealthSnapshots)
            .where(whereClause)
            .orderBy(desc(instanceHealthSnapshots.collectedAt))
            .limit(parseInt(limit as string, 10));

        res.json({ success: true, data });
    } catch (err) {
        console.error('[health] GET /history error:', err);
        res.status(500).json({ success: false, error: String(err) });
    }
});

export default router;