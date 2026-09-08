CREATE TABLE `strava_connection` (
	`id` integer PRIMARY KEY NOT NULL,
	`credentials` text,
	`lease_token` text,
	`lease_expires_at` integer
);
