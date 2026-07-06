import { Router } from 'express';
import { db } from '../db';
import { instanceHealthSnapshots } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

// GET /api/health/latest — latest snapshot for default instance
router.get('/latest', async (req, res) => {
    try {
        const latest = await db.select().from(instanceHealthSnapshots)
            .orderBy(desc(instanceHealthSnapshots.collectedAt))
            .limit(10);
        res.json({ success: true, data: latest });
    } catch (err) {
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
        res.status(500).json({ success: false, error: String(err) });
    }
});

export default router;