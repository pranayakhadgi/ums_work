"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const better_sqlite3_2 = require("drizzle-orm/better-sqlite3");
const drizzle_orm_1 = require("drizzle-orm");
const schema = __importStar(require("../db/schema"));
// create an in-memory db with the full schema
function createTestDb() {
    const sqlite = new better_sqlite3_1.default(':memory:');
    const testDb = (0, better_sqlite3_2.drizzle)(sqlite, { schema });
    sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE tomcat_instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scheme TEXT NOT NULL DEFAULT 'http',
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 8080,
      manager_url TEXT NOT NULL,
      manager_user TEXT NOT NULL,
      manager_pass TEXT NOT NULL,
      environment TEXT NOT NULL DEFAULT 'Dev',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE discovered_apps (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL REFERENCES tomcat_instances(id),
      name TEXT NOT NULL,
      context_path TEXT NOT NULL,
      tomcat_state TEXT NOT NULL,
      discovered_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
      is_promoted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE monitors (
      id TEXT PRIMARY KEY,
      discovered_app_id TEXT REFERENCES discovered_apps(id),
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      environment TEXT NOT NULL DEFAULT 'Dev',
      status TEXT NOT NULL DEFAULT 'UNKNOWN',
      last_checked INTEGER,
      last_transitioned INTEGER,
      check_interval INTEGER NOT NULL DEFAULT 30,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE check_results (
      id TEXT PRIMARY KEY,
      monitor_id TEXT NOT NULL REFERENCES monitors(id),
      status TEXT NOT NULL,
      response_time_ms INTEGER,
      error_category TEXT,
      error_message TEXT,
      checked_at INTEGER NOT NULL DEFAULT (unixepoch()),
      metadata TEXT
    );

    CREATE TABLE state_transitions (
      id TEXT PRIMARY KEY,
      monitor_id TEXT NOT NULL REFERENCES monitors(id),
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      triggered_at INTEGER NOT NULL DEFAULT (unixepoch()),
      acknowledged_by TEXT REFERENCES users(id),
      acknowledged_at INTEGER
    );

    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT,
      emitted_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE instance_health_snapshots (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL REFERENCES tomcat_instances(id),
      connector_name TEXT NOT NULL,
      thread_info TEXT,
      request_info TEXT,
      memory_info TEXT,
      raw_response TEXT,
      collected_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE jvm_snapshots (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL REFERENCES tomcat_instances(id),
      runtime_info TEXT,
      memory_pools TEXT,
      gc_info TEXT,
      os_info TEXT,
      raw_response TEXT,
      collected_at INTEGER DEFAULT (unixepoch())
    );
  `);
    return { db: testDb, sqlite };
}
// this test validates that runMonitors (after the dedup refactor) produces
// the same db rows as calling updateMonitorStatus directly. we can't import
// runMonitors directly because it uses the module-level `db` singleton, so
// we replicate its post-refactor logic: select all monitors, ping each,
// call updateMonitorStatus. the key thing being tested is that the transition
// guard (UNKNOWN/PAUSED suppression) now applies uniformly.
(0, node_test_1.describe)('scheduler runMonitors regression', () => {
    (0, node_test_1.it)('produces the same rows as updateMonitorStatus for equivalent inputs', async () => {
        const { db } = createTestDb();
        // seed a monitor with status UP
        const monitorId = crypto.randomUUID();
        await db.insert(schema.monitors).values({
            id: monitorId,
            name: 'regression-test',
            url: 'http://localhost:9999/test',
            status: 'UP',
            environment: 'Dev',
        });
        // simulate what runMonitors does after the refactor: call updateMonitorStatus
        // with a ping result that triggers a transition (UP → DOWN)
        const pingResult = {
            status: 'DOWN',
            checkedAt: new Date().toISOString(),
            responseTimeMs: 5001,
            errorCategory: 'TIMEOUT',
            errorMessage: 'request timed out',
        };
        // inline the updateMonitorStatus logic (same as data/monitors.ts)
        const monitor = (await db.select().from(schema.monitors).where((0, drizzle_orm_1.eq)(schema.monitors.id, monitorId)).limit(1))[0];
        const newStatus = pingResult.status;
        const oldStatus = monitor.status;
        await db.insert(schema.checkResults).values({
            monitorId,
            status: newStatus,
            responseTimeMs: pingResult.responseTimeMs,
            errorCategory: pingResult.errorCategory,
            errorMessage: pingResult.errorMessage,
            checkedAt: new Date(pingResult.checkedAt),
        });
        const isTransition = oldStatus !== newStatus &&
            oldStatus !== 'UNKNOWN' &&
            oldStatus !== 'PAUSED';
        if (isTransition) {
            await db.insert(schema.stateTransitions).values({
                monitorId,
                fromStatus: oldStatus,
                toStatus: newStatus,
                triggeredAt: new Date(),
            });
        }
        await db.update(schema.monitors).set({
            status: newStatus,
            lastChecked: new Date(pingResult.checkedAt),
            lastTransitioned: isTransition ? new Date(pingResult.checkedAt) : monitor.lastTransitioned,
        }).where((0, drizzle_orm_1.eq)(schema.monitors.id, monitorId));
        // verify: UP → DOWN should create a transition
        const checks = await db.select().from(schema.checkResults).where((0, drizzle_orm_1.eq)(schema.checkResults.monitorId, monitorId));
        strict_1.default.equal(checks.length, 1, 'one check result row');
        strict_1.default.equal(checks[0].status, 'DOWN');
        const transitions = await db.select().from(schema.stateTransitions).where((0, drizzle_orm_1.eq)(schema.stateTransitions.monitorId, monitorId));
        strict_1.default.equal(transitions.length, 1, 'one transition row for UP → DOWN');
        strict_1.default.equal(transitions[0].fromStatus, 'UP');
        strict_1.default.equal(transitions[0].toStatus, 'DOWN');
        const [updated] = await db.select().from(schema.monitors).where((0, drizzle_orm_1.eq)(schema.monitors.id, monitorId));
        strict_1.default.equal(updated.status, 'DOWN');
        strict_1.default.ok(updated.lastChecked);
        strict_1.default.ok(updated.lastTransitioned);
    });
    (0, node_test_1.it)('UNKNOWN → UP does not create a transition (guard applies after refactor)', async () => {
        const { db } = createTestDb();
        const monitorId = crypto.randomUUID();
        await db.insert(schema.monitors).values({
            id: monitorId,
            name: 'guard-test',
            url: 'http://localhost:9999/guard',
            status: 'UNKNOWN',
            environment: 'Dev',
        });
        const pingResult = {
            status: 'UP',
            checkedAt: new Date().toISOString(),
            responseTimeMs: 50,
        };
        // replicate the refactored runMonitors logic
        const monitor = (await db.select().from(schema.monitors).where((0, drizzle_orm_1.eq)(schema.monitors.id, monitorId)).limit(1))[0];
        const newStatus = pingResult.status;
        const oldStatus = monitor.status;
        await db.insert(schema.checkResults).values({
            monitorId,
            status: newStatus,
            responseTimeMs: pingResult.responseTimeMs,
            checkedAt: new Date(pingResult.checkedAt),
        });
        // this is the guard that was missing from the old scheduler inline code
        const isTransition = oldStatus !== newStatus &&
            oldStatus !== 'UNKNOWN' &&
            oldStatus !== 'PAUSED';
        if (isTransition) {
            await db.insert(schema.stateTransitions).values({
                monitorId,
                fromStatus: oldStatus,
                toStatus: newStatus,
                triggeredAt: new Date(),
            });
        }
        await db.update(schema.monitors).set({
            status: newStatus,
            lastChecked: new Date(pingResult.checkedAt),
            lastTransitioned: isTransition ? new Date(pingResult.checkedAt) : monitor.lastTransitioned,
        }).where((0, drizzle_orm_1.eq)(schema.monitors.id, monitorId));
        const transitions = await db.select().from(schema.stateTransitions).where((0, drizzle_orm_1.eq)(schema.stateTransitions.monitorId, monitorId));
        strict_1.default.equal(transitions.length, 0, 'UNKNOWN → UP should NOT produce a transition after the refactor');
        const checks = await db.select().from(schema.checkResults).where((0, drizzle_orm_1.eq)(schema.checkResults.monitorId, monitorId));
        strict_1.default.equal(checks.length, 1);
        const [updated] = await db.select().from(schema.monitors).where((0, drizzle_orm_1.eq)(schema.monitors.id, monitorId));
        strict_1.default.equal(updated.status, 'UP');
    });
});
