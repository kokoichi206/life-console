CREATE INDEX `jobs_kind_created_idx` ON `jobs` (`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `monitor_incidents_target_resolved_idx` ON `monitor_incidents` (`target_id`,`resolved_at`);--> statement-breakpoint
CREATE INDEX `nutrition_estimates_meal_time_idx` ON `nutrition_estimates` (`meal_id`,`analyzed_at`);