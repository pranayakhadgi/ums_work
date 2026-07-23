/**
 * Express router for Tomcat instance management
 */
import { Router } from 'express';
import { db } from '../db';
import { tomcatInstances } from '../db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { parseAndSanitizeManagerUrl } from '../utils/url';
import { tomcatFetch, type TomcatInstance } from '../services/tomcatScraper';

const router = Router();

// GET /api/instances — list all active instances
router.get('/', async (req, res) => {
  try {
    const instances = await db.select().from(tomcatInstances).where(eq(tomcatInstances.isActive, true));
    res.json({ success: true, data: instances });
  } catch (error) {
    console.error('[instances] GET / error:', error);
    res.status(500).json({ error: 'Failed to fetch instances' });
  }
});

// POST /api/instances — create a new Tomcat instance
router.post('/', async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      managerUrl: z.string().url('Invalid URL format'),
      managerUser: z.string().min(1, 'Manager username is required'),
      managerPass: z.string().min(1, 'Manager password is required'),
    });

    const validatedData = schema.parse(req.body);

    const { url: normalizedUrl, user, pass } = parseAndSanitizeManagerUrl(
      validatedData.managerUrl,
      validatedData.managerUser,
      validatedData.managerPass
    );

    // Test connection immediately
    const tempInstance = {
      id: 'temp',
      name: 'validation',
      managerUrl: normalizedUrl,
      managerUser: user,
      managerPass: pass,
    } as TomcatInstance;

    try {
      await tomcatFetch('/text/list', tempInstance, 1);
    } catch (error: any) {
      console.warn('[Instances] Connection validation failed:', error.message);
      return res.status(400).json({
        error: 'Cannot connect to Tomcat manager. Check:\n' +
        '1. URL is the root of the manager (e.g., /manager)\n' +
        '2. Credentials are correct\n' +
        '3. Instance is reachable',
        details: error.message,
      });
    }

    const url = new URL(normalizedUrl);
    const scheme = url.protocol.replace(':', '');
    const host = url.hostname;
    const port = parseInt(url.port || (scheme === 'https' ? '443' : '80'), 10);

    const [newInstance] = await db.insert(tomcatInstances).values({
      id: randomUUID(),
      name: validatedData.name,
      scheme,
      host,
      port,
      managerUrl: normalizedUrl,
      managerUser: user,
      managerPass: pass,
      environment: 'Dev',
      isActive: true,
      createdAt: new Date(),
    }).returning();

    res.status(201).json({ success: true, data: newInstance });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    if (error.message?.includes('Conflict: Credentials')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('[instances] POST / error:', error);
    res.status(500).json({ error: 'Failed to create instance', message: error.message });
  }
});

export { router as instancesRouter };
