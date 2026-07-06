import { Router } from 'express';
import { db } from '../db';
import { jvmSnapshots } from '../db/schema';
import { desc } from 'drizzle-orm';

const router = Router();

router.get('/latest', async (req, res) => {
    try {
        const latest = await db.select().from(jvmSnapshots)
            .orderBy(desc(jvmSnapshots.collectedAt))
            .limit(5);
        res.json({ success: true, data: latest });
    } catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});

export default router;