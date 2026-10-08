import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "../apps/api/src/app";
import { createCalendarRepository } from "../apps/api/src/repositories/calendar-repository";
import { createPushSubscriptionRepository } from "../apps/api/src/repositories/push-subscription-repository";
import { createCalendarUsecase } from "../apps/api/src/usecases/calendar-usecase";
import { ok } from "../packages/core/src/index";

import { createJobStorage } from "./support/d1-storage";

const databases: ReturnType<typeof createJobStorage>["database"][] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});
const setup = () => {
  const storage = createJobStorage();
  databases.push(storage.database);
  let now = "2026-10-08T00:00:00.000Z";
  let sequence = 0;
  const repository = createCalendarRepository(storage.binding);
  const subscriptions = createPushSubscriptionRepository(storage.binding);
  const send = vi.fn().mockResolvedValue(ok("accepted" as const));
  const usecase = createCalendarUsecase(repository, subscriptions, { send }, { now: () => new Date(now) }, { create: () => `id-${++sequence}` }, true);
  const settings = { district: "D" as const, previousDayTime: "21:00", sameDayTime: null, notificationsEnabled: true };
  return { ...storage, repository, subscriptions, usecase, send, settings, setNow: (value: string) => {
    now = value;
  } };
};
const month = { from: "2026-10-01", through: "2026-10-31" };
const burnable = "tokushima-2026-D-burnable-2026-10-09";

