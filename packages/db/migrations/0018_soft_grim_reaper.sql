CREATE INDEX `jobs_kind_meal_created_idx` ON `jobs` (`kind`,cast(json_extract(`payload_json`, '$.mealId') as text),`created_at`);
