CREATE TABLE `job_heartbeat_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`runner_id` text NOT NULL,
	`received_at` text NOT NULL,
	`accepted` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitor_delivery_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`outcome` text
);
--> statement-breakpoint
CREATE TABLE `monitor_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`opened_at` text NOT NULL,
	`resolved_at` text,
	`reason` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitor_open_incident_uidx` ON `monitor_incidents` (`target_id`) WHERE resolved_at IS NULL;--> statement-breakpoint
CREATE TABLE `monitor_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`kind` text NOT NULL,
	`slot` integer NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text NOT NULL,
	`lease_token` text,
	`lease_expires_at` text,
	`accepted_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitor_delivery_uidx` ON `monitor_notifications` (`incident_id`,`kind`,`slot`,`endpoint`);--> statement-breakpoint
CREATE INDEX `monitor_delivery_due_idx` ON `monitor_notifications` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `monitor_observations` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`target_id` text NOT NULL,
	`observed_at` text NOT NULL,
	`received_at` text NOT NULL,
	`outcome` text NOT NULL,
	`historical` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitor_event_uidx` ON `monitor_observations` (`id`);--> statement-breakpoint
CREATE INDEX `monitor_history_idx` ON `monitor_observations` (`target_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `monitor_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`runner_id` text NOT NULL,
	`service` text NOT NULL,
	`account` text NOT NULL,
	`registered_at` text NOT NULL,
	`received_at` text,
	`outcome` text,
	`failures` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
