import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  monitors,
  checkResults,
  stateTransitions,
  events,
  discoveredApps,
  tomcatInstances,
} from '../db/schema';
import type { PingResult } from '../services/pinger';
import {broadcast} from '../services/broadcaster';

export async function getAllMonitors() {
  const allMonitors = await db.select().from(monitors).orderBy(desc(monitors.createdAt));
  if (allMonitors.length === 0) return [];

  // severity: down surfaces first, then unknown, then stable.
  // doing this serverside so every consumer gets the same order.
  allMonitors.sort((a, b) => {
    const rank = (s: string) => s === 'DOWN' ? 0 : s === 'UNKNOWN' ? 1 : 2;
    return rank(a.status) - rank(b.status);
  });

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  // Fetch all recent check results in one query, then filter in JS
  const allChecks = await db
    .select()
    .from(checkResults)
    .orderBy(desc(checkResults.checkedAt));

  // Group by monitor
  const checksByMonitor = new Map<string, typeof allChecks>();
  for (const check of allChecks) {
    const list = checksByMonitor.get(check.monitorId) ?? [];
    list.push(check);
    checksByMonitor.set(check.monitorId, list);
  }

  return allMonitors.map((monitor) => {
    const checks = checksByMonitor.get(monitor.id) ?? [];
    const latest = checks[0];

    const sevenDayChecks = checks.filter(
      (c) => new Date(c.checkedAt).getTime() >= sevenDaysAgo
    );
    const sevenTotal = sevenDayChecks.length;
    const sevenUp = sevenDayChecks.filter((c) => c.status === 'UP').length;

    const thirtyDayChecks = checks.filter(
      (c) => new Date(c.checkedAt).getTime() >= thirtyDaysAgo
    );
    const thirtyTotal = thirtyDayChecks.length;
    const thirtyUp = thirtyDayChecks.filter((c) => c.status === 'UP').length;

    return {
      ...monitor,
      uptime7days: sevenTotal > 0 ? Math.round((sevenUp / sevenTotal) * 1000) / 10 : 0,
      uptime30days: thirtyTotal > 0 ? Math.round((thirtyUp / thirtyTotal) * 1000) / 10 : 0,
      errorCategory: latest?.errorCategory ?? undefined,
      errorMessage: latest?.errorMessage ?? undefined,
    };
  });
}


export async function getMonitorById(id: string) {
  const results = await db
    .select()
    .from(monitors)
    .where(eq(monitors.id, id))
    .limit(1);
  return results[0] ?? null;
}

export async function getEnabledMonitors() {
  return db
    .select()
    .from(monitors)
    .where(eq(monitors.isEnabled, true));
}

export async function createMonitor(data: {
  name: string;
  url?: string;
  environment?: 'Dev' | 'QA' | 'Prod';
  discoveredAppId?: string;
  createdBy?: string;
}) {
  // when url is omitted, derive it from the discovered app's instance
  let url = data.url;
  if (!url && data.discoveredAppId) {
    const [app] = await db
      .select()
      .from(discoveredApps)
      .where(eq(discoveredApps.id, data.discoveredAppId))
      .limit(1);

    if (!app) {
      throw new Error(`discovered app ${data.discoveredAppId} not found`);
    }

    const [inst] = await db
      .select()
      .from(tomcatInstances)
      .where(eq(tomcatInstances.id, app.instanceId))
      .limit(1);

    if (!inst) {
      throw new Error(`instance ${app.instanceId} not found for discovered app`);
    }

    url = `${inst.scheme}://${inst.host}:${inst.port}${app.contextPath}`;
  }

  if (!url) {
    throw new Error('url is required when discoveredAppId is not provided');
  }

  const existing = await db
    .select()
    .from(monitors)
    .where(eq(monitors.url, url))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [monitor] = await db
    .insert(monitors)
    .values({
      ...data,
      url,
      environment: data.environment ?? 'Dev',
      status: 'UNKNOWN',
    })
    .returning();

  await logEvent('MONITOR_CREATED', {
    monitorId: monitor.id,
    name: monitor.name,
    url: monitor.url,
  });

  if (data.discoveredAppId) {
    await db
      .update(discoveredApps)
      .set({ isPromoted: true })
      .where(eq(discoveredApps.id, data.discoveredAppId));
  }

  return monitor;
}

