import { monitorTargetId, type MonitorHistory, type MonitorObservation, type MonitorStatus, type RegisterMonitorsInput } from "@life-console/contracts";
import { err, ok, safeTry } from "@life-console/core";
import { monitorDeliveryAttempts, monitorIncidents, monitorNotifications, monitorObservations, monitorTargets, pushSubscriptions, runners, systemState } from "@life-console/db";
import type { MonitorNotificationKind, MonitorDeliveryOutcome } from "@life-console/domain";
import { and, asc, count, desc, eq, exists, inArray, isNotNull, isNull, lt, lte, notExists, notInArray, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";

import { appError } from "../shared/app-error";

export type MonitorDelivery = { readonly id: string; readonly endpoint: string; readonly body: string; readonly leaseToken: string; readonly attempts: number };
export const createMonitoringRepository = (database: D1Database) => {
  const db = drizzle(database);
  const batch = async (statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]) => {
    const result = await safeTry(() => db.batch(statements));
    return result.ok ? ok(undefined) : err(appError.storage(result.error));
  };
  return {
    async expectRunners(runnerIds: ReadonlyArray<string>, now: string) {
      if (runnerIds.length === 0) return ok(undefined);
      const statements = runnerIds.map((runnerId) => db.insert(monitorTargets).values({
        id: monitorTargetId(runnerId, { service: "runner", account: "process" }), runnerId, service: "runner", account: "process", registeredAt: now,
      }).onConflictDoNothing({ target: monitorTargets.id }));
      return batch([statements[0]!, ...statements.slice(1)]);
    },
    async maintenanceFinished(now: string) {
      return batch([
        db.update(monitorNotifications).set({ status: "canceled" }).where(and(inArray(monitorNotifications.status, ["pending", "sending"]),
          notInArray(monitorNotifications.endpoint, db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions)))),
        db.insert(systemState).values({ key: "monitoring_last_success", value: now, updatedAt: now })
          .onConflictDoUpdate({ target: systemState.key, set: { value: now, updatedAt: now } }),
      ]);
    },
    async register(input: RegisterMonitorsInput, now: string) {
      const ids = input.targets.map((target) => monitorTargetId(input.runnerId, target));
      const registrations = input.targets.map((target) => db.insert(monitorTargets).values({
        id: monitorTargetId(input.runnerId, target), runnerId: input.runnerId, service: target.service, account: target.account, registeredAt: now,
      }).onConflictDoNothing({ target: monitorTargets.id }));
      const missingTarget = notInArray(monitorIncidents.targetId, db.select({ id: monitorTargets.id }).from(monitorTargets));
      return batch([
        registrations[0]!, ...registrations.slice(1),
        db.delete(monitorTargets).where(and(eq(monitorTargets.runnerId, input.runnerId), notInArray(monitorTargets.id, ids))),
        db.update(monitorIncidents).set({ resolvedAt: now }).where(and(isNull(monitorIncidents.resolvedAt), missingTarget)),
        db.update(monitorNotifications).set({ status: "canceled" }).where(and(inArray(monitorNotifications.status, ["pending", "sending"]),
          inArray(monitorNotifications.incidentId, db.select({ id: monitorIncidents.id }).from(monitorIncidents).where(missingTarget)))),
      ]);
    },
    async record(observation: MonitorObservation, historical: boolean, now: string) {
      const targetId = monitorTargetId(observation.runnerId, observation);
      const updates: BatchItem<"sqlite">[] = [];
      if (!historical) {
        const target = await safeTry(() => db.select({ id: monitorTargets.id }).from(monitorTargets).where(eq(monitorTargets.id, targetId)).get());
        if (!target.ok) return err(appError.storage(target.error));
        if (target.value === undefined) return err(appError.notFound("監視対象が登録されていません。runner を再登録してください。"));
        const unseenObservation = notExists(db.select({ id: monitorObservations.id }).from(monitorObservations).where(eq(monitorObservations.id, observation.id)));
        updates.push(db.update(monitorTargets).set({ receivedAt: now, outcome: observation.outcome,
          failures: observation.outcome === "healthy" ? 0 : sql`${monitorTargets.failures} + 1`, revision: sql`${monitorTargets.revision} + 1`,
        }).where(and(eq(monitorTargets.id, targetId), unseenObservation)));
        if (observation.service === "runner") updates.push(db.update(runners).set({ lastHeartbeatAt: now, updatedAt: now })
          .where(and(eq(runners.id, observation.runnerId), unseenObservation)));
        if (observation.service === "orca") updates.push(db.update(runners).set({ orcaStatus: observation.outcome === "healthy" ? "healthy" : "unreachable", updatedAt: now })
          .where(eq(runners.id, observation.runnerId)));
      }
      const saveObservation = db.insert(monitorObservations).values({ id: observation.id, targetId, observedAt: observation.observedAt,
        receivedAt: now, outcome: observation.outcome, historical: historical ? 1 : 0,
      }).onConflictDoNothing({ target: monitorObservations.id });
      const statements = [...updates, saveObservation];
      return batch([statements[0]!, ...statements.slice(1)]);
    },
    async list() {
      const result = await safeTry(() => db.select().from(monitorTargets)
        .orderBy(asc(monitorTargets.runnerId), asc(monitorTargets.service), asc(monitorTargets.account)).all());
      return result.ok ? ok(result.value) : err(appError.storage(result.error));
    },
    async history(targetId: string | undefined, before: number | undefined) {
      const result = await safeTry(() => db.select({ sequence: monitorObservations.sequence, targetId: monitorObservations.targetId,
        runnerId: sql<string>`json_extract(${monitorObservations.targetId}, '$[0]')`.as("runnerId"),
        service: sql<MonitorHistory["service"]>`json_extract(${monitorObservations.targetId}, '$[1]')`.as("service"),
        account: sql<string>`json_extract(${monitorObservations.targetId}, '$[2]')`.as("account"),
        observedAt: monitorObservations.observedAt, receivedAt: monitorObservations.receivedAt, outcome: monitorObservations.outcome, historical: monitorObservations.historical,
      }).from(monitorObservations).where(and(targetId === undefined ? undefined : eq(monitorObservations.targetId, targetId),
        before === undefined ? undefined : lt(monitorObservations.sequence, before),
      )).orderBy(desc(monitorObservations.sequence)).limit(100).all());
      return result.ok ? ok(result.value) : err(appError.storage(result.error));
    },
    async deliveryCounts() {
      const maintenance = db.select({ value: systemState.value }).from(systemState).where(eq(systemState.key, "monitoring_last_success"));
      const result = await safeTry(() => db.select({ pendingNotifications: count(),
        failedNotifications: sql<number>`coalesce(sum(case when ${monitorNotifications.attempts} > 0 then 1 else 0 end), 0)`.as("failedNotifications"),
        lastMaintenanceAt: sql<string | null>`${maintenance}`.as("lastMaintenanceAt"),
      }).from(monitorNotifications).where(and(inArray(monitorNotifications.status, ["pending", "sending"]),
        inArray(monitorNotifications.endpoint, db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions)),
      )).get());
      return result.ok ? ok(result.value!) : err(appError.storage(result.error));
    },
    async decide(target: MonitorStatus, decision: "open" | "recover" | "hold", reason: string, now: string) {
      const updates: BatchItem<"sqlite">[] = [];
      const current = exists(db.select({ id: monitorTargets.id }).from(monitorTargets).where(and(eq(monitorTargets.id, target.id), eq(monitorTargets.revision, target.revision))));
      const openIncident = and(eq(monitorIncidents.targetId, target.id), isNull(monitorIncidents.resolvedAt));
      const slot = sql<number>`cast((unixepoch(${now}) - unixepoch(${monitorIncidents.openedAt})) / 1800 as integer)`;
      const notificationSelection = (kind: MonitorNotificationKind, body: string) => ({
        id: sql`lower(hex(randomblob(16)))`.as("id"), incidentId: monitorIncidents.id, endpoint: pushSubscriptions.endpoint,
        kind: sql`${kind}`.as("kind"), slot: kind === "alert" ? slot.as("slot") : sql`0`.as("slot"), body: sql`${body}`.as("body"), status: sql`'pending'`.as("status"), attempts: sql`0`.as("attempts"),
        nextAttemptAt: sql`${now}`.as("nextAttemptAt"), leaseToken: sql`null`.as("leaseToken"), leaseExpiresAt: sql`null`.as("leaseExpiresAt"), acceptedAt: sql`null`.as("acceptedAt"), createdAt: sql`${now}`.as("createdAt"),
      });
      if (decision === "open") {
        updates.push(db.insert(monitorIncidents).select(db.select({ id: sql`${crypto.randomUUID()}`.as("id"), targetId: monitorTargets.id,
          openedAt: sql`${now}`.as("openedAt"), resolvedAt: sql`null`.as("resolvedAt"), reason: sql`${reason}`.as("reason"),
        }).from(monitorTargets).where(and(eq(monitorTargets.id, target.id), eq(monitorTargets.revision, target.revision)))).onConflictDoNothing());
        // 未送信の古い再通知を積み上げず、同じ通知枠は端末ごとに一意にする。
        updates.push(db.update(monitorNotifications).set({ status: "canceled" }).where(and(eq(monitorNotifications.status, "pending"), eq(monitorNotifications.kind, "alert"),
          inArray(monitorNotifications.incidentId, db.select({ id: monitorIncidents.id }).from(monitorIncidents).where(openIncident)),
          lt(monitorNotifications.slot, db.select({ slot }).from(monitorIncidents).where(openIncident)), current,
        )));
        updates.push(db.insert(monitorNotifications).select(db.select(notificationSelection("alert", `${target.runnerId} / ${target.service} (${target.account}): ${reason}`))
          .from(monitorIncidents).innerJoin(pushSubscriptions, sql`1`).where(and(openIncident, current))).onConflictDoNothing());
      }
      if (decision === "recover") {
        const resolvedIncident = and(eq(monitorIncidents.targetId, target.id), isNotNull(monitorIncidents.resolvedAt));
        updates.push(db.update(monitorIncidents).set({ resolvedAt: now }).where(and(openIncident, current)));
        updates.push(db.update(monitorNotifications).set({ status: "canceled" }).where(and(inArray(monitorNotifications.status, ["pending", "sending"]), eq(monitorNotifications.kind, "alert"),
          inArray(monitorNotifications.incidentId, db.select({ id: monitorIncidents.id }).from(monitorIncidents).where(resolvedIncident)), current,
        )));
      }
      // 配送の完了と復旧判定が前後しても、受付済みの端末へ復旧を一度予約する。
      const accepted = alias(monitorNotifications, "accepted_alert");
      const recovery = db.insert(monitorNotifications).select(db.select(notificationSelection("recovery", `${target.runnerId} / ${target.service} (${target.account}): 復旧しました。`))
        .from(monitorIncidents).innerJoin(pushSubscriptions, sql`1`).where(and(eq(monitorIncidents.targetId, target.id), isNotNull(monitorIncidents.resolvedAt),
          exists(db.select({ id: accepted.id }).from(accepted).where(and(eq(accepted.incidentId, monitorIncidents.id), eq(accepted.endpoint, pushSubscriptions.endpoint),
            isNotNull(accepted.acceptedAt), eq(accepted.kind, "alert")))),
        ))).onConflictDoNothing();
      const statements = [...updates, recovery];
      return batch([statements[0]!, ...statements.slice(1)]);
    },
    async claim(now: string) {
      const token = crypto.randomUUID();
      const candidate = alias(monitorNotifications, "candidate");
      const next = db.select({ id: candidate.id }).from(candidate).innerJoin(pushSubscriptions, eq(pushSubscriptions.endpoint, candidate.endpoint))
        .where(or(and(eq(candidate.status, "pending"), lte(candidate.nextAttemptAt, now)), and(eq(candidate.status, "sending"), lte(candidate.leaseExpiresAt, now))))
        .orderBy(asc(candidate.createdAt)).limit(1);
      const result = await safeTry(() => db.update(monitorNotifications).set({ status: "sending", leaseToken: token,
        leaseExpiresAt: new Date(Date.parse(now) + 60_000).toISOString(), attempts: sql`${monitorNotifications.attempts} + 1`,
      }).where(eq(monitorNotifications.id, next)).returning({ id: monitorNotifications.id, endpoint: monitorNotifications.endpoint,
        body: monitorNotifications.body, leaseToken: monitorNotifications.leaseToken, attempts: monitorNotifications.attempts,
      }).get());
      if (!result.ok) return err(appError.storage(result.error));
      if (result.value === undefined) return ok(null);
      const delivery = { ...result.value, leaseToken: token };
      const started = await batch([db.insert(monitorDeliveryAttempts).values({ id: token, notificationId: delivery.id, startedAt: now })]);
      return started.ok ? ok(delivery) : started;
    },
    async finish(delivery: MonitorDelivery, outcome: MonitorDeliveryOutcome, now: string) {
      const next = new Date(Date.parse(now) + Math.min(1800, 60 * 2 ** Math.min(delivery.attempts - 1, 5)) * 1000).toISOString();
      const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
        db.update(monitorDeliveryAttempts).set({ finishedAt: now, outcome }).where(eq(monitorDeliveryAttempts.id, delivery.leaseToken)),
        db.update(monitorNotifications).set({ status: sql`case when ${monitorNotifications.status} = 'canceled' then ${monitorNotifications.status} else ${outcome === "failed" ? "pending" : outcome} end`,
          acceptedAt: outcome === "accepted" ? now : monitorNotifications.acceptedAt, nextAttemptAt: next, leaseToken: null, leaseExpiresAt: null,
        }).where(and(eq(monitorNotifications.id, delivery.id), eq(monitorNotifications.leaseToken, delivery.leaseToken))),
      ];
      if (outcome === "expired") statements.push(db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, delivery.endpoint)));
      return batch(statements);
    },
  };
};
export type MonitoringRepository = ReturnType<typeof createMonitoringRepository>;
