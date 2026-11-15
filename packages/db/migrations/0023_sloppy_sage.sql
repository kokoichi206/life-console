ALTER TABLE `monitor_notifications` ADD `recovery_reserved_at` text;--> statement-breakpoint
CREATE INDEX `monitor_recovery_pending_idx` ON `monitor_notifications` (`incident_id`,`endpoint`) WHERE "monitor_notifications"."kind" = 'alert' AND "monitor_notifications"."accepted_at" IS NOT NULL AND "monitor_notifications"."recovery_reserved_at" IS NULL;--> statement-breakpoint
CREATE INDEX `calendar_reminder_expiry_idx` ON `calendar_reminders` (`status`,`expires_at`);--> statement-breakpoint
-- 既に復旧を予約した警告を検索対象から外し、未予約の受付は旧コードからの保存も含めて残す。
UPDATE monitor_notifications AS alert
SET recovery_reserved_at = (
  SELECT recovery.created_at FROM monitor_notifications AS recovery
  WHERE recovery.incident_id = alert.incident_id AND recovery.kind = 'recovery'
    AND recovery.slot = 0 AND recovery.endpoint = alert.endpoint
)
WHERE alert.kind = 'alert' AND alert.accepted_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM monitor_notifications AS recovery
    WHERE recovery.incident_id = alert.incident_id AND recovery.kind = 'recovery'
      AND recovery.slot = 0 AND recovery.endpoint = alert.endpoint
  );
