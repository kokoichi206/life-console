CREATE TABLE `calorie_baseline` (
	`id` integer PRIMARY KEY NOT NULL,
	`daily_expenditure_kcal` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `strava_activity_calories` (
	`activity_id` text PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`status` text NOT NULL,
	`calories_kcal` integer,
	`registered_at` text NOT NULL,
	`seen_at` text NOT NULL,
	`fetched_at` text
);
--> statement-breakpoint
CREATE INDEX `strava_activity_calories_pending_idx` ON `strava_activity_calories` (`status`,`occurred_at`);