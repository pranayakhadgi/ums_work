/**
 * Express router for JVM snapshot data
 */
import { Router } from 'express';
import { db } from '../db';
import { jvmSnapshots } from '../db/schema';
import { desc, eq } from 'drizzle-orm';

const router = Router();

router.get('/latest', async (req, res) => {
    try {
        const { instanceId } = req.query;
        const query = db.select().from(jvmSnapshots).orderBy(desc(jvmSnapshots.collectedAt));

        const rows = instanceId && typeof instanceId === 'string'
            ? await query.where(eq(jvmSnapshots.instanceId, instanceId)).limit(5)
            : await query.limit(5);

        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});

export default router;