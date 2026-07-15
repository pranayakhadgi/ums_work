"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jvmSnapshots = exports.instanceHealthSnapshots = exports.events = exports.stateTransitions = exports.checkResults = exports.monitors = exports.discoveredApps = exports.tomcatInstances = exports.users = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
exports.users = (0, sqlite_core_1.sqliteTable)('users', {
    id: (0, sqlite_core_1.text)('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    email: (0, sqlite_core_1.text)('email').notNull().unique(),
    name: (0, sqlite_core_1.text)('name').notNull(),
    role: (0, sqlite_core_1.text)('role').notNull().default('viewer'),
    createdAt: (0, sqlite_core_1.integer)('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
exports.tomcatInstances = (0, sqlite_core_1.sqliteTable)('tomcat_instances', {
    id: (0, sqlite_core_1.text)('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: (0, sqlite_core_1.text)('name').notNull(),
    scheme: (0, sqlite_core_1.text)('scheme').notNull().default('http'),
    host: (0, sqlite_core_1.text)('host').notNull(),
    port: (0, sqlite_core_1.integer)('port').notNull().default(8080),
    managerUrl: (0, sqlite_core_1.text)('manager_url').notNull(),
    managerUser: (0, sqlite_core_1.text)('manager_user').notNull(),
    managerPass: (0, sqlite_core_1.text)('manager_pass').notNull(),
    environment: (0, sqlite_core_1.text)('environment').notNull().default('Dev'),
    isActive: (0, sqlite_core_1.integer)('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: (0, sqlite_core_1.integer)('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
exports.discoveredApps = (0, sqlite_core_1.sqliteTable)('discovered_apps', {
    id: (0, sqlite_core_1.text)('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    instanceId: (0, sqlite_core_1.text)('instance_id').notNull().references(() => exports.tomcatInstances.id),
    name: (0, sqlite_core_1.text)('name').notNull(),
    contextPath: (0, sqlite_core_1.text)('context_path').notNull(),
    tomcatState: (0, sqlite_core_1.text)('tomcat_state').notNull(),
    discoveredAt: (0, sqlite_core_1.integer)('discovered_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    lastSeenAt: (0, sqlite_core_1.integer)('last_seen_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    isPromoted: (0, sqlite_core_1.integer)('is_promoted', { mode: 'boolean' }).notNull().default(false),
    sessions: (0, sqlite_core_1.integer)('sessions').notNull().default(0),
});
exports.monitors = (0, sqlite_core_1.sqliteTable)('monitors', {
    id: (0, sqlite_core_1.text)('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    discoveredAppId: (0, sqlite_core_1.text)('discovered_app_id').references(() => exports.discoveredApps.id),
    name: (0, sqlite_core_1.text)('name').notNull(),
    url: (0, sqlite_core_1.text)('url').notNull(),
    environment: (0, sqlite_core_1.text)('environment').notNull().default('Dev'),
    status: (0, sqlite_core_1.text)('status').notNull().default('UNKNOWN'),
    lastChecked: (0, sqlite_core_1.integer)('last_checked', { mode: 'timestamp' }),
    lastTransitioned: (0, sqlite_core_1.integer)('last_transitioned', { mode: 'timestamp' }),
    checkInterval: (0, sqlite_core_1.integer)('check_interval').notNull().default(30),
    isEnabled: (0, sqlite_core_1.integer)('is_enabled', { mode: 'boolean' }).notNull().default(true),
    createdBy: (0, sqlite_core_1.text)('created_by').references(() => exports.users.id),
    createdAt: (0, sqlite_core_1.integer)('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
exports.checkResults = (0, sqlite_core_1.sqliteTable)('check_results', {
    id: (0, sqlite_core_1.text)('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    monitorId: (0, sqlite_core_1.text)('monitor_id').notNull().references(() => exports.monitors.id),
    status: (0, sqlite_core_1.text)('status').notNull(),
    responseTimeMs: (0, sqlite_core_1.integer)('response_time_ms'),
    errorCategory: (0, sqlite_core_1.text)('error_category'),
    errorMessage: (0, sqlite_core_1.text)('error_message'),
    checkedAt: (0, sqlite_core_1.integer)('checked_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    metadata: (0, sqlite_core_1.text)('metadata', { mode: 'json' }),
});
exports.stateTransitions = (0, sqlite_core_1.sqliteTable)('state_transitions', {
    id: (0, sqlite_core_1.text)('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    monitorId: (0, sqlite_core_1.text)('monitor_id').notNull().references(() => exports.monitors.id),
    fromStatus: (0, sqlite_core_1.text)('from_status').notNull(),
    toStatus: (0, sqlite_core_1.text)('to_status').notNull(),
    triggeredAt: (0, sqlite_core_1.integer)('triggered_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    acknowledgedBy: (0, sqlite_core_1.text)('acknowledged_by').references(() => exports.users.id),
    acknowledgedAt: (0, sqlite_core_1.integer)('acknowledged_at', { mode: 'timestamp' }),
});
exports.events = (0, sqlite_core_1.sqliteTable)('events', {
    id: (0, sqlite_core_1.text)('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    type: (0, sqlite_core_1.text)('type').notNull(),
    payload: (0, sqlite_core_1.text)('payload', { mode: 'json' }),
    emittedAt: (0, sqlite_core_1.integer)('emitted_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
exports.instanceHealthSnapshots = (0, sqlite_core_1.sqliteTable)('instance_health_snapshots', {
    id: (0, sqlite_core_1.text)('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    instanceId: (0, sqlite_core_1.text)('instance_id').notNull().references(() => exports.tomcatInstances.id),
    connectorName: (0, sqlite_core_1.text)('connector_name').notNull(), // e.g. "http-nio-8080"
    threadInfo: (0, sqlite_core_1.text)('thread_info', { mode: 'json' }).$type(),
    requestInfo: (0, sqlite_core_1.text)('request_info', { mode: 'json' }).$type(),
    memoryInfo: (0, sqlite_core_1.text)('memory_info', { mode: 'json' }).$type(),
    rawResponse: (0, sqlite_core_1.text)('raw_response'),
    collectedAt: (0, sqlite_core_1.integer)('collected_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
exports.jvmSnapshots = (0, sqlite_core_1.sqliteTable)('jvm_snapshots', {
    id: (0, sqlite_core_1.text)('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    instanceId: (0, sqlite_core_1.text)('instance_id').notNull().references(() => exports.tomcatInstances.id),
    runtimeInfo: (0, sqlite_core_1.text)('runtime_info', { mode: 'json' }).$type(),
    memoryPools: (0, sqlite_core_1.text)('memory_pools', { mode: 'json' }).$type(),
    gcInfo: (0, sqlite_core_1.text)('gc_info', { mode: 'json' }).$type(),
    osInfo: (0, sqlite_core_1.text)('os_info', { mode: 'json' }).$type(),
    rawResponse: (0, sqlite_core_1.text)('raw_response'),
    collectedAt: (0, sqlite_core_1.integer)('collected_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
