CREATE TABLE `asset_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`account_name` text NOT NULL,
	`asset_kind` text NOT NULL,
	`amount_yen` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connector_states` (
	`connector` text NOT NULL,
	`source_id` text NOT NULL,
	`watermark` text,
	`last_success_at` text,
	`next_run_at` text,
	`last_error_code` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`connector`, `source_id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`connector` text NOT NULL,
	`source_id` text NOT NULL,
	`external_message_id` text NOT NULL,
	`author_label` text NOT NULL,
	`excerpt` text NOT NULL,
	`source_url` text,
	`classification` text NOT NULL,
	`occurred_at` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_external_uidx` ON `conversations` (`connector`,`source_id`,`external_message_id`);--> statement-breakpoint
CREATE TABLE `finance_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`amount_delta_yen` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_transaction_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_yen` integer NOT NULL,
	`category` text NOT NULL,
	`payment_method` text NOT NULL,
	`payee` text NOT NULL,
	`occurred_at` text NOT NULL,
	`recorded_at` text NOT NULL,
	`source_job_id` text,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_source_uidx` ON `finance_transactions` (`source`,`source_transaction_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text,
	`task_id` text,
	`repository_id` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`runner_id` text,
	`lease_token` text,
	`lease_expires_at` text,
	`last_heartbeat_at` text,
	`progress_updated_at` text,
	`cancel_requested_at` text,
	`deadline_at` text,
	`attempt` integer NOT NULL,
	`provider` text,
	`summary` text,
	`error_code` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_idempotency_uidx` ON `jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `jobs_claim_idx` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `meal_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`upload_token_hash` text NOT NULL,
	`upload_expires_at` text NOT NULL,
	`uploaded_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_photos_client_uidx` ON `meal_photos` (`client_id`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`photo_id` text,
	`memo` text NOT NULL,
	`meal_kind` text NOT NULL,
	`occurred_at` text NOT NULL,
	`recorded_at` text NOT NULL,
	`tags_json` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meals_client_uidx` ON `meals` (`client_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`occurred_at` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nutrition_estimates` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`source_job_id` text,
	`model` text NOT NULL,
	`analyzed_at` text NOT NULL,
	`input_hash` text NOT NULL,
	`calories_kcal` integer NOT NULL,
	`protein_grams` integer NOT NULL,
	`fat_grams` integer NOT NULL,
	`carbohydrate_grams` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`target` text NOT NULL,
	`external_url` text,
	`external_id` text,
	`source_job_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`local_path` text NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_path_uidx` ON `repositories` (`local_path`);--> statement-breakpoint
CREATE TABLE `runners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`last_heartbeat_at` text NOT NULL,
	`token_expires_at` text,
	`orca_status` text NOT NULL,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`job_kind` text NOT NULL,
	`interval` text NOT NULL,
	`timezone` text NOT NULL,
	`next_run_at` text NOT NULL,
	`coalescing` text NOT NULL,
	`deadline_seconds` integer NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `schedules_due_idx` ON `schedules` (`enabled`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `source_repository_mappings` (
	`connector` text NOT NULL,
	`source_scope` text NOT NULL,
	`source_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`connector`, `source_scope`, `source_id`, `repository_id`, `role`)
);
--> statement-breakpoint
CREATE TABLE `system_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_repositories` (
	`task_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`task_id`, `repository_id`, `role`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`due_at` text,
	`completed_at` text,
	`conversation_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_status_due_idx` ON `tasks` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `weights` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_key` text NOT NULL,
	`weight_grams` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`recorded_at` text NOT NULL,
	`source_job_id` text,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weights_source_uidx` ON `weights` (`source`,`source_key`);