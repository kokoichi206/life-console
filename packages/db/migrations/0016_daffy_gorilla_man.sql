CREATE TABLE `abstinence_events` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`duration_minutes` integer,
	`memo` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `abstinence_events_occurred_idx` ON `abstinence_events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `abstinence_goal` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`started_at` text NOT NULL,
	`target_days` integer NOT NULL,
	`target_date` text
);
