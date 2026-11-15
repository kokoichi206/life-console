CREATE TABLE `work_confirmation_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`confirmation_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text NOT NULL,
	`lease_token` text,
	`lease_expires_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`confirmation_id`) REFERENCES `work_confirmations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_confirmation_delivery_uidx` ON `work_confirmation_notifications` (`confirmation_id`,`endpoint`);--> statement-breakpoint
CREATE INDEX `work_confirmation_delivery_due_idx` ON `work_confirmation_notifications` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `work_confirmation_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`last_success_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`repository_name` text NOT NULL,
	`source_url` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`environment` text NOT NULL,
	`question` text NOT NULL,
	`reason` text NOT NULL,
	`recommendation` text NOT NULL,
	`evidence_json` text NOT NULL,
	`requested_at` text NOT NULL,
	`checked_at` text NOT NULL,
	`completed_at` text,
	`completed_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `work_confirmation_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_confirmations_external_uidx` ON `work_confirmations` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `work_confirmations_pending_idx` ON `work_confirmations` (`completed_at`,`requested_at`);