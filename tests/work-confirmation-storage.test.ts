import { afterEach, describe, expect, it, vi } from "vitest";

import { createPushSubscriptionRepository } from "../apps/api/src/repositories/push-subscription-repository";
import { createWorkConfirmationRepository } from "../apps/api/src/repositories/work-confirmation-repository";
import { appError } from "../apps/api/src/shared/app-error";
import type { AppError } from "../apps/api/src/shared/app-error";
import { createWorkConfirmationUsecase } from "../apps/api/src/usecases/work-confirmation-usecase";
import { err, ok, type Result } from "../packages/core/src/index";

import { createJobStorage } from "./support/d1-storage";
import { workConfirmationInput } from "./support/work-confirmations";

const databases: ReturnType<typeof createJobStorage>["database"][] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});
const now = "2026-10-02T00:20:00.000Z";
const setup = () => {
  const storage = createJobStorage();
  databases.push(storage.database);
  let sequence = 0;
  const ids = { create: () => "test-id-" + ++sequence };
  const repository = createWorkConfirmationRepository(storage.binding);
  const subscriptions = createPushSubscriptionRepository(storage.binding);
  const push = { send: vi.fn(async (): Promise<Result<"accepted" | "expired", AppError>> => ok("accepted")) };
  let currentTime = new Date(now);
  const clock = { now: () => currentTime };
  const usecase = createWorkConfirmationUsecase(repository, subscriptions, push, clock, ids, true);
  const subscribe = async (suffix: string) => subscriptions.save({
    endpoint: "https://fcm.googleapis.com/fcm/send/" + suffix, keys: { p256dh: "a".repeat(87), auth: "a".repeat(22) },
  }, now);
  return { ...storage, ids, repository, subscriptions, push, usecase, subscribe, setTime: (time: string) => {
    currentTime = new Date(time);
  } };
};

