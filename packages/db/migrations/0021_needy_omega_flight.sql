CREATE TABLE `calendar_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`reminder_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text NOT NULL,
	`lease_token` text,
	`lease_expires_at` text,
	FOREIGN KEY (`reminder_id`) REFERENCES `calendar_reminders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_delivery_endpoint_uidx` ON `calendar_deliveries` (`reminder_id`,`endpoint`);--> statement-breakpoint
CREATE INDEX `calendar_delivery_due_idx` ON `calendar_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`calendar_key` text NOT NULL,
	`source_key` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`notes` text NOT NULL,
	`source_url` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_source_uidx` ON `calendar_events` (`source`,`source_key`);--> statement-breakpoint
CREATE INDEX `calendar_dates_idx` ON `calendar_events` (`calendar_key`,`date`);--> statement-breakpoint
CREATE TABLE `calendar_preparations` (
	`event_id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`applied_due_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `calendar_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_preparation_task_uidx` ON `calendar_preparations` (`task_id`);--> statement-breakpoint
CREATE TABLE `calendar_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`slot` text NOT NULL,
	`due_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `calendar_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_reminder_slot_uidx` ON `calendar_reminders` (`event_id`,`slot`,`due_at`);--> statement-breakpoint
CREATE INDEX `calendar_reminder_due_idx` ON `calendar_reminders` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `collection_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`district` text NOT NULL,
	`previous_day_time` text,
	`same_day_time` text,
	`notifications_enabled` integer NOT NULL,
	`updated_at` text NOT NULL
);
