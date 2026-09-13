import type { StravaActivityCalories } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";
import { stravaActivityCalories } from "@life-console/db";
import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";

import { appError, type AppError } from "../shared/app-error";

export type ListedActivity = { readonly id: string; readonly occurredAt: string };

export interface StravaCaloriesRepository {
  /** 一覧に現れた活動を取得待ちで登録し、既にある行は `seen_at` だけ進める。戻り値は新しく登録した件数。 */
  registerOrTouch(activities: ReadonlyArray<ListedActivity>, now: string): Promise<Result<number, AppError>>;
  deleteUnseen(from: string, to: string, seenBefore: string): Promise<Result<number, AppError>>;
  listPendingActivityIds(limit: number): Promise<Result<ReadonlyArray<string>, AppError>>;
  countPending(): Promise<Result<number, AppError>>;
  countPendingInPeriod(from: string, to: string): Promise<Result<number, AppError>>;
  saveMeasured(activityId: string, caloriesKcal: number, now: string): Promise<Result<void, AppError>>;
  markUnavailable(activityId: string, now: string): Promise<Result<void, AppError>>;
  deleteActivity(activityId: string): Promise<Result<void, AppError>>;
  listByPeriod(from: string, to: string): Promise<Result<ReadonlyArray<StravaActivityCalories>, AppError>>;
  deleteAll(): Promise<Result<void, AppError>>;
}

// 保存する occurred_at は Strava の start_date（UTC の ISO 文字列）で、暦日は listMeals と同じ +09:00 の境界で切る。
const japanCalendarRange = (from: string, to: string) => ({
  start: new Date(Date.parse(`${from}T00:00:00+09:00`)).toISOString(),
  endExclusive: new Date(Date.parse(`${to}T00:00:00+09:00`) + 86_400_000).toISOString(),
});

export const createStravaCaloriesRepository = (database: D1Database): StravaCaloriesRepository => {
  const db = drizzle(database);
  const withinPeriod = (from: string, to: string) => {
    const range = japanCalendarRange(from, to);
    return and(gte(stravaActivityCalories.occurredAt, range.start), lt(stravaActivityCalories.occurredAt, range.endExclusive));
  };
  return {
    async registerOrTouch(activities, now) {
      const [first, ...rest] = activities;
      if (first === undefined) return ok(0);
      // D1 は 1 クエリあたりのバインド変数を 100 個までしか受け付けない。1 ページの活動は 100 件あるため、行ごとに文を分けて batch にまとめる。
      const upsert = (activity: ListedActivity) => db.insert(stravaActivityCalories).values({
        activityId: activity.id, occurredAt: activity.occurredAt, status: "pending",
        caloriesKcal: null, registeredAt: now, seenAt: now, fetchedAt: null,
      }).onConflictDoUpdate({ target: stravaActivityCalories.activityId, set: { seenAt: now } })
        .returning({ registeredAt: stravaActivityCalories.registeredAt });
      const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [upsert(first)];
      for (const activity of rest) statements.push(upsert(activity));
      const result = await safeTry(() => db.batch(statements));
      if (!result.ok) return err(appError.storage(result.error));
      // 登録日時がこの呼び出しの時刻と同じ行が、今回はじめて登録した活動。
      return ok(result.value.flat().filter((row) => row.registeredAt === now).length);
    },
    async deleteUnseen(from, to, seenBefore) {
      const result = await safeTry(() => db.delete(stravaActivityCalories)
        .where(and(withinPeriod(from, to), lt(stravaActivityCalories.seenAt, seenBefore))).run());
      return result.ok ? ok(result.value.meta.changes) : err(appError.storage(result.error));
    },
    async listPendingActivityIds(limit) {
      const result = await safeTry(() => db.select({ activityId: stravaActivityCalories.activityId }).from(stravaActivityCalories)
        .where(eq(stravaActivityCalories.status, "pending")).orderBy(desc(stravaActivityCalories.occurredAt)).limit(limit).all());
      return result.ok ? ok(result.value.map((row) => row.activityId)) : err(appError.storage(result.error));
    },
    async countPending() {
      const result = await safeTry(() => db.select({ pending: count() }).from(stravaActivityCalories).where(eq(stravaActivityCalories.status, "pending")).get());
      return result.ok ? ok(result.value!.pending) : err(appError.storage(result.error));
    },
    async countPendingInPeriod(from, to) {
      const result = await safeTry(() => db.select({ pending: count() }).from(stravaActivityCalories)
        .where(and(eq(stravaActivityCalories.status, "pending"), withinPeriod(from, to))).get());
      return result.ok ? ok(result.value!.pending) : err(appError.storage(result.error));
    },
    async saveMeasured(activityId, caloriesKcal, now) {
      const result = await safeTry(() => db.update(stravaActivityCalories).set({ status: "measured", caloriesKcal, fetchedAt: now })
        .where(eq(stravaActivityCalories.activityId, activityId)).run());
      return result.ok ? ok(undefined) : err(appError.storage(result.error));
    },
    async markUnavailable(activityId, now) {
      const result = await safeTry(() => db.update(stravaActivityCalories).set({ status: "unavailable", caloriesKcal: null, fetchedAt: now })
        .where(eq(stravaActivityCalories.activityId, activityId)).run());
      return result.ok ? ok(undefined) : err(appError.storage(result.error));
    },
    async deleteActivity(activityId) {
      const result = await safeTry(() => db.delete(stravaActivityCalories).where(eq(stravaActivityCalories.activityId, activityId)).run());
      return result.ok ? ok(undefined) : err(appError.storage(result.error));
    },
    async listByPeriod(from, to) {
      const result = await safeTry(() => db.select({
        activityId: stravaActivityCalories.activityId, status: stravaActivityCalories.status, caloriesKcal: stravaActivityCalories.caloriesKcal,
      }).from(stravaActivityCalories).where(withinPeriod(from, to)).orderBy(desc(stravaActivityCalories.occurredAt)).all());
      return result.ok ? ok(result.value) : err(appError.storage(result.error));
    },
    async deleteAll() {
      const result = await safeTry(() => db.delete(stravaActivityCalories).run());
      return result.ok ? ok(undefined) : err(appError.storage(result.error));
    },
  };
};
