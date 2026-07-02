import { sql } from 'drizzle-orm';
import { db } from '../db';
import { getEnabledMonitors, updateMonitorStatus } from '../data/monitors';
import { pingUrl } from './pinger';
import type { PingResult } from './pinger';

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

async function waitForDbReady(maxRetries = 10, delayMs = 1000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await db.execute(sql`SELECT 1`);
      console.log('[scheduler] Database ready');
      return true;
    } catch {
      console.log(`[scheduler] Database not ready, retry ${i + 1}/${maxRetries}...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error('[scheduler] Database unreachable after max retries. Scheduler not started.');
  return false;
}

export async function startScheduler(intervalMs = 30000) {
  if (intervalId) {
    console.log('[scheduler] Already running');
    return;
  }

  // Don't start ticking until we can talk to the database
  const dbReady = await waitForDbReady();
  if (!dbReady) return;

  intervalId = setInterval(async () => {
    if (isRunning) {
      console.log('[scheduler] Previous run still in progress, skipping...');
      return;
    }

    isRunning = true;
    const startTime = Date.now();

    try {
      const { default: pLimit } = await import('p-limit');
      const limit = pLimit(5);

      const monitors = await getEnabledMonitors();
      console.log(`[scheduler] Polling ${monitors.length} monitors...`);

      await Promise.all(
        monitors.map((m) =>
          limit(async () => {
            const now = Date.now();
            const lastChecked = m.lastChecked ? new Date(m.lastChecked).getTime() : 0;
            const interval = (m.checkInterval ?? 30) * 1000;
            const isDue = now - lastChecked >= interval;

            if (!isDue) {
              return;
            }

            try {
              const result = await pingUrl(m.url, 3000);
              const updated = await updateMonitorStatus(m.id, result);
              // TODO: Broadcast via WebSocket when implemented
              // broadcast({ type: 'MONITOR_UPDATE', monitor: updated });
            } catch (error) {
              // Probe-side failure (not target DOWN) — mark as UNKNOWN
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error(`[scheduler] Probe failure for ${m.name}: ${errorMessage}`);

              const probeFailureResult: PingResult = {
                status: 'UNKNOWN',
                checkedAt: new Date().toISOString(),
                responseTimeMs: 0,
                errorCategory: 'PROBE_FAILURE',
                errorMessage: `Probe exception: ${errorMessage}`,
              };

              try {
                await updateMonitorStatus(m.id, probeFailureResult);
              } catch (dbError) {
                console.error(`[scheduler] Failed to record probe failure for ${m.name}:`, dbError);
              }
            }
          })
        )
      );

      console.log(`[scheduler] Completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('[scheduler] Fatal error:', error);
    } finally {
      isRunning = false;
    }
  }, intervalMs);

  console.log(`[scheduler] Started with ${intervalMs}ms interval`);
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[scheduler] Stopped');
  }
}

export function isSchedulerRunning() {
  return intervalId !== null;
}