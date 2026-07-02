import { Router } from 'express';
import { db } from '../db';
import { tomcatInstances } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  getDiscoveredCandidates,
  upsertDiscoveredApp,
  promoteCandidate,
} from '../data/monitors';
import { scrapeTomcatStatus } from '../services/tomcatScraper';

const router = Router();

// Legacy: POST /api/discover — frontend-compatible
router.post('/', async (req, res) => {
  const startTime = Date.now();

  try {
    let endpoints;
    try {
      endpoints = await scrapeTomcatStatus();
    } catch (error: any) {
      return res.status(502).json({
        error: 'Discovery failed',
        source: 'tomcat-scraper',
        message: error.message,
        results: [],
      });
    }

    // Find or create default instance
    let instance = await db.select().from(tomcatInstances).limit(1);
    let instanceId: string;

    if (instance.length === 0) {
      const [newInstance] = await db
        .insert(tomcatInstances)
        .values({
          name: 'Default Tomcat',
          scheme: process.env.TOMCAT_SCHEME ?? 'http',
          host: process.env.TOMCAT_HOST ?? 'localhost',
          port: parseInt(process.env.TOMCAT_PORT ?? '8080'),
          managerUrl: process.env.TOMCAT_STATUS_URL ?? 'http://localhost:8080/manager/text/list',
          managerUser: process.env.TOMCAT_USER ?? 'admin',
          managerPass: process.env.TOMCAT_PASS ?? 'admin',
          environment: 'Dev',
        })
        .returning();
      instanceId = newInstance.id;
    } else {
      instanceId = instance[0].id;
    }

    // Parallel health check with bounded concurrency
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(5);

    const checkPromises = endpoints.map((endpoint: any) =>
      limit(async () => {
        try {
          const { pingUrl } = await import('../services/pinger');
          const { createMonitor, updateMonitorStatus } = await import('../data/monitors');

          const pingResult = await pingUrl(endpoint.url);

          await upsertDiscoveredApp({
            instanceId,
            name: endpoint.name,
            contextPath: endpoint.name.startsWith('/') ? endpoint.name : `/${endpoint.name}`,
            tomcatState: 'running',
          });

          const monitor = await createMonitor({
            name: endpoint.name,
            url: endpoint.url,
            environment: 'Dev',
          });

          const updated = await updateMonitorStatus(monitor.id, pingResult);
          return { success: true, monitor: updated };
        } catch (error: any) {
          return {
            success: false,
            endpoint,
            error: error.message,
            errorCategory: error.code || 'UNKNOWN',
          };
        }
      })
    );

    const checkResults = await Promise.all(checkPromises);

    const monitors = checkResults
      .filter((r: any) => r.success)
      .map((r: any) => r.monitor);
    const failures = checkResults
      .filter((r: any) => !r.success)
      .map((r: any) => ({
        name: r.endpoint.name,
        url: r.endpoint.url,
        error: r.error,
        category: r.errorCategory,
      }));

    res.status(200).json({
      meta: {
        discovered: endpoints.length,
        registered: monitors.length,
        failed: failures.length,
        durationMs: Date.now() - startTime,
      },
      monitors,
      failures,
    });
  } catch (error: any) {
    console.error('[discover] POST / error:', error);
    res.status(500).json({ error: 'Discovery pipeline failed', message: error.message });
  }
});

// NEW: GET /api/discover/candidates
router.get('/candidates', async (req, res) => {
  try {
    const candidates = await getDiscoveredCandidates();
    res.json({ candidates });
  } catch (error) {
    console.error('[discovery] GET /candidates error:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

// NEW: POST /api/discover/scan
router.post('/scan', async (req, res) => {
  const startTime = Date.now();

  try {
    const endpoints = await scrapeTomcatStatus();

    let instance = await db.select().from(tomcatInstances).limit(1);
    let instanceId: string;

    if (instance.length === 0) {
      const [newInstance] = await db
        .insert(tomcatInstances)
        .values({
          name: 'Default Tomcat',
          scheme: process.env.TOMCAT_SCHEME ?? 'http',
          host: process.env.TOMCAT_HOST ?? 'localhost',
          port: parseInt(process.env.TOMCAT_PORT ?? '8080'),
          managerUrl: process.env.TOMCAT_STATUS_URL ?? 'http://localhost:8080/manager/text/list',
          managerUser: process.env.TOMCAT_USER ?? 'admin',
          managerPass: process.env.TOMCAT_PASS ?? 'admin',
          environment: 'Dev',
        })
        .returning();
      instanceId = newInstance.id;
    } else {
      instanceId = instance[0].id;
    }

    const upserted = [];
    for (const endpoint of endpoints) {
      const app = await upsertDiscoveredApp({
        instanceId,
        name: endpoint.name,
        contextPath: endpoint.name.startsWith('/') ? endpoint.name : `/${endpoint.name}`,
        tomcatState: 'running',
      });
      upserted.push(app);
    }

    res.json({
      meta: {
        discovered: endpoints.length,
        upserted: upserted.length,
        durationMs: Date.now() - startTime,
      },
      candidates: upserted,
    });
  } catch (error: any) {
    console.error('[discovery] POST /scan error:', error);
    res.status(502).json({ error: 'Scan failed', message: error.message });
  }
});

// NEW: POST /api/discover/promote
router.post('/promote', async (req, res) => {
  try {
    const { candidateId, healthCheckPath, customUrl } = req.body;
    if (!candidateId) {
      return res.status(400).json({ error: 'candidateId is required' });
    }

    const monitor = await promoteCandidate(candidateId, {
      healthCheckPath: healthCheckPath ?? '/',
      customUrl,
    });

    if (!monitor) {
      return res.status(404).json({ error: 'Candidate not found or instance missing' });
    }

    res.status(201).json({ monitor });
  } catch (error) {
    console.error('[discovery] POST /promote error:', error);
    res.status(500).json({ error: 'Failed to promote candidate' });
  }
});

export { router as discoveryRouter };