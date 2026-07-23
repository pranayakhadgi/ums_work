/**
 * Express router for monitor CRUD, history, aggregate health, and enable/disable endpoints
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  getAllMonitors,
  getMonitorById,
  createMonitor,
  updateMonitorStatus,
  getMonitorHistory,
  getStateTransitions,
  toggleMonitor,
  deleteMonitor,
} from '../data/monitors';
import { pingUrl } from '../services/pinger';
import { inferEnvironment } from '../utils/environment';
import { checkResults, monitors, discoveredApps } from '../db/schema';
import { db } from '../db';
import { desc, gte, asc, eq, and, inArray } from 'drizzle-orm';
import { calculateHealthScore } from '../services/healthScore';

const router = Router();

const createMonitorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z.string().url('Must be a valid URL').startsWith('http', 'URL must start with http:// or https://').optional(),
  environment: z.enum(['Dev', 'QA', 'Prod']).optional(),
  discoveredAppId: z.string().uuid().optional(),
}).refine(
  (data) => data.url || data.discoveredAppId,
  { message: 'either url or discoveredAppId is required' }
);

const bulkItemSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().startsWith('http'),
});

const enableSchema = z.object({
  enabled: z.boolean(),
});

// GET /api/monitors
router.get('/', async (req, res) => {
  try {
    const { instanceId } = req.query;
    const all = await getAllMonitors(instanceId as string | undefined);
    res.json({ monitors: all });
  } catch (error) {
    console.error('[monitors] GET / error:', error);
    res.status(500).json({ error: 'Failed to fetch monitors' });
  }
});

// GET /api/monitors/history — per-monitor status history for heatstrip
router.get('/history', async (req, res) => {
  try {
    const windowHours = Math.min(168, Math.max(1, parseInt(String(req.query.window ?? '24'), 10) || 24));
    const bucketMinutes = Math.min(60, Math.max(1, parseInt(String(req.query.bucket ?? '30'), 10) || 30));
    const bucketMs = bucketMinutes * 60_000;
    const { instanceId, limit } = req.query;

    const now = Date.now();
    const windowStart = new Date(now - windowHours * 60 * 60 * 1000);
    const bucketCount = Math.ceil((windowHours * 60) / bucketMinutes);

    let limitNum: number | undefined;
    if (limit) {
      const parsed = parseInt(String(limit), 10);
      limitNum = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }

    let monitorRows: { id: string; name: string; url: string }[];
    if (instanceId && typeof instanceId === 'string') {
      const query = db
        .select({ id: monitors.id, name: monitors.name, url: monitors.url })
        .from(monitors)
        .innerJoin(discoveredApps, eq(monitors.discoveredAppId, discoveredApps.id))
        .where(eq(discoveredApps.instanceId, instanceId))
        .orderBy(asc(monitors.name));
      monitorRows = limitNum ? await query.limit(limitNum) : await query;
    } else {
      const query = db
        .select({ id: monitors.id, name: monitors.name, url: monitors.url })
        .from(monitors)
        .orderBy(asc(monitors.name));
      monitorRows = limitNum ? await query.limit(limitNum) : await query;
    }

    if (monitorRows.length === 0) {
      return res.json({ window: windowHours, bucketMinutes, monitors: [] });
    }

    const monitorIds = monitorRows.map(m => m.id);

    const rawChecks = await db
      .select({
        checkedAt: checkResults.checkedAt,
        status: checkResults.status,
        monitorId: checkResults.monitorId,
      })
      .from(checkResults)
      .where(and(gte(checkResults.checkedAt, windowStart), inArray(checkResults.monitorId, monitorIds)))
      .orderBy(asc(checkResults.checkedAt));

    const STATUS_SEVERITY: Record<string, number> = { DOWN: 2, UNKNOWN: 1, UP: 0 };
    const bucketMap = new Map<string, Map<number, string>>();
    for (const id of monitorIds) bucketMap.set(id, new Map());

    for (const check of rawChecks) {
      const checkedAtMs = check.checkedAt.getTime();
      let bucketIndex = Math.floor((checkedAtMs - windowStart.getTime()) / bucketMs);
      if (bucketIndex >= bucketCount) bucketIndex = bucketCount - 1;
      if (bucketIndex < 0) continue;

      const monitorBuckets = bucketMap.get(check.monitorId);
      if (!monitorBuckets) continue;

      const normalizedStatus = check.status in STATUS_SEVERITY ? check.status : 'UNKNOWN';
      const existing = monitorBuckets.get(bucketIndex);
      if (!existing || STATUS_SEVERITY[normalizedStatus] > STATUS_SEVERITY[existing]) {
        monitorBuckets.set(bucketIndex, normalizedStatus);
      }
    }

    const responseMonitors = monitorRows.map(monitor => {
      const monitorBuckets = bucketMap.get(monitor.id)!;
      const history = [];
      for (let i = 0; i < bucketCount; i++) {
        const timestamp = new Date(windowStart.getTime() + i * bucketMs).toISOString();
        history.push({ timestamp, status: monitorBuckets.get(i) ?? 'UNKNOWN' });
      }
      return { id: monitor.id, name: monitor.name, url: monitor.url, history };
    });

    res.json({ window: windowHours, bucketMinutes, monitors: responseMonitors });
  } catch (error: any) {
    console.error('[monitors] GET /history error:', error);
    res.status(500).json({ error: 'Failed to fetch monitor history', message: error.message });
  }
});

// GET /api/monitors/:id
router.get('/:id', async (req, res) => {
  try {
    const monitor = await getMonitorById(req.params.id);
    if (!monitor) return res.status(404).json({ error: 'Monitor not found' });
    res.json({ monitor });
  } catch (error) {
    console.error('[monitors] GET /:id error:', error);
    res.status(500).json({ error: 'Failed to fetch monitor' });
  }
});

// GET /api/monitors/:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const history = await getMonitorHistory(req.params.id, 100);
    res.json({ history });
  } catch (error) {
    console.error('[monitors] GET /:id/history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/monitors/aggregate/health
// Query params:
//   ?window=N  — look-back in hours, default 4, max 24
//   ?bucket=N  — bucket width in minutes, default 5, max 60
//   ?instanceId=... — filter by specific instance
// Returns a dense series of bucketCount entries (empty buckets included).
// Field names match frontend contracts: up, down, unknown, total, t, timestamp, etc.
router.get('/aggregate/health', async (req, res) => {
  try {
    const windowHours  = Math.min(24, Math.max(1, parseInt(String(req.query.window  ?? '4'),  10) || 4));
    const bucketMinutes = Math.min(60, Math.max(1, parseInt(String(req.query.bucket ?? '5'),  10) || 5));
    const bucketMs = bucketMinutes * 60_000;
    const { instanceId } = req.query;

    const now = Date.now();
    const windowStartMs = now - windowHours * 60 * 60 * 1000;
    const bucketCount = Math.ceil((windowHours * 60) / bucketMinutes);

    let rawChecks;
    if (instanceId && typeof instanceId === 'string') {
      rawChecks = await db
        .select({
          checkedAt:    checkResults.checkedAt,
          status:       checkResults.status,
          responseTimeMs: checkResults.responseTimeMs,
          errorCategory:  checkResults.errorCategory,
          monitorId:    checkResults.monitorId,
        })
        .from(checkResults)
        .innerJoin(monitors, eq(checkResults.monitorId, monitors.id))
        .innerJoin(discoveredApps, eq(monitors.discoveredAppId, discoveredApps.id))
        .where(and(gte(checkResults.checkedAt, new Date(windowStartMs)), eq(discoveredApps.instanceId, instanceId)))
        .orderBy(asc(checkResults.checkedAt));
    } else {
      rawChecks = await db
        .select({
          checkedAt:    checkResults.checkedAt,
          status:       checkResults.status,
          responseTimeMs: checkResults.responseTimeMs,
          errorCategory:  checkResults.errorCategory,
          monitorId:    checkResults.monitorId,
        })
        .from(checkResults)
        .where(gte(checkResults.checkedAt, new Date(windowStartMs)))
        .orderBy(asc(checkResults.checkedAt));
    }

    const bucketMap = new Map<number, {
      key: number;
      up: number;
      down: number;
      unknown: number;
      total: number;
      latencies: number[];
      degradedChecks: number;
      errorCategories: string[];
    }>();

    for (const check of rawChecks) {
      const ts = new Date(check.checkedAt).getTime();
      let bucketIndex = Math.floor((ts - windowStartMs) / bucketMs);
      if (bucketIndex >= bucketCount) bucketIndex = bucketCount - 1;
      if (bucketIndex < 0) continue;

      const key = windowStartMs + bucketIndex * bucketMs;

      if (!bucketMap.has(key)) {
        bucketMap.set(key, { key, up: 0, down: 0, unknown: 0, total: 0, latencies: [], degradedChecks: 0, errorCategories: [] });
      }
      const b = bucketMap.get(key)!;
      b.total++;

      if      (check.status === 'UP')   b.up++;
      else if (check.status === 'DOWN') b.down++;
      else                              b.unknown++;

      if (check.responseTimeMs != null) b.latencies.push(check.responseTimeMs);

      if (check.errorCategory != null) {
        b.errorCategories.push(check.errorCategory);
        if (check.status === 'UP') b.degradedChecks++;
      }
    }

    const emptyBucket = (key: number) => ({
      key, up: 0, down: 0, unknown: 0, total: 0, latencies: [] as number[], degradedChecks: 0, errorCategories: [] as string[],
    });

    const data = [];
    for (let i = 0; i < bucketCount; i++) {
      const key = windowStartMs + i * bucketMs;
      const b = bucketMap.get(key) ?? emptyBucket(key);

      const scoreResult = b.total > 0
        ? calculateHealthScore({
            latencies: b.latencies,
            degradedChecks: b.degradedChecks,
            downChecks: b.down,
            totalChecks: b.total,
          })
        : { score: 100 };

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

      data.push({
        timestamp: new Date(key).toISOString(),
        t: key,
        up: b.up,
        down: b.down,
        unknown: b.unknown,
        total: b.total,
        healthScore: scoreResult.score,
        avgLatency,
        p95Latency,
        degradedRate,
        downRate,
      });
    }

    res.json({ data });
  } catch (error) {
    console.error('[monitors] GET /aggregate/health error:', error);
    res.status(500).json({ error: 'Failed to fetch aggregate health' });
  }
});

// GET /api/monitors/:id/transitions
router.get('/:id/transitions', async (req, res) => {
  try {
    const transitions = await getStateTransitions(req.params.id, 50);
    res.json({ transitions });
  } catch (error) {
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
    const monitor = await createMonitor({
      name,
      url,
      environment: environment ?? (url ? inferEnvironment(url) : 'Dev'),
      discoveredAppId,
    });
    res.status(201).json(monitor);
  } catch (error) {
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
    const updated = await toggleMonitor(req.params.id, parsed.data.enabled);
    if (!updated) return res.status(404).json({ error: 'Monitor not found' });
    res.json({ monitor: updated });
  } catch (error) {
    console.error('[monitors] PATCH /:id/enable error:', error);
    res.status(500).json({ error: 'Failed to update monitor' });
  }
});

// DELETE /api/monitors/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteMonitor(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Monitor not found' });
    res.json({ deleted: true, monitor: deleted });
  } catch (error) {
    console.error('[monitors] DELETE /:id error:', error);
    res.status(500).json({ error: 'Failed to delete monitor' });
  }
});

export { router as monitorsRouter };