ALTER TABLE `connector_states` ADD `source_label` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_conversation_uidx` ON `tasks` (`conversation_id`);