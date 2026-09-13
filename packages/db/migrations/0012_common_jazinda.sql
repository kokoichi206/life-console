CREATE TABLE `agent_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`lease_token` text NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`created_at` text NOT NULL,
	`answered_at` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_questions_pending_uidx` ON `agent_questions` (`job_id`,`lease_token`) WHERE "agent_questions"."answer" IS NULL;