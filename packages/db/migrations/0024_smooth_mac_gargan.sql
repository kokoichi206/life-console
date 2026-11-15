ALTER TABLE `monitor_incidents` ADD `recovery_reservation_pending` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `monitor_incident_recovery_pending_idx` ON `monitor_incidents` (`target_id`) WHERE "monitor_incidents"."recovery_reservation_pending" = 1;--> statement-breakpoint
-- 既存の復旧済み障害も一度確認し、旧コードが残した未予約の受付を引き継ぐ。
UPDATE monitor_incidents SET recovery_reservation_pending = 1 WHERE resolved_at IS NOT NULL;
