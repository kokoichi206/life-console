CREATE TABLE `shopping_item_places` (
	`item_id` text NOT NULL,
	`place_id` text NOT NULL,
	PRIMARY KEY(`item_id`, `place_id`),
	FOREIGN KEY (`item_id`) REFERENCES `shopping_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `shopping_places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shopping_item_places_place_idx` ON `shopping_item_places` (`place_id`);--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`purchased_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shopping_places` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `area` text DEFAULT 'work' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `scheduled_at` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `source_url` text;