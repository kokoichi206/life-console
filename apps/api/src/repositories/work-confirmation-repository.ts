import type { ImportWorkConfirmationsInput, WorkConfirmation } from "@life-console/contracts";
import { err, ok, safeTry } from "@life-console/core";
import { pushSubscriptions, workConfirmations, workConfirmationSources, workConfirmationNotifications } from "@life-console/db";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";

import { appError } from "../shared/app-error";
import type { IdGenerator } from "../shared/id-generator";

export const createWorkConfirmationRepository = (database: D1Database) => {
  const db = drizzle(database);
  const activeNotifications = inArray(workConfirmationNotifications.status, ["pending", "sending"]);
  const completedRequests = db.select({ id: workConfirmations.id }).from(workConfirmations).where(isNotNull(workConfirmations.completedAt));
  const cancelCompleted = () => db.update(workConfirmationNotifications).set({ status: "canceled" })
    .where(and(activeNotifications, inArray(workConfirmationNotifications.confirmationId, completedRequests)));
  return {
    async list() {
      const result = await safeTry(() => db.batch([
        db.select({
          id: workConfirmations.id, sourceId: workConfirmations.sourceId, sourceLabel: workConfirmationSources.label,
          externalId: workConfirmations.externalId, repositoryName: workConfirmations.repositoryName, sourceUrl: workConfirmations.sourceUrl,
          kind: workConfirmations.kind, title: workConfirmations.title, summary: workConfirmations.summary, environment: workConfirmations.environment,
          question: workConfirmations.question, reason: workConfirmations.reason, recommendation: workConfirmations.recommendation,
          evidenceJson: workConfirmations.evidenceJson, requestedAt: workConfirmations.requestedAt, checkedAt: workConfirmations.checkedAt,
          completedAt: workConfirmations.completedAt, completedBy: workConfirmations.completedBy,
        }).from(workConfirmations).innerJoin(workConfirmationSources, eq(workConfirmationSources.id, workConfirmations.sourceId))
          .orderBy(desc(sql`julianday(${workConfirmations.requestedAt})`), asc(workConfirmations.id)),
        db.select().from(workConfirmationSources).orderBy(asc(workConfirmationSources.label)),
        db.select({
          pending: count(),
          failed: sql<number>`coalesce(sum(case when ${workConfirmationNotifications.attempts} > 1
            or (${workConfirmationNotifications.status} = 'pending' and ${workConfirmationNotifications.attempts} > 0) then 1 else 0 end), 0)`.as("failed"),
        }).from(workConfirmationNotifications).where(activeNotifications),
      ]));
      if (!result.ok) return err(appError.storage(result.error));
      return ok({
        confirmations: result.value[0].map(({ evidenceJson, ...row }): WorkConfirmation => ({
          ...row, evidence: JSON.parse(evidenceJson) as WorkConfirmation["evidence"], status: row.completedAt === null ? "pending" : "done",
        })),
        sources: result.value[1], notifications: result.value[2][0]!,
      });
    },
    async import(input: ImportWorkConfirmationsInput, now: string, ids: IdGenerator) {
      const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
        db.insert(workConfirmationSources).values({ id: input.sourceId, label: input.sourceLabel, lastSuccessAt: now })
          .onConflictDoUpdate({ target: workConfirmationSources.id, set: { label: input.sourceLabel, lastSuccessAt: now } }),
      ];
      for (const item of input.confirmations) {
        const id = ids.create();
        const completedAt = item.status === "done" ? item.checkedAt : null;
        const completedBy = item.status === "done" ? "source" : null;
        const content = {
          repositoryName: item.repositoryName, sourceUrl: item.sourceUrl, kind: item.kind, title: item.title,
          summary: item.summary, environment: item.environment, question: item.question, reason: item.reason,
          recommendation: item.recommendation, evidenceJson: JSON.stringify(item.evidence), requestedAt: item.requestedAt, checkedAt: item.checkedAt,
        };
        statements.push(db.insert(workConfirmations).values({
          id, sourceId: input.sourceId, externalId: item.externalId, ...content, completedAt, completedBy, createdAt: now, updatedAt: now,
        }).onConflictDoUpdate({
          target: [workConfirmations.sourceId, workConfirmations.externalId],
          set: {
            ...content, updatedAt: now,
            completedAt: sql`coalesce(${workConfirmations.completedAt}, ${completedAt})`,
            completedBy: sql`coalesce(${workConfirmations.completedBy}, ${completedBy})`,
          },
          setWhere: gt(sql`julianday(${item.checkedAt})`, sql`julianday(${workConfirmations.checkedAt})`),
        }));
        // 新規挿入で採用された ID だけを通知対象にし、再送・通常更新では通知を増やさない。
        statements.push(db.insert(workConfirmationNotifications).select(db.select({
          id: sql`${id} || ':' || ${pushSubscriptions.endpoint}`.as("id"),
          confirmationId: workConfirmations.id, endpoint: pushSubscriptions.endpoint,
          status: sql`'pending'`.as("status"), attempts: sql`0`.as("attempts"),
          nextAttemptAt: sql`${now}`.as("nextAttemptAt"),
          leaseToken: sql`null`.as("leaseToken"), leaseExpiresAt: sql`null`.as("leaseExpiresAt"), createdAt: sql`${now}`.as("createdAt"),
        }).from(workConfirmations).innerJoin(pushSubscriptions, sql`1`)
          .where(and(eq(workConfirmations.id, id), isNull(workConfirmations.completedAt)))));
      }
      statements.push(cancelCompleted());
      const result = await safeTry(() => db.batch(statements));
      return result.ok ? ok(undefined) : err(appError.storage(result.error));
    },
    async complete(id: string, now: string) {
      const result = await safeTry(() => db.batch([
        db.update(workConfirmations).set({
          completedAt: sql`coalesce(${workConfirmations.completedAt}, ${now})`,
          completedBy: sql`coalesce(${workConfirmations.completedBy}, 'user')`, updatedAt: now,
        }).where(eq(workConfirmations.id, id)).returning({ id: workConfirmations.id }),
        db.update(workConfirmationNotifications).set({ status: "canceled" })
          .where(and(eq(workConfirmationNotifications.confirmationId, id), activeNotifications)),
      ]));
      if (!result.ok) return err(appError.storage(result.error));
      return result.value[0].length === 0 ? err(appError.notFound("確認依頼が見つかりません。")) : ok(undefined);
    },
    async claimDelivery(token: string, now: string, expiresAt: string) {
      const candidate = alias(workConfirmationNotifications, "candidate");
      const next = db.select({ id: candidate.id }).from(candidate).where(or(
        and(eq(candidate.status, "pending"), lte(candidate.nextAttemptAt, now)),
        and(eq(candidate.status, "sending"), lte(candidate.leaseExpiresAt, now)),
      )).orderBy(asc(candidate.nextAttemptAt)).limit(1);
      const result = await safeTry(() => db.batch([
        db.update(workConfirmationNotifications).set({ status: "canceled" }).where(and(activeNotifications, or(
          notInArray(workConfirmationNotifications.endpoint, db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions)),
          inArray(workConfirmationNotifications.confirmationId, completedRequests),
        ))),
        db.update(workConfirmationNotifications).set({
          status: "sending", leaseToken: token, leaseExpiresAt: expiresAt, attempts: sql`${workConfirmationNotifications.attempts} + 1`,
        }).where(eq(workConfirmationNotifications.id, next)).returning({
          id: workConfirmationNotifications.id, confirmationId: workConfirmationNotifications.confirmationId,
          endpoint: workConfirmationNotifications.endpoint, attempts: workConfirmationNotifications.attempts,
        }),
      ]));
      if (!result.ok) return err(appError.storage(result.error));
      return ok(result.value[1][0] ?? null);
    },
    async finishDelivery(id: string, token: string, outcome: "accepted" | "expired" | "canceled" | "failed", nextAttemptAt: string) {
      const result = await safeTry(() => db.update(workConfirmationNotifications).set({
        status: outcome === "failed" ? "pending" : outcome, nextAttemptAt, leaseToken: null, leaseExpiresAt: null,
      }).where(and(eq(workConfirmationNotifications.id, id), eq(workConfirmationNotifications.status, "sending"),
        eq(workConfirmationNotifications.leaseToken, token))).run());
      return result.ok ? ok(undefined) : err(appError.storage(result.error));
    },
  };
};
export type WorkConfirmationRepository = ReturnType<typeof createWorkConfirmationRepository>;
