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

// POST /api/monitors/bulk — parallel with bounded concurrency
router.post('/bulk', async (req, res) => {
  try {
    const { monitors: items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'monitors array is required' });
    }

    const validationResults = items.map((item, index) => ({
      index,
      parsed: bulkItemSchema.safeParse(item),
    }));

    const failures = validationResults
      .filter((r) => !r.parsed.success)
      .map((r) => ({
        index: r.index,
        errors: r.parsed.error!.flatten().fieldErrors,
      }));

    if (failures.length > 0) {
      return res.status(400).json({
        error: 'Some items failed validation',
        failures,
      });
    }

    const validItems = validationResults
      .filter((r) => r.parsed.success)
      .map((r) => r.parsed.data!);

    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(5);

    const results = await Promise.all(
      validItems.map((item) =>
        limit(async () => {
          const { name, url } = item;
          const pingResult = await pingUrl(url);
          const monitor = await createMonitor({
            name,
            url,
            environment: inferEnvironment(url),
          });
          return updateMonitorStatus(monitor.id, pingResult);
        })
      )
    );

    res.status(201).json(results);
  } catch (error) {
    console.error('[monitors] POST /bulk error:', error);
    res.status(500).json({ error: 'Failed to bulk create monitors' });
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