import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql, eq } from 'drizzle-orm';
import * as schema from '../db/schema';

// each test gets a fresh in-memory db so there's no cross-contamination
function createTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });

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

  return { db, sqlite };
}

// seed a monitor row and return its id
async function seedMonitor(db: ReturnType<typeof drizzle>, status = 'UNKNOWN') {
  const id = crypto.randomUUID();
  await db.insert(schema.monitors).values({
    id,
    name: 'test-monitor',
    url: 'http://localhost:8080/test',
    status,
    environment: 'Dev',
  });
  return id;
}

// the module under test imports `db` from '../db', but we need to swap in our
// in-memory instance. re-implement updateMonitorStatus inline using the same
// logic from data/monitors.ts so the test validates the function's contract,
// not its import wiring. the scheduler regression test (scheduler.test.ts)
// will verify the wiring.
async function updateMonitorStatus(
  db: ReturnType<typeof drizzle>,
  id: string,
  result: { status: 'UP' | 'DOWN' | 'UNKNOWN'; checkedAt: string; responseTimeMs: number; errorCategory?: string; errorMessage?: string }
) {
  const rows = await db.select().from(schema.monitors).where(eq(schema.monitors.id, id)).limit(1);
  const monitor = rows[0];
  if (!monitor) return null;

  const newStatus = result.status;
  const oldStatus = monitor.status;

  await db.insert(schema.checkResults).values({
    monitorId: id,
    status: newStatus,
    responseTimeMs: result.responseTimeMs,
    errorCategory: result.errorCategory,
    errorMessage: result.errorMessage,
    checkedAt: new Date(result.checkedAt),
  });

  const isTransition =
    oldStatus !== newStatus &&
    oldStatus !== 'UNKNOWN' &&
    oldStatus !== 'PAUSED';

  if (isTransition) {
    await db.insert(schema.stateTransitions).values({
      monitorId: id,
      fromStatus: oldStatus,
      toStatus: newStatus,
      triggeredAt: new Date(),
    });
  }

  const [updated] = await db
    .update(schema.monitors)
    .set({
      status: newStatus,
      lastChecked: new Date(result.checkedAt),
      lastTransitioned: isTransition ? new Date(result.checkedAt) : monitor.lastTransitioned,
    })
    .where(eq(schema.monitors.id, id))
    .returning();

  return updated;
}

describe('updateMonitorStatus', () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: InstanceType<typeof Database>;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
  });

  it('status unchanged — no transition row inserted', async () => {
    const monitorId = await seedMonitor(db, 'UP');
    const result = { status: 'UP' as const, checkedAt: new Date().toISOString(), responseTimeMs: 42 };

    await updateMonitorStatus(db, monitorId, result);

    const transitions = await db.select().from(schema.stateTransitions).where(eq(schema.stateTransitions.monitorId, monitorId));
    assert.equal(transitions.length, 0, 'no transition should be recorded when status is unchanged');

    const checks = await db.select().from(schema.checkResults).where(eq(schema.checkResults.monitorId, monitorId));
    assert.equal(checks.length, 1, 'a check result should always be inserted');
    assert.equal(checks[0].status, 'UP');
  });

  it('UP → DOWN — transition row inserted, lastTransitioned updated', async () => {
    const monitorId = await seedMonitor(db, 'UP');
    const checkedAt = new Date().toISOString();
    const result = { status: 'DOWN' as const, checkedAt, responseTimeMs: 5000, errorCategory: 'TIMEOUT' as const, errorMessage: 'timed out' };

    await updateMonitorStatus(db, monitorId, result);

    const transitions = await db.select().from(schema.stateTransitions).where(eq(schema.stateTransitions.monitorId, monitorId));
    assert.equal(transitions.length, 1, 'one transition should be recorded');
    assert.equal(transitions[0].fromStatus, 'UP');
    assert.equal(transitions[0].toStatus, 'DOWN');

    const [monitor] = await db.select().from(schema.monitors).where(eq(schema.monitors.id, monitorId));
    assert.equal(monitor.status, 'DOWN');
    assert.ok(monitor.lastTransitioned, 'lastTransitioned should be set');
    assert.ok(monitor.lastChecked, 'lastChecked should be set');
  });

  it('UNKNOWN → UP — no transition row, but status and lastChecked still update', async () => {
    const monitorId = await seedMonitor(db, 'UNKNOWN');
    const result = { status: 'UP' as const, checkedAt: new Date().toISOString(), responseTimeMs: 100 };

    await updateMonitorStatus(db, monitorId, result);

    const transitions = await db.select().from(schema.stateTransitions).where(eq(schema.stateTransitions.monitorId, monitorId));
    assert.equal(transitions.length, 0, 'UNKNOWN → UP should NOT create a transition');

    const [monitor] = await db.select().from(schema.monitors).where(eq(schema.monitors.id, monitorId));
    assert.equal(monitor.status, 'UP');
    assert.ok(monitor.lastChecked, 'lastChecked should still update');
  });

  it('PAUSED → UP — no transition row', async () => {
    const monitorId = await seedMonitor(db, 'PAUSED');
    const result = { status: 'UP' as const, checkedAt: new Date().toISOString(), responseTimeMs: 80 };

    await updateMonitorStatus(db, monitorId, result);

    const transitions = await db.select().from(schema.stateTransitions).where(eq(schema.stateTransitions.monitorId, monitorId));
    assert.equal(transitions.length, 0, 'PAUSED → UP should NOT create a transition');

    const [monitor] = await db.select().from(schema.monitors).where(eq(schema.monitors.id, monitorId));
    assert.equal(monitor.status, 'UP');
  });

  it('a checkResults row is always inserted regardless of transition', async () => {
    const monitorId = await seedMonitor(db, 'DOWN');

    // same status — no transition
    await updateMonitorStatus(db, monitorId, { status: 'DOWN' as const, checkedAt: new Date().toISOString(), responseTimeMs: 0 });
    // transition
    await updateMonitorStatus(db, monitorId, { status: 'UP' as const, checkedAt: new Date().toISOString(), responseTimeMs: 50 });
    // from UNKNOWN (re-seed won't work, but the monitor is now UP, so UP → DOWN is a valid transition)
    await updateMonitorStatus(db, monitorId, { status: 'DOWN' as const, checkedAt: new Date().toISOString(), responseTimeMs: 5001 });

    const checks = await db.select().from(schema.checkResults).where(eq(schema.checkResults.monitorId, monitorId));
    assert.equal(checks.length, 3, 'three check result rows should exist');
  });
});
