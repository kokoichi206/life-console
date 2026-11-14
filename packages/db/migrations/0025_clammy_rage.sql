CREATE TABLE `meal_photo_blurs` (
	`photo_id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`upload_token_hash` text NOT NULL,
	`upload_expires_at` text NOT NULL,
	`uploaded_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `meal_photos`(`id`) ON UPDATE no action ON DELETE no action
);
