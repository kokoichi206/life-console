CREATE TABLE `strava_calories_backfill` (
	`id` integer PRIMARY KEY NOT NULL,
	`cursor_to` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`updated_at` text NOT NULL
);
