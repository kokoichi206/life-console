CREATE TABLE `strava_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sport_type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`distance_meters` real NOT NULL,
	`moving_seconds` integer NOT NULL,
	`elapsed_seconds` integer NOT NULL,
	`average_heartrate` real,
	FOREIGN KEY (`id`) REFERENCES `strava_activity_calories`(`activity_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `strava_activities_occurred_idx` ON `strava_activities` (`occurred_at`,`id`);--> statement-breakpoint
ALTER TABLE `strava_calories_backfill` ADD `includes_activities` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `strava_activity_calories_occurred_idx` ON `strava_activity_calories` (`occurred_at`);