describe("収集カレンダーの保存と通知", () => {
  it("年度の取り込みを再実行しても増えず、個別の日付変更を保つ", async () => {
    const { usecase, repository, settings, setNow, database } = setup();
    expect(await usecase.saveSettings(settings)).toMatchObject({ ok: true });
    const count = database.prepare("SELECT count(*) AS n FROM calendar_events").get()!.n;
    const listed = await repository.list(month);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const event = listed.value.events.find((item) => item.id === burnable)!;
    setNow("2026-10-08T00:01:00.000Z");
    expect(await usecase.updateEvent(event.id, { date: "2026-10-10", notes: "振替", status: "active", updatedAt: event.updatedAt })).toMatchObject({ ok: true });
    expect(await usecase.saveSettings(settings)).toMatchObject({ ok: true });
    expect(database.prepare("SELECT count(*) AS n FROM calendar_events").get()!.n).toBe(count);
    expect(database.prepare("SELECT date,notes FROM calendar_events WHERE id=?").get(event.id)).toMatchObject({ date: "2026-10-10", notes: "振替" });
    expect(database.prepare("SELECT due_at FROM calendar_reminders WHERE event_id=? AND status='scheduled'").get(event.id)!.due_at).toBe("2026-10-09T12:00:00.000Z");
    expect((await usecase.updateEvent(event.id, { date: "2026-10-11", notes: "古い更新", status: "active", updatedAt: event.updatedAt })).ok).toBe(false);
  });
  it("準備は 1 件だけ作り、本人が変えた期日は予定変更で上書きしない", async () => {
    const { usecase, repository, settings, setNow, database } = setup();
    expect(await usecase.saveSettings(settings)).toMatchObject({ ok: true });
    expect(await usecase.createPreparation(burnable)).toMatchObject({ ok: true });
    expect((await usecase.createPreparation(burnable)).ok).toBe(false);
    const eventResult = await repository.list(month);
    if (!eventResult.ok) return;
    const event = eventResult.value.events.find((item) => item.id === burnable)!;
    setNow("2026-10-08T00:01:00.000Z");
    expect(await usecase.updateEvent(event.id, { date: "2026-10-10", notes: event.notes, status: "active", updatedAt: event.updatedAt })).toMatchObject({ ok: true });
    const task = database.prepare("SELECT id,due_at FROM tasks").get()!;
    expect(task.due_at).toBe("2026-10-09T23:30:00.000Z");
    database.prepare("UPDATE tasks SET due_at=? WHERE id=?").run("2026-10-08T05:00:00.000Z", task.id!);
    const next = await repository.list(month);
    if (!next.ok) return;
    setNow("2026-10-08T00:02:00.000Z");
    expect(await usecase.updateEvent(event.id, { date: "2026-10-11", notes: event.notes, status: "active", updatedAt: next.value.events.find((item) => item.id === event.id)!.updatedAt })).toMatchObject({ ok: true });
    expect(database.prepare("SELECT due_at FROM tasks WHERE id=?").get(task.id!)!.due_at).toBe("2026-10-08T05:00:00.000Z");
  });
  it("予約後に登録した端末へ配送し、同じ通知を再同期・cron で増やさない", async () => {
    const { usecase, settings, setNow, subscriptions, send, database } = setup();
    expect(await usecase.saveSettings(settings)).toMatchObject({ ok: true });
    expect(await subscriptions.save({ endpoint: "https://fcm.googleapis.com/fcm/send/test", keys: { p256dh: "key", auth: "auth" } }, "2026-10-08T10:00:00.000Z")).toMatchObject({ ok: true });
    setNow("2026-10-08T12:00:01.000Z");
    expect(await usecase.maintain()).toMatchObject({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).toMatchObject({ calendarEventId: burnable });
    expect(await usecase.saveSettings(settings)).toMatchObject({ ok: true });
    expect(await usecase.maintain()).toMatchObject({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(database.prepare("SELECT status FROM calendar_reminders WHERE event_id=?").get(burnable)!.status).toBe("finished");
  });
  it("中止と準備完了を配送・再試行に反映し、期限を過ぎた通知を送らない", async () => {
    const { usecase, repository, settings, setNow, subscriptions, database, send } = setup();
    expect(await usecase.saveSettings(settings)).toMatchObject({ ok: true });
    expect(await subscriptions.save({ endpoint: "endpoint", keys: { p256dh: "key", auth: "auth" } }, "2026-10-08T10:00:00.000Z")).toMatchObject({ ok: true });
    setNow("2026-10-08T12:00:01.000Z");
    expect(await repository.expandDue("2026-10-08T12:00:01.000Z")).toMatchObject({ ok: true });
    const listed = await repository.list(month);
    if (!listed.ok) return;
    const event = listed.value.events.find((item) => item.id === burnable)!;
    expect(await usecase.updateEvent(event.id, { date: event.date, status: "canceled", notes: event.notes, updatedAt: event.updatedAt })).toMatchObject({ ok: true });
    expect(await usecase.maintain()).toMatchObject({ ok: true });
    expect(send).not.toHaveBeenCalled();
    expect(database.prepare("SELECT status FROM calendar_deliveries").get()!.status).toBe("canceled");
    const next = "tokushima-2026-D-pet-2026-10-12";
    expect(await usecase.createPreparation(next)).toMatchObject({ ok: true });
    database.prepare("UPDATE tasks SET status='done'").run();
    setNow("2026-10-11T12:00:01.000Z");
    expect(await usecase.maintain()).toMatchObject({ ok: true });
    expect(send).not.toHaveBeenCalled();
    setNow("2026-10-15T00:00:00.000Z");
    expect(await usecase.maintain()).toMatchObject({ ok: true });
    expect(send).not.toHaveBeenCalled();
  });
  it("配送の claim を重複させず、中止後の古い完了報告で状態を戻さない", async () => {
    const { usecase, repository, settings, subscriptions, database, setNow } = setup();
    expect(await usecase.saveSettings(settings)).toMatchObject({ ok: true });
    expect(await subscriptions.save({ endpoint: "endpoint", keys: { p256dh: "key", auth: "auth" } }, "2026-10-08T10:00:00.000Z")).toMatchObject({ ok: true });
    setNow("2026-10-08T12:00:01.000Z");
    expect(await repository.expandDue("2026-10-08T12:00:01.000Z")).toMatchObject({ ok: true });
    const first = await repository.claimDelivery("first", "2026-10-08T12:00:01.000Z", "2026-10-08T12:01:01.000Z");
    expect(first).toMatchObject({ ok: true, value: { eventId: burnable } });
    expect(await repository.claimDelivery("second", "2026-10-08T12:00:01.000Z", "2026-10-08T12:01:01.000Z")).toEqual({ ok: true, value: null });
    if (!first.ok || first.value === null) return;
    expect(await repository.finishDelivery(first.value.id, "other", "accepted", "2026-10-08T12:01:01.000Z")).toMatchObject({ ok: true });
    expect(database.prepare("SELECT status FROM calendar_deliveries").get()!.status).toBe("sending");
    const listed = await repository.list(month);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const event = listed.value.events.find((item) => item.id === burnable)!;
    expect(await usecase.updateEvent(event.id, { date: event.date, status: "canceled", notes: event.notes, updatedAt: event.updatedAt })).toMatchObject({ ok: true });
    expect(await repository.finishDelivery(first.value.id, "first", "accepted", "2026-10-08T12:01:01.000Z")).toMatchObject({ ok: true });
    expect(database.prepare("SELECT status FROM calendar_deliveries").get()!.status).toBe("canceled");
  });
  it("前日と当日の通知枠を別々に扱う", async () => {
    const { usecase, settings, setNow, subscriptions, send } = setup();
    expect(await usecase.saveSettings({ ...settings, sameDayTime: "07:00" })).toMatchObject({ ok: true });
    expect(await subscriptions.save({ endpoint: "endpoint", keys: { p256dh: "key", auth: "auth" } }, "2026-10-08T10:00:00.000Z")).toMatchObject({ ok: true });
    setNow("2026-10-08T12:00:01.000Z");
    expect(await usecase.maintain()).toMatchObject({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    setNow("2026-10-08T22:00:01.000Z");
    expect(await usecase.maintain()).toMatchObject({ ok: true });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("保存・表示と入力検証を HTTP 経路で通す", async () => {
    const { binding } = setup();
    const environment = { DB: binding, APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker" };
    const save = (body: unknown) => app.request("/api/v1/calendar/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, environment);
    expect((await save({ district: "D", previousDayTime: "21:00", sameDayTime: "09:00", notificationsEnabled: true })).status).toBe(400);
    expect((await save({ district: "D", previousDayTime: "21:00", sameDayTime: null, notificationsEnabled: true })).status).toBe(400);
    expect((await save({ district: "D", previousDayTime: "21:00", sameDayTime: null, notificationsEnabled: false })).status).toBe(200);
    const response = await app.request("/api/v1/calendar?from=2026-10-01&through=2026-10-31", {}, environment);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { settings: { district: "D" }, validThrough: "2027-03-31" } });
  });
});
