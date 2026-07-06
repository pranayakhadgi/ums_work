// backend/src/routes/discovery.ts
import { Router } from 'express';
import { db } from '../db';
import { discoveredApps } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { discoverApps } from '../services/tomcatScraper';
import { randomUUID } from 'crypto';
import { getOrCreateDefaultInstance } from '../data/instances';

const router = Router();

// POST /api/discovery — trigger scan, return discovered apps
router.post('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const apps = await discoverApps();

    const instance = await getOrCreateDefaultInstance();
    const instanceId = instance.id;

    // Upsert discovered apps
    const results = [];
    for (const app of apps) {
      const existing = await db.select().from(discoveredApps).where(
        and(eq(discoveredApps.contextPath, app.contextPath), eq(discoveredApps.instanceId, instanceId))
      );

      if (existing.length === 0) {
        const [inserted] = await db.insert(discoveredApps).values({
          id: randomUUID(),
          instanceId,
          name: app.displayName || app.contextPath,
          contextPath: app.contextPath,
          tomcatState: app.state,
          discoveredAt: new Date(),
          lastSeenAt: new Date(),
          isPromoted: false,
        }).returning();
        results.push({ action: 'inserted', app: inserted });
      } else {
        await db.update(discoveredApps)
          .set({ lastSeenAt: new Date(), tomcatState: app.state })
          .where(eq(discoveredApps.id, existing[0].id));
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
  } catch (error: any) {
    console.error('[discover] POST / error:', error);
    res.status(502).json({ error: 'Discovery failed', message: error.message });
  }
});

// GET /api/discover/candidates — all discovered apps
router.get('/candidates', async (req, res) => {
  try {
    const candidates = await db.select().from(discoveredApps).orderBy(desc(discoveredApps.discoveredAt));
    res.json({ success: true, data: candidates });
  } catch (error) {
    console.error('[discovery] GET /candidates error:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

export { router as discoveryRouter };