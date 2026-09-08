import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { monitorTargetId, type MonitorObservation } from "../../../../packages/contracts/src/index";
import { ok, err } from "../../../../packages/core/src/index";
import { createMonitoringRepository } from "../../src/repositories/monitoring-repository";
import { createPushSubscriptionRepository } from "../../src/repositories/push-subscription-repository";
import { appError } from "../../src/shared/app-error";
import { createMonitoringUsecase } from "../../src/usecases/monitoring-usecase";

import { createApiStorage } from "./support/d1-storage";

const databases: ReturnType<typeof createApiStorage>["database"][] = [];
afterEach(() => {
  databases.forEach((database) => database.close());
  databases.length = 0;
});
const setup = async () => {
  const storage = createApiStorage();
  databases.push(storage.database);
  let now = new Date("2026-09-08T00:00:00.000Z");
  const repository = createMonitoringRepository(storage.binding);
  const subscriptions = createPushSubscriptionRepository(storage.binding);
  const send = vi.fn().mockResolvedValue(ok("accepted"));
  const usecase = createMonitoringUsecase(repository, subscriptions, { send }, { now: () => now }, true);
  expect(await usecase.register({ runnerId: "mac-test", targets: [{ service: "runner", account: "process" }, { service: "slack", account: "work" }] })).toEqual(ok(undefined));
  for (const suffix of ["one", "two"]) expect(await subscriptions.save({ endpoint: `https://fcm.googleapis.com/${suffix}`, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } }, now.toISOString())).toEqual(ok(undefined));
  const event = (service: "runner" | "slack", outcome: MonitorObservation["outcome"] = "healthy"): MonitorObservation => ({ id: randomUUID(), runnerId: "mac-test", service, account: service === "runner" ? "process" : "work", outcome, observedAt: now.toISOString() });
  const count = (table: string) => Number(storage.database.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n);
  return { ...storage, repository, usecase, send, event, count, advance: (ms: number) => {
    now = new Date(now.getTime() + ms);
  }, now: () => now.toISOString() };
};

