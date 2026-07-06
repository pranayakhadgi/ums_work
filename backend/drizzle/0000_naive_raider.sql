CREATE TABLE `check_results` (
	`id` text PRIMARY KEY NOT NULL,
	`monitor_id` text NOT NULL,
	`status` text NOT NULL,
	`response_time_ms` integer,
	`error_category` text,
	`error_message` text,
	`checked_at` integer NOT NULL,
	`metadata` text,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `discovered_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`name` text NOT NULL,
	`context_path` text NOT NULL,
	`tomcat_state` text NOT NULL,
	`discovered_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`is_promoted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `tomcat_instances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`emitted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `instance_health_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`connector_name` text NOT NULL,
	`thread_info` text,
	`request_info` text,
	`memory_info` text,
	`raw_response` text,
	`collected_at` integer,
	FOREIGN KEY (`instance_id`) REFERENCES `tomcat_instances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jvm_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`runtime_info` text,
	`memory_pools` text,
	`gc_info` text,
	`os_info` text,
	`raw_response` text,
	`collected_at` integer,
	FOREIGN KEY (`instance_id`) REFERENCES `tomcat_instances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `monitors` (
	`id` text PRIMARY KEY NOT NULL,
	`discovered_app_id` text,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`environment` text DEFAULT 'Dev' NOT NULL,
	`status` text DEFAULT 'UNKNOWN' NOT NULL,
	`last_checked` integer,
	`last_transitioned` integer,
	`check_interval` integer DEFAULT 30 NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`discovered_app_id`) REFERENCES `discovered_apps`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `state_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`monitor_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`triggered_at` integer NOT NULL,
	`acknowledged_by` text,
	`acknowledged_at` integer,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`acknowledged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tomcat_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`scheme` text DEFAULT 'http' NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 8080 NOT NULL,
	`manager_url` text NOT NULL,
	`manager_user` text NOT NULL,
	`manager_pass` text NOT NULL,
	`environment` text DEFAULT 'Dev' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);