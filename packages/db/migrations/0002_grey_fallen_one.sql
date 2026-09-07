CREATE TABLE `reply_drafts` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`body` text NOT NULL,
	`reason` text NOT NULL,
	`reply_evidence_id` text,
	`checked_at` text NOT NULL,
	`edited_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