describe("本人確認依頼の保存と通知", () => {
  it("再送と通常更新で重複せず、複数端末へ新規依頼だけを通知する", async () => {
    const { repository, ids, usecase, push, subscribe } = setup();
    await subscribe("one");
    await subscribe("two");
    expect((await repository.import(workConfirmationInput(), now, ids)).ok).toBe(true);
    await repository.import(workConfirmationInput(), now, ids);
    await repository.import(workConfirmationInput({ summary: "検証結果を更新しました。", checkedAt: "2026-10-02T00:15:00Z" }), now, ids);
    const listed = await repository.list();
    expect(listed).toMatchObject({ ok: true, value: {
      confirmations: [{ summary: "検証結果を更新しました。", status: "pending" }],
      sources: [{ id: "test-patrol", lastSuccessAt: now }], notifications: { pending: 2, failed: 0 },
    } });
    if (!listed.ok) throw new Error("list failed");
    expect(listed.value.confirmations).toHaveLength(1);
    expect((await usecase.deliverNotifications()).ok).toBe(true);
    expect(push.send).toHaveBeenCalledTimes(2);
    await usecase.deliverNotifications();
    expect(push.send).toHaveBeenCalledTimes(2);
    expect(push.send.mock.calls[0]).toBeDefined();
  });
  it("古い確認結果で巻き戻らず、本人の対応済みを再送で開き直さない", async () => {
    const { repository, ids, usecase, database } = setup();
    await usecase.import(workConfirmationInput());
    const result = await repository.list();
    if (!result.ok) throw new Error("list failed");
    const id = result.value.confirmations[0]!.id;
    expect((await usecase.complete(id)).ok).toBe(true);
    await usecase.import(workConfirmationInput({ checkedAt: "2026-10-02T00:15:00Z", title: "新しい調査結果" }));
    await usecase.import(workConfirmationInput({ checkedAt: "2026-10-02T00:11:00Z", title: "古い調査結果" }));
    expect(await repository.list()).toMatchObject({ value: { confirmations: [{ title: "新しい調査結果", status: "done", completedBy: "user", completedAt: now }] } });
    await usecase.import(workConfirmationInput({ externalId: "review-event-2", requestedAt: "2026-10-02T00:16:00Z", checkedAt: "2026-10-02T00:18:00Z" }));
    expect(database.prepare("SELECT count(*) AS n FROM work_confirmations").get()!.n).toBe(2);
    expect((await repository.import({ ...workConfirmationInput(), confirmations: [] }, now, ids)).ok).toBe(true);
    expect(await repository.list()).toMatchObject({ value: { confirmations: expect.arrayContaining([expect.objectContaining({ status: "pending" })]) } });
  });
  it("明示的な解消だけを対応済みにし、古い未処理結果と通知を抑止する", async () => {
    const { repository, usecase, push, subscribe } = setup();
    await subscribe("one");
    await usecase.import(workConfirmationInput());
    await usecase.import(workConfirmationInput({ status: "done", checkedAt: "2026-10-02T00:17:00Z" }));
    await usecase.import(workConfirmationInput({ status: "pending", checkedAt: "2026-10-02T00:18:00Z" }));
    expect(await repository.list()).toMatchObject({ value: { confirmations: [{ status: "done", completedBy: "source" }] } });
    await usecase.deliverNotifications();
    expect(push.send).not.toHaveBeenCalled();
  });
  it("通知失敗でも依頼を保存し、再送時刻まで待ってから再送する", async () => {
    const { repository, usecase, push, subscribe, setTime } = setup();
    await subscribe("one");
    await usecase.import(workConfirmationInput());
    push.send.mockResolvedValueOnce(err(appError.upstream("通知サービスに接続できませんでした。")));
    expect(await usecase.deliverNotifications()).toMatchObject({ ok: false, error: { code: "upstream_error" } });
    expect(await repository.list()).toMatchObject({ value: { confirmations: [{ status: "pending" }], notifications: { pending: 1, failed: 1 } } });
    await usecase.deliverNotifications();
    expect(push.send).toHaveBeenCalledTimes(1);
    setTime("2026-10-02T00:21:01Z");
    expect((await usecase.deliverNotifications()).ok).toBe(true);
    expect(push.send).toHaveBeenCalledTimes(2);
    expect(await repository.list()).toMatchObject({ value: { notifications: { pending: 0, failed: 0 } } });
  });
  it("並行送信は lease で排他し、古い送信結果が新しい実行を上書きしない", async () => {
    const { repository, usecase, subscribe, database } = setup();
    await subscribe("one");
    await usecase.import(workConfirmationInput());
    const [first, second] = await Promise.all([
      repository.claimDelivery("one", now, "2026-10-02T00:21:00Z"),
      repository.claimDelivery("two", now, "2026-10-02T00:21:00Z"),
    ]);
    expect(first).toMatchObject({ ok: true, value: { attempts: 1 } });
    expect(second).toEqual({ ok: true, value: null });
    if (!first.ok || first.value === null) throw new Error("claim failed");
    await repository.claimDelivery("new", "2026-10-02T00:22:00Z", "2026-10-02T00:23:00Z");
    await repository.finishDelivery(first.value.id, "one", "accepted", now);
    expect(database.prepare("SELECT status, lease_token FROM work_confirmation_notifications").get()).toMatchObject({ status: "sending", lease_token: "new" });
  });
  it("通知キューの保存に失敗したら取り込み全体をロールバックする", async () => {
    const { usecase, subscribe, database } = setup();
    await subscribe("one");
    database.exec("CREATE TRIGGER fail_notification BEFORE INSERT ON work_confirmation_notifications BEGIN SELECT RAISE(ABORT, 'storage failure'); END;");
    expect(await usecase.import(workConfirmationInput())).toMatchObject({ ok: false, error: { code: "storage_error" } });
    expect(database.prepare("SELECT count(*) AS n FROM work_confirmations").get()!.n).toBe(0);
    expect(database.prepare("SELECT count(*) AS n FROM work_confirmation_sources").get()!.n).toBe(0);
  });
  it("別の依頼の解消で未対応の通知をキャンセルせず、初回送信中を失敗件数に含めない", async () => {
    const { repository, ids, usecase, subscribe } = setup();
    await subscribe("one");
    await usecase.import(workConfirmationInput());
    await usecase.import(workConfirmationInput({ externalId: "review-event-2" }));
    await usecase.import(workConfirmationInput({ status: "done", checkedAt: "2026-10-02T00:17:00Z" }));
    expect(await repository.list()).toMatchObject({ value: { notifications: { pending: 1, failed: 0 } } });
    const claimed = await repository.claimDelivery(ids.create(), now, "2026-10-02T00:21:00Z");
    expect(claimed).toMatchObject({ ok: true, value: { attempts: 1 } });
    expect(await repository.list()).toMatchObject({ value: { notifications: { pending: 1, failed: 0 } } });
  });
  it("失効した購読を削除し、通知未設定なら外部へ送らない", async () => {
    const { repository, subscriptions, push, ids, usecase, subscribe } = setup();
    await subscribe("one");
    await usecase.import(workConfirmationInput());
    const disabled = createWorkConfirmationUsecase(repository, subscriptions, push, { now: () => new Date(now) }, ids, false);
    await disabled.deliverNotifications();
    expect(push.send).not.toHaveBeenCalled();
    push.send.mockResolvedValueOnce(ok("expired"));
    await usecase.deliverNotifications();
    expect(await subscriptions.find("https://fcm.googleapis.com/fcm/send/one")).toEqual({ ok: true, value: null });
  });
});
