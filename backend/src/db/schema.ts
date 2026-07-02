import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  unique
} from 'drizzle-orm/pg-core';

//enums
export const roleEnum = pgEnum('role', ['admin', 'operator', 'viewer']);
export const environmentEnum = pgEnum('environment', ['Dev', 'QA', 'Prod']);
export const statusEnum = pgEnum('status', ['UP', 'DOWN', 'UNKNOWN', 'PAUSED']);
export const errorCategoryEnum = pgEnum('error_category', [
  'TIMEOUT',
  'REFUSED',
  'DNS_FAILURE',
  'CERT_EXPIRED',
  'UNKNOWN',
  'PROBE_FAILURE'
]);
export const eventTypeEnum = pgEnum('event_type', [
  'STATE_TRANSITION',
  'DISCOVERY_COMPLETED',
  'MONITOR_CREATED',
  'MONITOR_UPDATED',
  'MONITOR_DELETED',
  'CHECK_COMPLETED',
]);

//users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull().default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

//tomcat instances
export const tomcatInstances = pgTable('tomcat_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  scheme: text('scheme').notNull().default('http'),
  host: text('host').notNull(),
  port: integer('port').notNull().default(8080),
  managerUrl: text('manager_url').notNull(),
  managerUser: text('manager_user').notNull(),
  managerPass: text('manager_pass').notNull(),
  environment: environmentEnum('environment').notNull().default('Dev'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

//discovered apps (candidate pool)
export const discoveredApps = pgTable('discovered_apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id')
    .references(() => tomcatInstances.id)
    .notNull(),
  name: text('name').notNull(),
  contextPath: text('context_path').notNull(),
  tomcatState: text('tomcat_state').notNull(),
  discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  isPromoted: boolean('is_promoted').notNull().default(false),
}, (table) => ({
  unqInstanceContext: unique('discovered_apps_instance_context_unique')
    .on(table.instanceId, table.contextPath),
}));

//monitors (curated, active monitoring)
export const monitors = pgTable('monitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  discoveredAppId: uuid('discovered_app_id').references(() => discoveredApps.id),
  name: text('name').notNull(),
  url: text('url').notNull(),
  environment: environmentEnum('environment').notNull().default('Dev'),
  status: statusEnum('status').notNull().default('UNKNOWN'),
  lastChecked: timestamp('last_checked', { withTimezone: true }),
  lastTransitioned: timestamp('last_transitioned', { withTimezone: true }),
  checkInterval: integer('check_interval').notNull().default(30),//might switch to bullmq later
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

//(time-series)
export const checkResults = pgTable('check_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  monitorId: uuid('monitor_id')
    .references(() => monitors.id)
    .notNull(),
  status: statusEnum('status').notNull(),
  responseTimeMs: integer('response_time_ms'),
  errorCategory: errorCategoryEnum('error_category'),
  errorMessage: text('error_message'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata'),
});

//state transitions (Event Log) 
export const stateTransitions = pgTable('state_transitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  monitorId: uuid('monitor_id')
    .references(() => monitors.id)
    .notNull(),
  fromStatus: statusEnum('from_status').notNull(),
  toStatus: statusEnum('to_status').notNull(),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  acknowledgedBy: uuid('acknowledged_by').references(() => users.id),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
});

// ── Events (General Event Stream) ────────────────────────────────────────────
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: eventTypeEnum('type').notNull(),
  payload: jsonb('payload'),
  emittedAt: timestamp('emitted_at', { withTimezone: true }).notNull().defaultNow(),
});