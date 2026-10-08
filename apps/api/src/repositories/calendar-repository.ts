import type { CalendarEvent, CalendarRange, CollectionCalendar, CollectionSettings, UpdateCalendarEvent } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";
import { calendarDeliveries, calendarEvents, calendarPreparations, calendarReminders, collectionSettings, pushSubscriptions, tasks } from "@life-console/db";
import { and, asc, between, eq, exists, gt, inArray, lte, notInArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { collectionPeriod, tokushimaCollections } from "../calendar/tokushima-2026";
import { appError, type AppError } from "../shared/app-error";

export const createCalendarRepository = (database: D1Database) => {
  const db = drizzle(database);
  const activeDeliveries = inArray(calendarDeliveries.status, ["pending", "sending"]);
  const selectedCalendar = sql`${calendarEvents.calendarKey} = 'tokushima-2026-' || ${collectionSettings.district}`;
  const completedPreparations = db.select({ id: calendarPreparations.eventId }).from(calendarPreparations)
    .innerJoin(tasks, eq(tasks.id, calendarPreparations.taskId)).where(inArray(tasks.status, ["done", "canceled"]));
  const preparationPending = notInArray(calendarEvents.id, completedPreparations);
  const expiry = sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ', ${calendarEvents.date} || 'T08:30:00+09:00')`;
  const due = (slot: "previous_day" | "same_day") => slot === "previous_day"
    ? sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ', ${calendarEvents.date} || 'T' || ${collectionSettings.previousDayTime} || ':00+09:00', '-1 day')`
    : sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ', ${calendarEvents.date} || 'T' || ${collectionSettings.sameDayTime} || ':00+09:00')`;
  const eligible = (now: string) => and(eq(calendarEvents.status, "active"), eq(collectionSettings.notificationsEnabled, true), selectedCalendar, preparationPending, gt(expiry, now));
  return {
    async list(range: CalendarRange): Promise<Result<CollectionCalendar, AppError>> {
      const result = await safeTry(() => db.batch([
        db.select({ district: collectionSettings.district, previousDayTime: collectionSettings.previousDayTime, sameDayTime: collectionSettings.sameDayTime, notificationsEnabled: collectionSettings.notificationsEnabled }).from(collectionSettings).where(eq(collectionSettings.id, 1)),
        db.select({ id: calendarEvents.id, source: calendarEvents.source, sourceKey: calendarEvents.sourceKey, title: calendarEvents.title,
          date: calendarEvents.date, notes: calendarEvents.notes, status: calendarEvents.status, sourceUrl: calendarEvents.sourceUrl, updatedAt: calendarEvents.updatedAt,
          taskId: sql<string | null>`${tasks.id}`.as("taskId"), taskStatus: sql<string | null>`${tasks.status}`.as("taskStatus"),
          taskTitle: sql<string | null>`${tasks.title}`.as("taskTitle"), taskDueAt: sql<string | null>`${tasks.dueAt}`.as("taskDueAt"),
        }).from(calendarEvents).innerJoin(collectionSettings, eq(collectionSettings.id, 1))
          .leftJoin(calendarPreparations, eq(calendarPreparations.eventId, calendarEvents.id)).leftJoin(tasks, eq(tasks.id, calendarPreparations.taskId))
          .where(and(selectedCalendar, between(calendarEvents.date, range.from, range.through))).orderBy(asc(calendarEvents.date), asc(calendarEvents.title)),
      ]));
      if (!result.ok) return err(appError.storage(result.error));
      const events: CalendarEvent[] = result.value[1].map(({ taskId, taskStatus, taskTitle, taskDueAt, ...event }) => ({ ...event,
        preparation: taskId === null ? null : { id: taskId, status: taskStatus!, title: taskTitle!, dueAt: taskDueAt },
      }));
      return ok({ settings: result.value[0][0] ?? null, events, ...collectionPeriod });
    },
    async saveSettings(input: CollectionSettings, now: string): Promise<Result<void, AppError>> {
      const rows = JSON.stringify(tokushimaCollections(input.district));
      // 年度全体を 1 クエリで取り込み、D1 の bind 数と query 数を増やさない。
      const imported = db.select({
        id: sql<string>`json_extract(value, '$.id')`.as("id"), source: sql`'garbage'`.as("source"),
        calendarKey: sql<string>`json_extract(value, '$.calendarKey')`.as("calendarKey"), sourceKey: sql<string>`json_extract(value, '$.sourceKey')`.as("sourceKey"),
        title: sql<string>`json_extract(value, '$.title')`.as("title"), date: sql<string>`json_extract(value, '$.date')`.as("date"),
        notes: sql<string>`json_extract(value, '$.notes')`.as("notes"), sourceUrl: sql<string>`json_extract(value, '$.sourceUrl')`.as("sourceUrl"),
        status: sql`'active'`.as("status"), createdAt: sql<string>`${now}`.as("createdAt"), updatedAt: sql<string>`${now}`.as("updatedAt"),
      }).from(sql`json_each(${rows})`).where(sql`true`);
      const result = await safeTry(() => db.batch([
        db.insert(collectionSettings).values({ id: 1, ...input, updatedAt: now }).onConflictDoUpdate({ target: collectionSettings.id, set: { ...input, updatedAt: now } }),
        // 日付の個別変更・中止を、設定の再保存で上書きしない。
        db.insert(calendarEvents).select(imported).onConflictDoNothing({ target: [calendarEvents.source, calendarEvents.sourceKey] }),
      ]));
      return result.ok ? ok(undefined) : err(appError.storage(result.error));
    },
    async updateEvent(id: string, input: UpdateCalendarEvent, now: string): Promise<Result<void, AppError>> {
      const nextDue = new Date(`${input.date}T08:30:00+09:00`).toISOString();
      const taskId = db.select({ id: calendarPreparations.taskId }).from(calendarPreparations).where(eq(calendarPreparations.eventId, id));
      const appliedDue = db.select({ due: calendarPreparations.appliedDueAt }).from(calendarPreparations).where(eq(calendarPreparations.eventId, id));
      const savedEvent = db.select({ id: calendarEvents.id }).from(calendarEvents).where(and(eq(calendarEvents.id, id), eq(calendarEvents.updatedAt, now)));
      const result = await safeTry(() => db.batch([
        db.update(calendarEvents).set({ date: input.date, notes: input.notes, status: input.status, updatedAt: now }).where(and(eq(calendarEvents.id, id), eq(calendarEvents.updatedAt, input.updatedAt))),
        db.update(tasks).set({ dueAt: nextDue, updatedAt: now }).where(and(eq(tasks.id, taskId), eq(tasks.dueAt, appliedDue), notInArray(tasks.status, ["done", "canceled"]), exists(savedEvent))),
        db.update(calendarPreparations).set({ appliedDueAt: nextDue }).where(and(eq(calendarPreparations.eventId, id), inArray(calendarPreparations.taskId, db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.dueAt, nextDue)))), inArray(calendarPreparations.eventId, savedEvent))),
      ]));
      if (!result.ok) return err(appError.storage(result.error));
      return result.value[0].meta.changes > 0 ? ok(undefined) : err(appError.conflict("予定が更新されています。再読み込みして確認してください。"));
    },
    async createPreparation(eventId: string, taskId: string, now: string): Promise<Result<void, AppError>> {
      const eventDue = expiry;
      const result = await safeTry(() => db.batch([
        db.insert(tasks).select(db.select({ id: sql<string>`${taskId}`.as("id"), title: sql<string>`${calendarEvents.title} || 'を準備する'`.as("title"),
          description: calendarEvents.notes, status: sql`'todo'`.as("status"), area: sql`'personal'`.as("area"),
          scheduledAt: sql<null>`null`.as("scheduledAt"), sourceUrl: calendarEvents.sourceUrl, dueAt: eventDue.as("dueAt"),
          completedAt: sql<null>`null`.as("completedAt"), conversationId: sql<null>`null`.as("conversationId"),
          createdAt: sql<string>`${now}`.as("createdAt"), updatedAt: sql<string>`${now}`.as("updatedAt"),
        }).from(calendarEvents).innerJoin(collectionSettings, eq(collectionSettings.id, 1)).where(and(eq(calendarEvents.id, eventId), selectedCalendar, eq(calendarEvents.status, "active"),
          notInArray(calendarEvents.id, db.select({ id: calendarPreparations.eventId }).from(calendarPreparations))))),
        db.insert(calendarPreparations).select(db.select({ eventId: sql<string>`${eventId}`.as("eventId"), taskId: tasks.id, appliedDueAt: sql<string>`${tasks.dueAt}`.as("appliedDueAt") }).from(tasks).where(eq(tasks.id, taskId))),
      ]));
      if (!result.ok) return err(appError.storage(result.error));
      return result.value[0].meta.changes > 0 ? ok(undefined) : err(appError.conflict("準備は登録済みか、予定が中止されています。"));
    },
    async reconcile(now: string): Promise<Result<void, AppError>> {
      const current = db.select({ id: calendarEvents.id }).from(calendarEvents).innerJoin(collectionSettings, eq(collectionSettings.id, 1))
        .where(and(eq(calendarEvents.id, calendarReminders.eventId), eligible(now), or(and(eq(calendarReminders.slot, "previous_day"), eq(calendarReminders.dueAt, due("previous_day"))), and(eq(calendarReminders.slot, "same_day"), eq(calendarReminders.dueAt, due("same_day"))))));
      const reservations = (["previous_day", "same_day"] as const).map((slot) => db.insert(calendarReminders).select(db.select({
        id: sql<string>`${calendarEvents.id} || ':' || ${slot} || ':' || ${due(slot)}`.as("id"), eventId: calendarEvents.id, slot: sql`${slot}`.as("slot"),
        dueAt: due(slot).as("dueAt"), expiresAt: expiry.as("expiresAt"), status: sql`'scheduled'`.as("status"),
      }).from(calendarEvents).innerJoin(collectionSettings, eq(collectionSettings.id, 1)).where(and(eligible(now), gt(due(slot), now), gt(expiry, due(slot)))))
        .onConflictDoUpdate({ target: [calendarReminders.eventId, calendarReminders.slot, calendarReminders.dueAt], set: { status: "scheduled" }, setWhere: eq(calendarReminders.status, "canceled") }));
      const result = await safeTry(() => db.batch([
        db.update(calendarReminders).set({ status: "missed" }).where(and(inArray(calendarReminders.status, ["scheduled", "delivering"]), lte(calendarReminders.expiresAt, now))),
        db.update(calendarReminders).set({ status: "canceled" }).where(and(inArray(calendarReminders.status, ["scheduled", "delivering"]), notInArray(calendarReminders.eventId, current))),
        db.update(calendarDeliveries).set({ status: "canceled", leaseToken: null, leaseExpiresAt: null }).where(and(activeDeliveries, or(
          inArray(calendarDeliveries.reminderId, db.select({ id: calendarReminders.id }).from(calendarReminders).where(inArray(calendarReminders.status, ["canceled", "missed"]))),
          notInArray(calendarDeliveries.endpoint, db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions)),
        ))),
        ...reservations,
      ]));
      return result.ok ? ok(undefined) : err(appError.storage(result.error));
    },
    async expandDue(now: string): Promise<Result<void, AppError>> {
      const dueReminders = and(eq(calendarReminders.status, "scheduled"), lte(calendarReminders.dueAt, now), gt(calendarReminders.expiresAt, now));
      const result = await safeTry(() => db.batch([
        db.insert(calendarDeliveries).select(db.select({
          id: sql<string>`${calendarReminders.id} || ':' || ${pushSubscriptions.endpoint}`.as("id"), reminderId: calendarReminders.id, endpoint: pushSubscriptions.endpoint,
          status: sql`'pending'`.as("status"), attempts: sql<number>`0`.as("attempts"), nextAttemptAt: sql<string>`${now}`.as("nextAttemptAt"),
          leaseToken: sql<null>`null`.as("leaseToken"), leaseExpiresAt: sql<null>`null`.as("leaseExpiresAt"),
        }).from(calendarReminders).innerJoin(pushSubscriptions, sql`true`).where(dueReminders))
          .onConflictDoUpdate({ target: [calendarDeliveries.reminderId, calendarDeliveries.endpoint], set: { status: "pending", nextAttemptAt: now, attempts: 0 }, setWhere: eq(calendarDeliveries.status, "canceled") }),
        db.update(calendarReminders).set({ status: "delivering" }).where(and(dueReminders, inArray(calendarReminders.id, db.select({ id: calendarDeliveries.reminderId }).from(calendarDeliveries)))),
      ]));
      return result.ok ? ok(undefined) : err(appError.storage(result.error));
    },
    async claimDelivery(token: string, now: string, expiresAt: string): Promise<Result<{ id: string; endpoint: string; eventId: string; title: string; date: string; attempts: number } | null, AppError>> {
      const candidate = db.select({ id: calendarDeliveries.id }).from(calendarDeliveries)
        .innerJoin(calendarReminders, eq(calendarReminders.id, calendarDeliveries.reminderId)).innerJoin(calendarEvents, eq(calendarEvents.id, calendarReminders.eventId))
        .innerJoin(collectionSettings, eq(collectionSettings.id, 1)).where(and(eq(calendarReminders.status, "delivering"), eligible(now),
          or(and(eq(calendarReminders.slot, "previous_day"), eq(calendarReminders.dueAt, due("previous_day"))), and(eq(calendarReminders.slot, "same_day"), eq(calendarReminders.dueAt, due("same_day")))),
          or(and(eq(calendarDeliveries.status, "pending"), lte(calendarDeliveries.nextAttemptAt, now)), and(eq(calendarDeliveries.status, "sending"), lte(calendarDeliveries.leaseExpiresAt, now)))))
        .orderBy(asc(calendarDeliveries.nextAttemptAt)).limit(1);
      const claimed = await safeTry(() => db.update(calendarDeliveries).set({ status: "sending", leaseToken: token, leaseExpiresAt: expiresAt, attempts: sql`${calendarDeliveries.attempts} + 1` })
        .where(eq(calendarDeliveries.id, candidate)).returning().get());
      if (!claimed.ok) return err(appError.storage(claimed.error));
      if (claimed.value === undefined) return ok(null);
      const found = await safeTry(() => db.select({ eventId: calendarEvents.id, title: calendarEvents.title, date: calendarEvents.date }).from(calendarEvents)
        .innerJoin(calendarReminders, eq(calendarReminders.eventId, calendarEvents.id)).where(eq(calendarReminders.id, claimed.value!.reminderId)).get());
      if (!found.ok) return err(appError.storage(found.error));
      return ok({ id: claimed.value.id, endpoint: claimed.value.endpoint, attempts: claimed.value.attempts, ...found.value! });
    },
    async finishDelivery(id: string, token: string, outcome: "accepted" | "expired" | "canceled" | "failed", retryAt: string): Promise<Result<void, AppError>> {
      const result = await safeTry(() => db.update(calendarDeliveries).set({ status: outcome === "failed" ? "pending" : outcome, nextAttemptAt: retryAt, leaseToken: null, leaseExpiresAt: null })
        .where(and(eq(calendarDeliveries.id, id), eq(calendarDeliveries.status, "sending"), eq(calendarDeliveries.leaseToken, token))).run());
      return result.ok ? ok(undefined) : err(appError.storage(result.error));
    },
    async finishReservations(): Promise<Result<void, AppError>> {
      const pending = db.select({ id: calendarDeliveries.reminderId }).from(calendarDeliveries).where(activeDeliveries);
      const result = await safeTry(() => db.update(calendarReminders).set({ status: "finished" }).where(and(eq(calendarReminders.status, "delivering"), notInArray(calendarReminders.id, pending))).run());
      return result.ok ? ok(undefined) : err(appError.storage(result.error));
    },
  };
};
export type CalendarRepository = ReturnType<typeof createCalendarRepository>;
