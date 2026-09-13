import type { ConnectorScheduleStatus, CreateConnectorScheduleInput, UpdateConnectorScheduleInput } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";
import { jobs, schedules } from "@life-console/db";
import { connectorKinds } from "@life-console/domain";
import { and, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { appError, type AppError } from "../shared/app-error";

const syncKinds = connectorKinds.map((connector) => `${connector}_sync` as const);
const activeStatuses = ["queued", "claimed", "running", "waiting_for_user"] as const;
export const createConnectorScheduleRepository = (database: D1Database) => {
  const db = drizzle(database);
  return {
    async list(): Promise<Result<ReadonlyArray<ConnectorScheduleStatus>, AppError>> {
      const statuses: ConnectorScheduleStatus[] = [];
      for (const connector of connectorKinds) {
        const kind = `${connector}_sync` as const;
        const result = await safeTry(() => db.batch([
          db.select({ id: schedules.id, interval: schedules.interval, enabled: schedules.enabled, nextRunAt: schedules.nextRunAt, updatedAt: schedules.updatedAt })
            .from(schedules).where(eq(schedules.jobKind, kind)).orderBy(schedules.createdAt, schedules.id),
          db.select({ status: jobs.status, summary: jobs.summary, errorCode: jobs.errorCode, createdAt: jobs.createdAt })
            .from(jobs).where(eq(jobs.kind, kind)).orderBy(desc(jobs.createdAt), desc(jobs.id)).limit(1),
          db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.kind, kind), inArray(jobs.status, activeStatuses))).limit(1),
        ]));
        if (!result.ok) return err(appError.storage(result.error));
        statuses.push({ connector, schedules: result.value[0], latestJob: result.value[1][0] ?? null, active: result.value[2].length > 0 });
      }
      return ok(statuses);
    },
    async create(id: string, input: CreateConnectorScheduleInput, now: string, nextRunAt: string): Promise<Result<void, AppError>> {
      const kind = `${input.connector}_sync` as const;
      const selection = db.select({
        id: sql`${id}`.as("id"), name: sql`${`${input.connector} の連絡同期`}`.as("name"), jobKind: sql`${kind}`.as("job_kind"),
        payloadJson: sql`'{}'`.as("payload_json"),
        interval: sql`${input.interval}`.as("interval"), timezone: sql`'Asia/Tokyo'`.as("timezone"), nextRunAt: sql`${nextRunAt}`.as("next_run_at"),
        coalescing: sql`'skip_if_pending'`.as("coalescing"), deadlineSeconds: sql`3600`.as("deadline_seconds"), enabled: sql`1`.as("enabled"),
        createdAt: sql`${now}`.as("created_at"), updatedAt: sql`${now}`.as("updated_at"),
      }).from(sql`(select 1)`).where(notExists(db.select({ id: schedules.id }).from(schedules).where(eq(schedules.jobKind, kind))));
      const result = await safeTry(() => db.insert(schedules).select(selection).run());
      if (!result.ok) return err(appError.storage(result.error));
      return result.value.meta.changes > 0 ? ok(undefined) : err(appError.conflict("このサービスの定期実行は登録済みです。再読み込みしてください。"));
    },
    async update(id: string, input: UpdateConnectorScheduleInput, now: string, nextRunAt: string): Promise<Result<void, AppError>> {
      const result = await safeTry(() => db.update(schedules).set({ interval: input.interval, enabled: input.enabled, updatedAt: now,
        // 停止中の期間を再開時にまとめて同期せず、新しい頻度から再開する。
        nextRunAt: sql`case when ${schedules.enabled} = 0 or ${schedules.interval} <> ${input.interval} then ${nextRunAt} else ${schedules.nextRunAt} end`,
      }).where(and(eq(schedules.id, id), eq(schedules.updatedAt, input.updatedAt), inArray(schedules.jobKind, syncKinds))).run());
      if (!result.ok) return err(appError.storage(result.error));
      return result.value.meta.changes > 0 ? ok(undefined) : err(appError.conflict("設定が更新されたか、対象がありません。再読み込みしてください。"));
    },
  };
};
export type ConnectorScheduleRepository = ReturnType<typeof createConnectorScheduleRepository>;