export async function updateMonitorStatus(
  id: string,
  result: PingResult
) {
  const monitor = await getMonitorById(id);
  if (!monitor) return null;

  const newStatus = result.status;
  const oldStatus = monitor.status;

  await db.insert(checkResults).values({
    monitorId: id,
    status: newStatus,
    responseTimeMs: result.responseTimeMs,
    errorCategory: result.errorCategory,
    errorMessage: result.errorMessage,
    checkedAt: new Date(result.checkedAt),
  });

  // only record a transition from a known, active state
  const isTransition =
    oldStatus !== newStatus &&
    oldStatus !== 'UNKNOWN' &&
    oldStatus !== 'PAUSED';

  if (isTransition) {
    await db.insert(stateTransitions).values({
      monitorId: id,
      fromStatus: oldStatus,
      toStatus: newStatus,
      triggeredAt: new Date(),
    });

    await logEvent('STATE_TRANSITION', {
      monitorId: id,
      from: oldStatus,
      to: newStatus,
      responseTimeMs: result.responseTimeMs,
      errorCategory: result.errorCategory,
    });

    broadcast({
      type: 'STATE_TRANSITION',
      monitorId: id,
      fromStatus: oldStatus,
      toStatus:newStatus,
      triggeredAt: new Date().toISOString(),
    });
  }

  const [updated] = await db
    .update(monitors)
    .set({
      status: newStatus,
      lastChecked: new Date(result.checkedAt),
      lastTransitioned: isTransition
        ? new Date(result.checkedAt)
        : monitor.lastTransitioned,
    })
    .where(eq(monitors.id, id))
    .returning();

  await logEvent('CHECK_COMPLETED', {
    monitorId: id,
    status: newStatus,
    responseTimeMs: result.responseTimeMs,
    isTransition,
  });

  return updated;
}

export async function toggleMonitor(id: string, enabled: boolean) {
  const [updated] = await db
    .update(monitors)
    .set({ isEnabled: enabled })
    .where(eq(monitors.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteMonitor(id: string) {
  const [deleted] = await db
    .delete(monitors)
    .where(eq(monitors.id, id))
    .returning();

  if (deleted) {
    await logEvent('MONITOR_DELETED', {
      monitorId: deleted.id,
      name: deleted.name,
    });
  }

  return deleted ?? null;
}

export async function getMonitorHistory(monitorId: string, limit = 100) {
  return db
    .select()
    .from(checkResults)
    .where(eq(checkResults.monitorId, monitorId))
    .orderBy(desc(checkResults.checkedAt))
    .limit(limit);
}

export async function getStateTransitions(monitorId: string, limit = 50) {
  return db
    .select()
    .from(stateTransitions)
    .where(eq(stateTransitions.monitorId, monitorId))
    .orderBy(desc(stateTransitions.triggeredAt))
    .limit(limit);
}

export async function getDiscoveredCandidates() {
  return db
    .select()
    .from(discoveredApps)
    .where(eq(discoveredApps.isPromoted, false))
    .orderBy(desc(discoveredApps.discoveredAt));
}

export async function upsertDiscoveredApp(data: {
  instanceId: string;
  name: string;
  contextPath: string;
  tomcatState: string;
}) {
  const existing = await db
    .select()
    .from(discoveredApps)
    .where(
      and(
        eq(discoveredApps.instanceId, data.instanceId),
        eq(discoveredApps.contextPath, data.contextPath)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(discoveredApps)
      .set({ lastSeenAt: new Date(), tomcatState: data.tomcatState })
      .where(eq(discoveredApps.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(discoveredApps)
    .values({
      ...data,
      discoveredAt: new Date(),
      lastSeenAt: new Date(),
    })
    .returning();
  return created;
}

export async function promoteCandidate(
  candidateId: string,
  options: {
    healthCheckPath?: string;
    customUrl?: string;
    createdBy?: string;
  } = {}
) {
  const { healthCheckPath = '/', customUrl, createdBy } = options;

  const candidate = await db
    .select()
    .from(discoveredApps)
    .where(eq(discoveredApps.id, candidateId))
    .limit(1);

  if (candidate.length === 0) return null;

  const app = candidate[0];

  let url: string;
  if (customUrl) {
    url = customUrl;
  } else {
    const instance = await db
      .select()
      .from(tomcatInstances)
      .where(eq(tomcatInstances.id, app.instanceId))
      .limit(1);

    if (instance.length === 0) return null;

    const inst = instance[0];
    url = `${inst.scheme}://${inst.host}:${inst.port}${app.contextPath}${healthCheckPath}`;
  }

  const existing = await db
    .select()
    .from(monitors)
    .where(eq(monitors.url, url))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(discoveredApps)
      .set({ isPromoted: true })
      .where(eq(discoveredApps.id, candidateId));
    return existing[0];
  }

  const [monitor] = await db
    .insert(monitors)
    .values({
      discoveredAppId: app.id,
      name: app.name,
      url,
      environment: 'Dev',
      createdBy,
    })
    .returning();

  await db
    .update(discoveredApps)
    .set({ isPromoted: true })
    .where(eq(discoveredApps.id, candidateId));

  await logEvent('MONITOR_CREATED', {
    monitorId: monitor.id,
    name: monitor.name,
    source: 'discovery',
    candidateId,
  });

  return monitor;
}

async function logEvent(
  type:
    | 'STATE_TRANSITION'
    | 'MONITOR_CREATED'
    | 'MONITOR_UPDATED'
    | 'MONITOR_DELETED'
    | 'CHECK_COMPLETED'
    | 'DISCOVERY_COMPLETED',
  payload: any
) {
  try {
    await db.insert(events).values({ type, payload });
  } catch (err) {
    // event logging should never break the main flow
    console.error('[events] Failed to log event:', err);
  }
}