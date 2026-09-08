import { monitorTargetId, type MonitorHistory, type MonitorObservation, type MonitorStatus, type RegisterMonitorsInput } from "@life-console/contracts";
import { err, ok, safeTry } from "@life-console/core";

import { appError } from "../shared/app-error";

const targetColumns = "id, runner_id AS runnerId, service, account, registered_at AS registeredAt, received_at AS receivedAt, outcome, failures, revision";
export type MonitorDelivery = { readonly id: string; readonly endpoint: string; readonly body: string; readonly leaseToken: string; readonly attempts: number };
export const createMonitoringRepository = (db: D1Database) => {
  const batch = async (statements: D1PreparedStatement[]) => {
    const result = await safeTry(() => db.batch(statements));
    return result.ok ? ok(undefined) : err(appError.storage(result.error));
  };
  return {
    async expectRunners(runnerIds: ReadonlyArray<string>, now: string) {
      if (runnerIds.length === 0) return ok(undefined);
      return batch(runnerIds.map((runnerId) => db.prepare("INSERT INTO monitor_targets (id, runner_id, service, account, registered_at) VALUES (?, ?, 'runner', 'process', ?) ON CONFLICT(id) DO NOTHING")
        .bind(monitorTargetId(runnerId, { service: "runner", account: "process" }), runnerId, now)));
    },
    async maintenanceFinished(now: string) {
      return batch([
        db.prepare("UPDATE monitor_notifications SET status = 'canceled' WHERE status IN ('pending', 'sending') AND endpoint NOT IN (SELECT endpoint FROM push_subscriptions)"),
        db.prepare("INSERT INTO system_state (key, value, updated_at) VALUES ('monitoring_last_success', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(now, now),
      ]);
    },
    async register(input: RegisterMonitorsInput, now: string) {
      const ids = input.targets.map((target) => monitorTargetId(input.runnerId, target));
      return batch([
        ...input.targets.map((target) => db.prepare(`INSERT INTO monitor_targets (id, runner_id, service, account, registered_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
          .bind(monitorTargetId(input.runnerId, target), input.runnerId, target.service, target.account, now)),
        db.prepare(`DELETE FROM monitor_targets WHERE runner_id = ? AND id NOT IN (${ids.map(() => "?").join(",")})`).bind(input.runnerId, ...ids),
        db.prepare("UPDATE monitor_incidents SET resolved_at = ? WHERE resolved_at IS NULL AND target_id NOT IN (SELECT id FROM monitor_targets)").bind(now),
        db.prepare("UPDATE monitor_notifications SET status = 'canceled' WHERE status IN ('pending', 'sending') AND incident_id IN (SELECT id FROM monitor_incidents WHERE target_id NOT IN (SELECT id FROM monitor_targets))"),
      ]);
    },
    async record(observation: MonitorObservation, historical: boolean, now: string) {
      const targetId = monitorTargetId(observation.runnerId, observation);
      const statements: D1PreparedStatement[] = [];
      if (!historical) {
        const target = await safeTry(() => db.prepare("SELECT id FROM monitor_targets WHERE id = ?").bind(targetId).first());
        if (!target.ok) return err(appError.storage(target.error));
        if (target.value === null) return err(appError.notFound("監視対象が登録されていません。runner を再登録してください。"));
        statements.push(db.prepare(`UPDATE monitor_targets SET received_at = ?, outcome = ?, failures = CASE WHEN ? = 'healthy' THEN 0 ELSE failures + 1 END, revision = revision + 1
          WHERE id = ? AND NOT EXISTS (SELECT 1 FROM monitor_observations WHERE id = ?)`)
          .bind(now, observation.outcome, observation.outcome, targetId, observation.id));
        if (observation.service === "runner") statements.push(db.prepare(`UPDATE runners SET last_heartbeat_at = ?, updated_at = ? WHERE id = ?
          AND NOT EXISTS (SELECT 1 FROM monitor_observations WHERE id = ?)`)
          .bind(now, now, observation.runnerId, observation.id));
        if (observation.service === "orca") statements.push(db.prepare("UPDATE runners SET orca_status = ?, updated_at = ? WHERE id = ?")
          .bind(observation.outcome === "healthy" ? "healthy" : "unreachable", now, observation.runnerId));
      }
      statements.push(db.prepare(`INSERT INTO monitor_observations (id, target_id, observed_at, received_at, outcome, historical) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
        .bind(observation.id, targetId, observation.observedAt, now, observation.outcome, historical ? 1 : 0));
      return batch(statements);
    },
    async list() {
      const result = await safeTry(() => db.prepare(`SELECT ${targetColumns} FROM monitor_targets ORDER BY runner_id, service, account`).all<MonitorStatus>());
      return result.ok ? ok(result.value.results) : err(appError.storage(result.error));
    },
    async history(targetId: string | undefined, before: number | undefined) {
      const result = await safeTry(() => db.prepare(`SELECT sequence, target_id AS targetId, json_extract(target_id, '$[0]') AS runnerId, json_extract(target_id, '$[1]') AS service, json_extract(target_id, '$[2]') AS account, observed_at AS observedAt, received_at AS receivedAt, outcome, historical FROM monitor_observations
        WHERE (? IS NULL OR target_id = ?) AND (? IS NULL OR sequence < ?) ORDER BY sequence DESC LIMIT 100`)
        .bind(targetId ?? null, targetId ?? null, before ?? null, before ?? null).all<MonitorHistory>());
      return result.ok ? ok(result.value.results) : err(appError.storage(result.error));
    },
    async deliveryCounts() {
      const result = await safeTry(() => db.prepare(`SELECT count(*) AS pendingNotifications, coalesce(sum(CASE WHEN attempts > 0 THEN 1 ELSE 0 END), 0) AS failedNotifications, (SELECT value FROM system_state WHERE key = 'monitoring_last_success') AS lastMaintenanceAt
        FROM monitor_notifications WHERE status IN ('pending', 'sending') AND endpoint IN (SELECT endpoint FROM push_subscriptions)`).first<{ pendingNotifications: number; failedNotifications: number; lastMaintenanceAt: string | null }>());
      return result.ok ? ok(result.value!) : err(appError.storage(result.error));
    },
    async decide(target: MonitorStatus, decision: "open" | "recover" | "hold", reason: string, now: string) {
      const statements: D1PreparedStatement[] = [];
      const current = "EXISTS (SELECT 1 FROM monitor_targets WHERE id = ? AND revision = ?)";
      if (decision === "open") {
        statements.push(db.prepare(`INSERT INTO monitor_incidents (id, target_id, opened_at, reason)
          SELECT ?, ?, ?, ? WHERE ${current} ON CONFLICT DO NOTHING`).bind(crypto.randomUUID(), target.id, now, reason, target.id, target.revision));
        // 未送信の古い再通知を積み上げず、同じ通知枠は端末ごとに一意にする。
        statements.push(db.prepare(`UPDATE monitor_notifications SET status = 'canceled' WHERE status = 'pending' AND kind = 'alert'
          AND incident_id IN (SELECT id FROM monitor_incidents WHERE target_id = ? AND resolved_at IS NULL)
          AND slot < (SELECT CAST((unixepoch(?) - unixepoch(opened_at)) / 1800 AS INTEGER) FROM monitor_incidents WHERE target_id = ? AND resolved_at IS NULL)
          AND ${current}`).bind(target.id, now, target.id, target.id, target.revision));
        statements.push(db.prepare(`INSERT INTO monitor_notifications (id, incident_id, endpoint, kind, slot, body, status, next_attempt_at, created_at)
          SELECT lower(hex(randomblob(16))), i.id, p.endpoint, 'alert', CAST((unixepoch(?) - unixepoch(i.opened_at)) / 1800 AS INTEGER), ?, 'pending', ?, ?
          FROM monitor_incidents i CROSS JOIN push_subscriptions p WHERE i.target_id = ? AND i.resolved_at IS NULL AND ${current} ON CONFLICT DO NOTHING`)
          .bind(now, `${target.runnerId} / ${target.service} (${target.account}): ${reason}`, now, now, target.id, target.id, target.revision));
      }
      if (decision === "recover") {
        statements.push(db.prepare(`UPDATE monitor_incidents SET resolved_at = ? WHERE target_id = ? AND resolved_at IS NULL AND ${current}`).bind(now, target.id, target.id, target.revision));
        statements.push(db.prepare(`UPDATE monitor_notifications SET status = 'canceled' WHERE status IN ('pending', 'sending') AND kind = 'alert'
          AND incident_id IN (SELECT id FROM monitor_incidents WHERE target_id = ? AND resolved_at IS NOT NULL) AND ${current}`).bind(target.id, target.id, target.revision));
      }
      // 配送の完了と復旧判定が前後しても、受付済みの端末へ復旧を一度予約する。
      statements.push(db.prepare(`INSERT INTO monitor_notifications (id, incident_id, endpoint, kind, slot, body, status, next_attempt_at, created_at)
        SELECT lower(hex(randomblob(16))), i.id, p.endpoint, 'recovery', 0, ?, 'pending', ?, ? FROM monitor_incidents i CROSS JOIN push_subscriptions p
        WHERE i.target_id = ? AND i.resolved_at IS NOT NULL AND EXISTS (SELECT 1 FROM monitor_notifications n WHERE n.incident_id = i.id AND n.endpoint = p.endpoint AND n.accepted_at IS NOT NULL AND n.kind = 'alert')
        ON CONFLICT DO NOTHING`).bind(`${target.runnerId} / ${target.service} (${target.account}): 復旧しました。`, now, now, target.id));
      return batch(statements);
    },
    async claim(now: string) {
      const token = crypto.randomUUID();
      const result = await safeTry(() => db.prepare(`UPDATE monitor_notifications SET status = 'sending', lease_token = ?, lease_expires_at = ?, attempts = attempts + 1
        WHERE id = (SELECT n.id FROM monitor_notifications n JOIN push_subscriptions p ON p.endpoint = n.endpoint
          WHERE (n.status = 'pending' AND n.next_attempt_at <= ?) OR (n.status = 'sending' AND n.lease_expires_at <= ?) ORDER BY n.created_at LIMIT 1)
        RETURNING id, endpoint, body, lease_token AS leaseToken, attempts`).bind(token, new Date(Date.parse(now) + 60_000).toISOString(), now, now).first<MonitorDelivery>());
      if (!result.ok) return err(appError.storage(result.error));
      if (result.value === null) return ok(null);
      const started = await batch([db.prepare("INSERT INTO monitor_delivery_attempts (id, notification_id, started_at) VALUES (?, ?, ?)").bind(token, result.value.id, now)]);
      return started.ok ? ok(result.value) : started;
    },
    async finish(delivery: MonitorDelivery, outcome: "accepted" | "expired" | "failed", now: string) {
      const next = new Date(Date.parse(now) + Math.min(1800, 60 * 2 ** Math.min(delivery.attempts - 1, 5)) * 1000).toISOString();
      const statements = [
        db.prepare("UPDATE monitor_delivery_attempts SET finished_at = ?, outcome = ? WHERE id = ?").bind(now, outcome, delivery.leaseToken),
        db.prepare(`UPDATE monitor_notifications SET status = CASE WHEN status = 'canceled' THEN status ELSE ? END,
          accepted_at = CASE WHEN ? = 'accepted' THEN ? ELSE accepted_at END, next_attempt_at = ?, lease_token = NULL, lease_expires_at = NULL WHERE id = ? AND lease_token = ?`)
          .bind(outcome === "failed" ? "pending" : outcome, outcome, now, next, delivery.id, delivery.leaseToken),
      ];
      if (outcome === "expired") statements.push(db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(delivery.endpoint));
      return batch(statements);
    },
  };
};
export type MonitoringRepository = ReturnType<typeof createMonitoringRepository>;
