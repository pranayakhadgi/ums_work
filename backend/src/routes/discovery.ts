/**
 * Express router for Tomcat app discovery, candidate listing, and debug endpoints
 */
import { Router } from 'express';
import { db } from '../db';
import { discoveredApps, tomcatInstances } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { discoverApps, fetchInstanceHealth, fetchJvmSnapshot, TomcatInstance } from '../services/tomcatScraper';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const router = Router();


// POST /api/discovery — trigger scan, return discovered apps
router.post('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const schema = z.object({
      instanceId: z.string().optional(),
    });
    const { instanceId: requestedInstanceId } = schema.parse(req.body);

    let instance: TomcatInstance;
    if (requestedInstanceId) {
      const instances = await db.select().from(tomcatInstances).where(eq(tomcatInstances.id, requestedInstanceId));
      if (instances.length === 0) {
        return res.status(404).json({ error: 'Instance not found' });
      }
      instance = instances[0];
    } else {
      const instances = await db.select().from(tomcatInstances).where(eq(tomcatInstances.isActive, true));
      if (instances.length === 0) {
        return res.status(400).json({ error: 'No active instances found' });
      }
      instance = instances[0];
    }

    const apps = await discoverApps(instance);
    const results = [];
    for (const app of apps) {
      const existing = await db.select().from(discoveredApps).where(
        and(eq(discoveredApps.contextPath, app.contextPath), eq(discoveredApps.instanceId, instance.id))
      );

      if (existing.length === 0) {
        const [inserted] = await db.insert(discoveredApps).values({
          id: randomUUID(),
          instanceId: instance.id,
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
        instanceId: instance.id,
        instanceName: instance.name,
      },
      apps: results.map(r => r.app),
    });
  } catch (error: any) {
    console.error('[discover] POST / error:', error);
    res.status(502).json({ error: 'Discovery failed', message: error.message });
  }
});

// GET /api/discovery/candidates — all discovered apps
router.get('/candidates', async (req, res) => {
  try {
    const { instanceId } = req.query;
    let candidates;
    
    if (instanceId && typeof instanceId === 'string') {
      candidates = await db.select().from(discoveredApps)
        .where(eq(discoveredApps.instanceId, instanceId))
        .orderBy(desc(discoveredApps.discoveredAt));
    } else {
      candidates = await db.select().from(discoveredApps).orderBy(desc(discoveredApps.discoveredAt));
    }
    
    res.json({ success: true, data: candidates });
  } catch (error) {
    console.error('[discovery] GET /candidates error:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

// GET /api/discovery/debug — raw scraper output, no DB write
router.get('/debug', async (req, res) => {
  try {
    const { instanceId } = req.query;
    let instance: TomcatInstance;
    
    if (instanceId && typeof instanceId === 'string') {
      const instances = await db.select().from(tomcatInstances).where(eq(tomcatInstances.id, instanceId));
      if (instances.length === 0) {
        return res.status(404).json({ error: 'Instance not found' });
      }
      instance = instances[0];
    } else {
      const instances = await db.select().from(tomcatInstances).where(eq(tomcatInstances.isActive, true));
      if (instances.length === 0) {
        return res.status(400).json({ error: 'No active instances found' });
      }
      instance = instances[0];
    }

    const [apps, health, jvm] = await Promise.all([
      discoverApps(instance),
      fetchInstanceHealth(instance),
      fetchJvmSnapshot(instance),
    ]);
    res.json({
      success: true,
      instanceId: instance.id,
      instanceName: instance.name,
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});

export { router as discoveryRouter };