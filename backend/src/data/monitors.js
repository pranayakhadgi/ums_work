"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllMonitors = getAllMonitors;
exports.getMonitorById = getMonitorById;
exports.getEnabledMonitors = getEnabledMonitors;
exports.createMonitor = createMonitor;
exports.updateMonitorStatus = updateMonitorStatus;
exports.toggleMonitor = toggleMonitor;
exports.deleteMonitor = deleteMonitor;
exports.getMonitorHistory = getMonitorHistory;
exports.getStateTransitions = getStateTransitions;
exports.getDiscoveredCandidates = getDiscoveredCandidates;
exports.upsertDiscoveredApp = upsertDiscoveredApp;
exports.promoteCandidate = promoteCandidate;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const broadcaster_1 = require("../services/broadcaster");
async function getAllMonitors() {
    const allMonitors = await db_1.db.select().from(schema_1.monitors).orderBy((0, drizzle_orm_1.desc)(schema_1.monitors.createdAt));
    if (allMonitors.length === 0)
        return [];
    // severity: down surfaces first, then unknown, then stable.
    // doing this serverside so every consumer gets the same order.
    allMonitors.sort((a, b) => {
        const rank = (s) => s === 'DOWN' ? 0 : s === 'UNKNOWN' ? 1 : 2;
        return rank(a.status) - rank(b.status);
    });
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    // Fetch all recent check results in one query, then filter in JS
    const allChecks = await db_1.db
        .select()
        .from(schema_1.checkResults)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.checkResults.checkedAt));
    // Group by monitor
    const checksByMonitor = new Map();
    for (const check of allChecks) {
        const list = checksByMonitor.get(check.monitorId) ?? [];
        list.push(check);
        checksByMonitor.set(check.monitorId, list);
    }
    return allMonitors.map((monitor) => {
        const checks = checksByMonitor.get(monitor.id) ?? [];
        const latest = checks[0];
        const sevenDayChecks = checks.filter((c) => new Date(c.checkedAt).getTime() >= sevenDaysAgo);
        const sevenTotal = sevenDayChecks.length;
        const sevenUp = sevenDayChecks.filter((c) => c.status === 'UP').length;
        const thirtyDayChecks = checks.filter((c) => new Date(c.checkedAt).getTime() >= thirtyDaysAgo);
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
async function getMonitorById(id) {
    const results = await db_1.db
        .select()
        .from(schema_1.monitors)
        .where((0, drizzle_orm_1.eq)(schema_1.monitors.id, id))
        .limit(1);
    return results[0] ?? null;
}
async function getEnabledMonitors() {
    return db_1.db
        .select()
        .from(schema_1.monitors)
        .where((0, drizzle_orm_1.eq)(schema_1.monitors.isEnabled, true));
}
async function createMonitor(data) {
    // when url is omitted, derive it from the discovered app's instance
    let url = data.url;
    if (!url && data.discoveredAppId) {
        const [app] = await db_1.db
            .select()
            .from(schema_1.discoveredApps)
            .where((0, drizzle_orm_1.eq)(schema_1.discoveredApps.id, data.discoveredAppId))
            .limit(1);
        if (!app) {
            throw new Error(`discovered app ${data.discoveredAppId} not found`);
        }
        const [inst] = await db_1.db
            .select()
            .from(schema_1.tomcatInstances)
            .where((0, drizzle_orm_1.eq)(schema_1.tomcatInstances.id, app.instanceId))
            .limit(1);
        if (!inst) {
            throw new Error(`instance ${app.instanceId} not found for discovered app`);
        }
        url = `${inst.scheme}://${inst.host}:${inst.port}${app.contextPath}`;
    }
    if (!url) {
        throw new Error('url is required when discoveredAppId is not provided');
    }
    const existing = await db_1.db
        .select()
        .from(schema_1.monitors)
        .where((0, drizzle_orm_1.eq)(schema_1.monitors.url, url))
        .limit(1);
    if (existing.length > 0) {
        return existing[0];
    }
    const [monitor] = await db_1.db
        .insert(schema_1.monitors)
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
        await db_1.db
            .update(schema_1.discoveredApps)
            .set({ isPromoted: true })
            .where((0, drizzle_orm_1.eq)(schema_1.discoveredApps.id, data.discoveredAppId));
    }
    return monitor;
}
async function updateMonitorStatus(id, result) {
    const monitor = await getMonitorById(id);
    if (!monitor)
        return null;
    const newStatus = result.status;
    const oldStatus = monitor.status;
    await db_1.db.insert(schema_1.checkResults).values({
        monitorId: id,
        status: newStatus,
        responseTimeMs: result.responseTimeMs,
        errorCategory: result.errorCategory,
        errorMessage: result.errorMessage,
        checkedAt: new Date(result.checkedAt),
    });
    // only record a transition from a known, active state
    const isTransition = oldStatus !== newStatus &&
        oldStatus !== 'UNKNOWN' &&
        oldStatus !== 'PAUSED';
    if (isTransition) {
        await db_1.db.insert(schema_1.stateTransitions).values({
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
        (0, broadcaster_1.broadcast)({
            type: 'STATE_TRANSITION',
            monitorId: id,
            fromStatus: oldStatus,
            toStatus: newStatus,
            triggeredAt: new Date().toISOString(),
        });
    }
    const [updated] = await db_1.db
        .update(schema_1.monitors)
        .set({
        status: newStatus,
        lastChecked: new Date(result.checkedAt),
        lastTransitioned: isTransition
            ? new Date(result.checkedAt)
            : monitor.lastTransitioned,
    })
        .where((0, drizzle_orm_1.eq)(schema_1.monitors.id, id))
        .returning();
    await logEvent('CHECK_COMPLETED', {
        monitorId: id,
        status: newStatus,
        responseTimeMs: result.responseTimeMs,
        isTransition,
    });
    return updated;
}
async function toggleMonitor(id, enabled) {
    const [updated] = await db_1.db
        .update(schema_1.monitors)
        .set({ isEnabled: enabled })
        .where((0, drizzle_orm_1.eq)(schema_1.monitors.id, id))
        .returning();
    return updated ?? null;
}
async function deleteMonitor(id) {
    const [deleted] = await db_1.db
        .delete(schema_1.monitors)
        .where((0, drizzle_orm_1.eq)(schema_1.monitors.id, id))
        .returning();
    if (deleted) {
        await logEvent('MONITOR_DELETED', {
            monitorId: deleted.id,
            name: deleted.name,
        });
    }
    return deleted ?? null;
}
async function getMonitorHistory(monitorId, limit = 100) {
    return db_1.db
        .select()
        .from(schema_1.checkResults)
        .where((0, drizzle_orm_1.eq)(schema_1.checkResults.monitorId, monitorId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.checkResults.checkedAt))
        .limit(limit);
}
async function getStateTransitions(monitorId, limit = 50) {
    return db_1.db
        .select()
        .from(schema_1.stateTransitions)
        .where((0, drizzle_orm_1.eq)(schema_1.stateTransitions.monitorId, monitorId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.stateTransitions.triggeredAt))
        .limit(limit);
}
async function getDiscoveredCandidates() {
    return db_1.db
        .select()
        .from(schema_1.discoveredApps)
        .where((0, drizzle_orm_1.eq)(schema_1.discoveredApps.isPromoted, false))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.discoveredApps.discoveredAt));
}
async function upsertDiscoveredApp(data) {
    const existing = await db_1.db
        .select()
        .from(schema_1.discoveredApps)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discoveredApps.instanceId, data.instanceId), (0, drizzle_orm_1.eq)(schema_1.discoveredApps.contextPath, data.contextPath)))
        .limit(1);
    if (existing.length > 0) {
        const [updated] = await db_1.db
            .update(schema_1.discoveredApps)
            .set({ lastSeenAt: new Date(), tomcatState: data.tomcatState })
            .where((0, drizzle_orm_1.eq)(schema_1.discoveredApps.id, existing[0].id))
            .returning();
        return updated;
    }
    const [created] = await db_1.db
        .insert(schema_1.discoveredApps)
        .values({
        ...data,
        discoveredAt: new Date(),
        lastSeenAt: new Date(),
    })
        .returning();
    return created;
}
async function promoteCandidate(candidateId, options = {}) {
    const { healthCheckPath = '/', customUrl, createdBy } = options;
    const candidate = await db_1.db
        .select()
        .from(schema_1.discoveredApps)
        .where((0, drizzle_orm_1.eq)(schema_1.discoveredApps.id, candidateId))
        .limit(1);
    if (candidate.length === 0)
        return null;
    const app = candidate[0];
    let url;
    if (customUrl) {
        url = customUrl;
    }
    else {
        const instance = await db_1.db
            .select()
            .from(schema_1.tomcatInstances)
            .where((0, drizzle_orm_1.eq)(schema_1.tomcatInstances.id, app.instanceId))
            .limit(1);
        if (instance.length === 0)
            return null;
        const inst = instance[0];
        url = `${inst.scheme}://${inst.host}:${inst.port}${app.contextPath}${healthCheckPath}`;
    }
    const existing = await db_1.db
        .select()
        .from(schema_1.monitors)
        .where((0, drizzle_orm_1.eq)(schema_1.monitors.url, url))
        .limit(1);
    if (existing.length > 0) {
        await db_1.db
            .update(schema_1.discoveredApps)
            .set({ isPromoted: true })
            .where((0, drizzle_orm_1.eq)(schema_1.discoveredApps.id, candidateId));
        return existing[0];
    }
    const [monitor] = await db_1.db
        .insert(schema_1.monitors)
        .values({
        discoveredAppId: app.id,
        name: app.name,
        url,
        environment: 'Dev',
        createdBy,
    })
        .returning();
    await db_1.db
        .update(schema_1.discoveredApps)
        .set({ isPromoted: true })
        .where((0, drizzle_orm_1.eq)(schema_1.discoveredApps.id, candidateId));
    await logEvent('MONITOR_CREATED', {
        monitorId: monitor.id,
        name: monitor.name,
        source: 'discovery',
        candidateId,
    });
    return monitor;
}
async function logEvent(type, payload) {
    try {
        await db_1.db.insert(schema_1.events).values({ type, payload });
    }
    catch (err) {
        // event logging should never break the main flow
        console.error('[events] Failed to log event:', err);
    }
}
