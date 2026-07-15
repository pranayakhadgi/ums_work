"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
exports.stopScheduler = stopScheduler;
exports.runMonitors = runMonitors;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const tomcatScraper_1 = require("./tomcatScraper");
const pinger_1 = require("./pinger");
const monitors_1 = require("../data/monitors");
const instances_1 = require("../data/instances");
const crypto_1 = require("crypto");
const broadcaster_1 = require("./broadcaster");
let discoveryInterval = null;
let healthInterval = null;
let jvmInterval = null;
let monitorInterval = null;
const DISCOVERY_MS = 60000;
const HEALTH_MS = 60000;
const JVM_MS = 300000;
const MONITOR_MS = 30000; // will add jitter during prod. 
function getEnv() {
    return {
        mode: process.env.AUTO_PROMOTE_MODE || 'off',
        include: (process.env.AUTO_PROMOTE_INCLUDE || '').split(',').filter(Boolean),
        exclude: (process.env.AUTO_PROMOTE_EXCLUDE || '/synctl, /manager, /wsastub, /host-manager').split(',').filter(Boolean),
        sessionThreshold: parseInt(process.env.AUTO_PROMOTE_SESSION_THRESHOLD || '1', 10),
    };
}
const INFRASTRUCTURE_PATHS = new Set(['/synctl', '/manager', '/wsastub', '/host-manager']);
//autopromote discovered apps
function shouldAutoPromote(app) {
    if (app.state !== 'running')
        return false;
    const env = getEnv();
    switch (env.mode) {
        case 'include':
            return env.include.some(p => app.contextPath.toLowerCase().includes(p.toLowerCase()));
        case 'exclude':
            return !env.exclude.some(p => app.contextPath.toLowerCase().includes(p.toLowerCase()));
        case 'session':
            return app.sessions >= env.sessionThreshold;
        case 'hybrid':
            return app.sessions > 0 && !INFRASTRUCTURE_PATHS.has(app.contextPath);
        default:
            return false;
    }
}
function startScheduler() {
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
function stopScheduler() {
    if (discoveryInterval)
        clearInterval(discoveryInterval);
    if (healthInterval)
        clearInterval(healthInterval);
    if (jvmInterval)
        clearInterval(jvmInterval);
    if (monitorInterval)
        clearInterval(monitorInterval);
    console.log('[scheduler] All jobs stopped');
}
/**note:- node.js won't skip the job if it takes longer than the interval.
 * works well with monitoring around 20 computers
 */
async function runMonitors() {
    const allMonitors = await db_1.db.select().from(schema_1.monitors).where((0, drizzle_orm_1.eq)(schema_1.monitors.isEnabled, true));
    //throw for no monitors found
    if (allMonitors.length === 0) {
        console.log('[scheduler] No monitors found');
        return;
    }
    //bounded concurrency (pings 10 monitor at a time parallel with the other monitor sequence)
    const { default: plimit } = await import('p-limit');
    const limit = plimit(10);
    //preserve linear monitor crash bottleneck
    const tasks = allMonitors.map((monitor) => limit(async () => {
        try {
            const result = await (0, pinger_1.pingUrl)(monitor.url, 5000);
            await (0, monitors_1.updateMonitorStatus)(monitor.id, result);
        }
        catch (err) {
            console.error(`[scheduler] Monitor ping failed for ${monitor.name} (${monitor.url}):`, err instanceof Error ? err.message : err);
        }
    }));
    await Promise.all(tasks);
    (0, broadcaster_1.broadcast)({
        type: 'CHECK_BATCH_COMPLETE',
        checkedAt: new Date().toISOString(),
        monitorCount: allMonitors.length,
    });
    console.log('[scheduler] Monitor check batch complete');
}
async function runDiscovery() {
    try {
        console.log('[scheduler] Running discovery...');
        const apps = await (0, tomcatScraper_1.discoverApps)();
        const instance = await (0, instances_1.getOrCreateDefaultInstance)();
        for (const app of apps) {
            const existing = await db_1.db.select().from(schema_1.discoveredApps).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discoveredApps.contextPath, app.contextPath), (0, drizzle_orm_1.eq)(schema_1.discoveredApps.instanceId, instance.id)));
            let targetApp;
            if (existing.length === 0) {
                const [inserted] = await db_1.db.insert(schema_1.discoveredApps).values({
                    id: (0, crypto_1.randomUUID)(),
                    instanceId: instance.id,
                    name: app.displayName || app.contextPath,
                    contextPath: app.contextPath,
                    tomcatState: app.state,
                    sessions: app.sessions,
                    discoveredAt: new Date(),
                    lastSeenAt: new Date(),
                }).returning();
                targetApp = inserted;
                console.log(`[discovery] New app: ${app.contextPath} (${app.sessions} sessions)`);
            }
            else {
                await db_1.db.update(schema_1.discoveredApps)
                    .set({ lastSeenAt: new Date(), tomcatState: app.state, sessions: app.sessions })
                    .where((0, drizzle_orm_1.eq)(schema_1.discoveredApps.id, existing[0].id));
                targetApp = existing[0];
            }
            // auto promote hook - skip if already marked as promoted in parsed data
            if (targetApp && !targetApp.isPromoted && shouldAutoPromote(app)) {
                try {
                    await (0, monitors_1.createMonitor)({ discoveredAppId: targetApp.id, name: app.displayName || app.contextPath });
                    console.log(`[discovery] Auto-promoted: ${app.contextPath}`);
                }
                catch (err) {
                    console.error(`[discovery] Auto-promotion failed for ${app.contextPath}:`, err);
                }
            }
        }
        console.log('[discovery] Discovery completed');
    }
    catch (err) {
        console.error('[discovery] Discovery failed:', err);
    }
}
async function runHealth() {
    try {
        console.log('[scheduler] Collecting instance health...');
        const health = await (0, tomcatScraper_1.fetchInstanceHealth)();
        const instance = await (0, instances_1.getOrCreateDefaultInstance)();
        for (const connector of health.connectors) {
            await db_1.db.insert(schema_1.instanceHealthSnapshots).values({
                id: (0, crypto_1.randomUUID)(),
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
    }
    catch (err) {
        console.error('[scheduler] Health collection failed:', err);
    }
}
async function runJvm() {
    try {
        console.log('[scheduler] Collecting JVM snapshot...');
        const snapshot = await (0, tomcatScraper_1.fetchJvmSnapshot)();
        const instance = await (0, instances_1.getOrCreateDefaultInstance)();
        await db_1.db.insert(schema_1.jvmSnapshots).values({
            id: (0, crypto_1.randomUUID)(),
            instanceId: instance.id,
            runtimeInfo: snapshot.runtimeInfo,
            memoryPools: snapshot.memoryPools,
            gcInfo: snapshot.gcInfo,
            osInfo: snapshot.osInfo,
            rawResponse: snapshot.raw.substring(0, 5000),
            collectedAt: new Date(),
        });
        console.log('[scheduler] JVM snapshot stored');
    }
    catch (err) {
        console.error('[scheduler] JVM collection failed:', err);
    }
}