describe("監視履歴と通知予約", () => {
  it("同じ観測の再送では履歴も連続失敗数も増えない", async () => {
    const fixture = await setup();
    const observation = fixture.event("slack", "unavailable");
    expect(await fixture.usecase.record(observation, false)).toEqual(ok(undefined));
    expect(await fixture.usecase.record(observation, false)).toEqual(ok(undefined));
    expect(fixture.count("monitor_observations")).toBe(1);
    expect(fixture.database.prepare("SELECT failures FROM monitor_targets WHERE service = 'slack'").get()!.failures).toBe(1);
    expect(fixture.count("monitor_incidents")).toBe(0);
  });
  it("2 回連続失敗で端末ごとに一度通知し、30 分未満の再判定で増えない", async () => {
    const f = await setup();
    await f.usecase.record(f.event("slack", "unavailable"), false);
    await f.usecase.record(f.event("slack", "unavailable"), false);
    expect(f.count("monitor_incidents")).toBe(1);
    expect(f.count("monitor_notifications")).toBe(2);
    expect(await f.usecase.maintain()).toEqual(ok(undefined));
    expect(await f.usecase.maintain()).toEqual(ok(undefined));
    expect(f.send).toHaveBeenCalledTimes(2);
    f.advance(1_800_000);
    await f.usecase.record(f.event("runner"), false);
    await f.usecase.record(f.event("slack", "unavailable"), false);
    await f.usecase.maintain();
    expect(f.send).toHaveBeenCalledTimes(4);
    expect(f.count("monitor_incidents")).toBe(1);
  });
  it("5 分境界で runner だけ通知し、古い CLI 結果から通知を増やさない", async () => {
    const f = await setup();
    await f.usecase.record(f.event("runner"), false);
    await f.usecase.record(f.event("slack"), false);
    f.advance(299_999);
    await f.usecase.maintain();
    expect(f.send).not.toHaveBeenCalled();
    f.advance(1);
    await f.usecase.maintain();
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.count("monitor_incidents")).toBe(1);
  });
  it("認証エラーは初回に通知し、復旧を通知した後の再発は新しい障害になる", async () => {
    const f = await setup();
    await f.usecase.record(f.event("slack", "auth_required"), false);
    await f.usecase.maintain();
    await f.usecase.record(f.event("slack"), false);
    await f.usecase.maintain();
    await f.usecase.maintain();
    expect(f.send).toHaveBeenCalledTimes(4);
    await f.usecase.record(f.event("slack", "auth_required"), false);
    await f.usecase.maintain();
    expect(f.send).toHaveBeenCalledTimes(6);
    expect(f.count("monitor_incidents")).toBe(2);
  });
  it("未送信のまま復旧した障害は古い異常通知も復旧通知も送らない", async () => {
    const f = await setup();
    await f.usecase.record(f.event("slack", "auth_required"), false);
    await f.usecase.record(f.event("slack"), false);
    await f.usecase.maintain();
    expect(f.send).not.toHaveBeenCalled();
  });
  it("後送の正常記録では復旧せず、後送の失敗でも新規障害にしない", async () => {
    const f = await setup();
    const old = f.event("slack");
    await f.usecase.record(f.event("slack", "auth_required"), false);
    await f.usecase.record(old, true);
    const target = f.database.prepare("SELECT outcome FROM monitor_targets WHERE service = 'slack'").get();
    expect(target!.outcome).toBe("auth_required");
    expect(f.count("monitor_observations")).toBe(2);
    await f.usecase.record(f.event("slack"), false);
    await f.usecase.record(f.event("slack", "auth_required"), true);
    expect(f.database.prepare("SELECT count(*) AS n FROM monitor_incidents WHERE resolved_at IS NULL").get()!.n).toBe(0);
  });
  it("古い状態を読んだ判定が新しい正常状態を上書きしない", async () => {
    const f = await setup();
    const previous = await f.repository.list();
    if (!previous.ok) throw new Error("list failed");
    const target = previous.value.find((row) => row.service === "slack")!;
    await f.usecase.record(f.event("slack"), false);
    expect(await f.repository.decide(target, "open", "古い判定", f.now())).toEqual(ok(undefined));
    expect(f.count("monitor_incidents")).toBe(0);
  });
  it("並行 claim は同じ通知を取得せず、期限切れ lease の完了は新しい担当を上書きしない", async () => {
    const f = await setup();
    await f.usecase.record(f.event("slack", "auth_required"), false);
    const claimed = await Promise.all([f.repository.claim(f.now()), f.repository.claim(f.now()), f.repository.claim(f.now())]);
    const deliveries = claimed.flatMap((result) => result.ok && result.value !== null ? [result.value] : []);
    expect(new Set(deliveries.map((delivery) => delivery.id)).size).toBe(2);
    f.advance(60_000);
    const reclaimed = await f.repository.claim(f.now());
    if (!reclaimed.ok || reclaimed.value === null) throw new Error("claim failed");
    const old = deliveries.find((delivery) => delivery.id === reclaimed.value!.id)!;
    await f.repository.finish(old, "accepted", f.now());
    expect(f.database.prepare("SELECT status FROM monitor_notifications WHERE id = ?").get(old.id)!.status).toBe("sending");
  });
  it("一時失敗はバックオフして同じ通知を再送し、410 は購読を削除する", async () => {
    const f = await setup();
    f.send.mockResolvedValue(err(appError.upstream("失敗")));
    await f.usecase.record(f.event("slack", "auth_required"), false);
    await f.usecase.maintain();
    await f.usecase.maintain();
    expect(f.send).toHaveBeenCalledTimes(2);
    f.advance(60_000);
    f.send.mockResolvedValue(ok("expired"));
    await f.usecase.maintain();
    expect(f.count("push_subscriptions")).toBe(0);
    expect(f.count("monitor_delivery_attempts")).toBe(4);
  });
  it("履歴を 100 件ずつ重複なく辿れる", async () => {
    const f = await setup();
    for (let index = 0; index < 103; index += 1) await f.usecase.record(f.event("runner"), true);
    const id = monitorTargetId("mac-test", { service: "runner", account: "process" });
    const page = await f.usecase.history(id, undefined);
    if (!page.ok) throw new Error("history failed");
    expect(page.value).toHaveLength(100);
    const next = await f.usecase.history(id, page.value.at(-1)!.sequence);
    expect(next.ok && next.value.length).toBe(3);
  });
  it("重なる判定で同じ障害・端末の予約を重複させない", async () => {
    const f = await setup();
    const listed = await f.repository.list();
    if (!listed.ok) throw new Error("list failed");
    const target = listed.value.find((row) => row.service === "slack")!;
    const results = await Promise.all(Array.from({ length: 3 }, () => f.repository.decide(target, "open", "異常", f.now())));
    expect(results.every((result) => result.ok)).toBe(true);
    expect(f.count("monitor_incidents")).toBe(1);
    expect(f.count("monitor_notifications")).toBe(2);
  });
  it("起動前に設定した runner も初回登録から 5 分で通知する", async () => {
    const f = await setup();
    const usecase = createMonitoringUsecase(f.repository, createPushSubscriptionRepository(f.binding), { send: f.send }, { now: () => new Date(f.now()) }, true, ["never-started"]);
    await usecase.maintain();
    expect(f.send).not.toHaveBeenCalled();
    f.advance(300_000);
    await f.usecase.record(f.event("runner"), false);
    await f.usecase.record(f.event("slack"), false);
    await usecase.maintain();
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.send.mock.calls[0]![1].body).toContain("never-started");
  });
  it("送信中に復旧しても、後から受付が確定した端末に復旧を予約する", async () => {
    const f = await setup();
    await f.usecase.record(f.event("slack", "auth_required"), false);
    const claimed = await f.repository.claim(f.now());
    if (!claimed.ok || claimed.value === null) throw new Error("claim failed");
    await f.usecase.record(f.event("slack"), false);
    await f.repository.finish(claimed.value, "accepted", f.now());
    await f.usecase.maintain();
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.send.mock.calls[0]![1].body).toContain("復旧");
  });
  it("解除した購読への未送信通知を取り消す", async () => {
    const f = await setup();
    await f.usecase.record(f.event("slack", "auth_required"), false);
    f.database.prepare("DELETE FROM push_subscriptions").run();
    await f.usecase.maintain();
    expect(f.send).not.toHaveBeenCalled();
    expect(f.database.prepare("SELECT count(*) AS n FROM monitor_notifications WHERE status = 'canceled'").get()!.n).toBe(2);
  });
});
