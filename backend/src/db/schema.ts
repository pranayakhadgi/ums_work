import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';


export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull().default('viewer'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});


export const tomcatInstances = sqliteTable('tomcat_instances', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  scheme: text('scheme').notNull().default('http'),
  host: text('host').notNull(),
  port: integer('port').notNull().default(8080),
  managerUrl: text('manager_url').notNull(),
  managerUser: text('manager_user').notNull(),
  managerPass: text('manager_pass').notNull(),
  environment: text('environment').notNull().default('Dev'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});


export const discoveredApps = sqliteTable('discovered_apps', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  instanceId: text('instance_id').notNull().references(() => tomcatInstances.id),
  name: text('name').notNull(),
  contextPath: text('context_path').notNull(),
  tomcatState: text('tomcat_state').notNull(),
  discoveredAt: integer('discovered_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  isPromoted: integer('is_promoted', { mode: 'boolean' }).notNull().default(false),
});


export const monitors = sqliteTable('monitors', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  discoveredAppId: text('discovered_app_id').references(() => discoveredApps.id),
  name: text('name').notNull(),
  url: text('url').notNull(),
  environment: text('environment').notNull().default('Dev'),
  status: text('status').notNull().default('UNKNOWN'),
  lastChecked: integer('last_checked', { mode: 'timestamp' }),
  lastTransitioned: integer('last_transitioned', { mode: 'timestamp' }),
  checkInterval: integer('check_interval').notNull().default(30),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  createdBy: text('created_by').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});


export const checkResults = sqliteTable('check_results', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  monitorId: text('monitor_id').notNull().references(() => monitors.id),
  status: text('status').notNull(),
  responseTimeMs: integer('response_time_ms'),
  errorCategory: text('error_category'),
  errorMessage: text('error_message'),
  checkedAt: integer('checked_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  metadata: text('metadata', { mode: 'json' }),
});


export const stateTransitions = sqliteTable('state_transitions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  monitorId: text('monitor_id').notNull().references(() => monitors.id),
  fromStatus: text('from_status').notNull(),
  toStatus: text('to_status').notNull(),
  triggeredAt: integer('triggered_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  acknowledgedBy: text('acknowledged_by').references(() => users.id),
  acknowledgedAt: integer('acknowledged_at', { mode: 'timestamp' }),
});


export const events = sqliteTable('events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text('type').notNull(),
  payload: text('payload', { mode: 'json' }),
  emittedAt: integer('emitted_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});



export const instanceHealthSnapshots = sqliteTable('instance_health_snapshots', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  instanceId: text('instance_id').notNull().references(() => tomcatInstances.id),
  connectorName: text('connector_name').notNull(), // e.g. "http-nio-8080"
  threadInfo: text('thread_info', { mode: 'json' }).$type<{
    maxThreads: number;
    currentThreadCount: number;
    currentThreadsBusy: number;
    keepAliveCount: number;
  }>(),
  requestInfo: text('request_info', { mode: 'json' }).$type<{
    maxProcessingTime: number;
    processingTime: number;
    requestCount: number;
    errorCount: number;
    bytesReceived: number;
    bytesSent: number;
  }>(),
  memoryInfo: text('memory_info', { mode: 'json' }).$type<{
    freeMemory: number; // MB
    totalMemory: number; // MB
    maxMemory: number; // MB
  }>(),
  rawResponse: text('raw_response'),
  collectedAt: integer('collected_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const jvmSnapshots = sqliteTable('jvm_snapshots', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  instanceId: text('instance_id').notNull().references(() => tomcatInstances.id),
  runtimeInfo: text('runtime_info', { mode: 'json' }).$type<{
    vmName: string;
    vmVersion: string;
    vmVendor: string;
    uptime: number; // in milliseconds
  }>(),
  memoryPools: text('memory_pools', { mode: 'json' }).$type<{
    name: string;
    type: string;
    used: number; // bytes or MB depending on parser
    committed: number;
    max: number;
  }[]>(),
  gcInfo: text('gc_info', { mode: 'json' }).$type<{
    name: string;
    collectionCount: number;
    collectionTime: number;
  }[]>(),
  osInfo: text('os_info', { mode: 'json' }).$type<{
    osName: string;
    osVersion: string;
    architecture: string;
    availableProcessors: number;
    systemLoadAverage: number;
  }>(),
  rawResponse: text('raw_response'),
  collectedAt: integer('collected_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});