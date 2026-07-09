import { db } from '../db';
import { discoveredApps, instanceHealthSnapshots, jvmSnapshots, monitors } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { discoverApps, fetchInstanceHealth, fetchJvmSnapshot } from './tomcatScraper';
import { pingUrl } from './pinger';
import { updateMonitorStatus } from '../data/monitors';
import { getOrCreateDefaultInstance } from '../data/instances';
import { randomUUID } from 'crypto';

let discoveryInterval: NodeJS.Timeout | null = null;
let healthInterval: NodeJS.Timeout | null = null;
let jvmInterval: NodeJS.Timeout | null = null;
let monitorInterval: NodeJS.Timeout | null = null;

const DISCOVERY_MS = 60000;
const HEALTH_MS = 60000;
const JVM_MS = 300000;
const MONITOR_MS = 30000;// will add jitter during prod. 

export function startScheduler() {
  console.log('[scheduler] Starting all jobs...');

  runDiscovery().catch(console.error);
  runHealth().catch(console.error);
  runJvm().catch(console.error);
  runMonitors().catch(console.error);

  discoveryInterval = setInterval(() => runDiscovery().catch(console.error), DISCOVERY_MS);
  healthInterval = setInterval(() => runHealth().catch(console.error), HEALTH_MS);
  jvmInterval = setInterval(() => runJvm().catch(console.error), JVM_MS);
  monitorInterval = setInterval(() => runMonitors().catch(console.error), MONITOR_MS);

  console.log('[scheduler] All jobs started');
}

export function stopScheduler() {
  if (discoveryInterval) clearInterval(discoveryInterval);
  if (healthInterval) clearInterval(healthInterval);
  if (jvmInterval) clearInterval(jvmInterval);
  if (monitorInterval) clearInterval(monitorInterval);
  console.log('[scheduler] All jobs stopped');
}

/**note:- node.js won't skip the job if it takes longer than the interval.
 * works well with monitoring around 20 computers
 */
export async function runMonitors() {
  const allMonitors = await db.select().from(monitors).where(eq(monitors.isEnabled, true));

  //throw for no monitors found
  if (allMonitors.length === 0) {
    console.log('[scheduler] No monitors found');
    return;
  }

  //bounded concurrency (pings 10 monitor at a time parallel with the other monitor sequence)
  const {default: plimit } = await import ('p-limit');
  const limit = plimit(10);

  //preserve linear monitor crash bottleneck
  const tasks = allMonitors.map((monitor) => limit(async () => {
    try {
      const result = await pingUrl(monitor.url, 5000);
      await updateMonitorStatus(monitor.id, result);
    } catch (err) {
      console.error(`[scheduler] Monitor ping failed for ${monitor.name} (${monitor.url}):`, err instanceof Error ? err.message : err);
    }
  }));
  await Promise.all(tasks);

  console.log('[scheduler] Monitor check batch complete');
}

async function runDiscovery() {
  try {
    console.log('[scheduler] Running discovery...');
    const apps = await discoverApps();
    const instance = await getOrCreateDefaultInstance();

    for (const app of apps) {
      const existing = await db.select().from(discoveredApps).where(
        and(
          eq(discoveredApps.contextPath, app.contextPath),
          eq(discoveredApps.instanceId, instance.id)
        )
      );

      if (existing.length === 0) {
        await db.insert(discoveredApps).values({
          id: randomUUID(),
          instanceId: instance.id,
          name: app.displayName || app.contextPath,
          contextPath: app.contextPath,
          tomcatState: app.state,
          discoveredAt: new Date(),
          lastSeenAt: new Date(),
        });
        console.log(`[discovery] New app: ${app.contextPath}`);
      } else {
        await db.update(discoveredApps)
          .set({ lastSeenAt: new Date(), tomcatState: app.state })
          .where(eq(discoveredApps.id, existing[0].id));
      }
    }
    console.log(`[scheduler] Discovery complete: ${apps.length} apps`);
  } catch (err) {
    console.error('[scheduler] Discovery failed:', err);
  }
}

async function runHealth() {
  try {
    console.log('[scheduler] Collecting instance health...');
    const health = await fetchInstanceHealth();
    const instance = await getOrCreateDefaultInstance();

    for (const connector of health.connectors) {
      await db.insert(instanceHealthSnapshots).values({
        id: randomUUID(),
        instanceId: instance.id,
        connectorName: connector.name,
        threadInfo: connector.threadInfo,
        requestInfo: connector.requestInfo,
        memoryInfo: health.memoryInfo,
        rawResponse: health.raw.substring(0, 5000),
        collectedAt: new Date(),
      });
    }
    console.log(`[scheduler] Health stored: ${health.connectors.length} connectors`);
  } catch (err) {
    console.error('[scheduler] Health collection failed:', err);
  }
}

async function runJvm() {
  try {
    console.log('[scheduler] Collecting JVM snapshot...');
    const snapshot = await fetchJvmSnapshot();
    const instance = await getOrCreateDefaultInstance();

    await db.insert(jvmSnapshots).values({
      id: randomUUID(),
      instanceId: instance.id,
      runtimeInfo: snapshot.runtimeInfo,
      memoryPools: snapshot.memoryPools,
      gcInfo: snapshot.gcInfo,
      osInfo: snapshot.osInfo,
      rawResponse: snapshot.raw.substring(0, 5000),
      collectedAt: new Date(),
    });
    console.log('[scheduler] JVM snapshot stored');
  } catch (err) {
    console.error('[scheduler] JVM collection failed:', err);
  }
}