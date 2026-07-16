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
import { checkResults } from '../db/schema';
import { db } from '../db';
import { desc, gte, asc } from 'drizzle-orm';
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
    const all = await getAllMonitors();
    res.json({ monitors: all });
  } catch (error) {
    console.error('[monitors] GET / error:', error);
    res.status(500).json({ error: 'Failed to fetch monitors' });
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
// Returns ONLY buckets that contain at least one check (sparse).
// Field names match frontend contracts: up, down, unknown, total, t, timestamp, etc.
router.get('/aggregate/health', async (req, res) => {
  try {
    const windowHours  = Math.min(24, Math.max(1, parseInt(String(req.query.window  ?? '4'),  10) || 4));
    const bucketMinutes = Math.min(60, Math.max(1, parseInt(String(req.query.bucket ?? '5'),  10) || 5));
    const bucketMs = bucketMinutes * 60_000;

    const now = Date.now();
    const windowStart = new Date(now - windowHours * 60 * 60 * 1000);

    // Fetch all checks in the window, ascending
    const rawChecks = await db
      .select({
        checkedAt:    checkResults.checkedAt,
        status:       checkResults.status,
        responseTimeMs: checkResults.responseTimeMs,
        errorCategory:  checkResults.errorCategory,
        monitorId:    checkResults.monitorId,
      })
      .from(checkResults)
      .where(gte(checkResults.checkedAt, windowStart))
      .orderBy(asc(checkResults.checkedAt));

    // Aggregate into sparse buckets keyed by floor(ts / bucketMs)
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
      const ts  = new Date(check.checkedAt).getTime();
      const key = Math.floor(ts / bucketMs) * bucketMs;

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

    // Build response — only buckets with data, sorted ascending
    const data = Array.from(bucketMap.values())
      .sort((a, b) => a.key - b.key)
      .map((b) => {
        const scoreResult = calculateHealthScore({
          latencies:     b.latencies,
          degradedChecks: b.degradedChecks,
          downChecks:    b.down,
          totalChecks:   b.total,
        });

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

        return {
          timestamp: new Date(b.key).toISOString(),
          t: b.key,
          up: b.up,
          down: b.down,
          unknown: b.unknown,
          total: b.total,
          healthScore: scoreResult.score,
          avgLatency,
          p95Latency,
          degradedRate,
          downRate,
        };
      });

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