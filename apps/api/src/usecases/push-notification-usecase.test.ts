import { err, ok } from "@life-console/core";
import { describe, expect, it, vi } from "vitest";

import { createPushNotificationUsecase } from "./push-notification-usecase";

const endpoint = "https://fcm.googleapis.com/fcm/send/test";
const setup = () => {
  const subscriptions = { find: vi.fn().mockResolvedValue(ok({ endpoint, keys: { p256dh: "key", auth: "auth" } })), save: vi.fn().mockResolvedValue(ok(undefined)), remove: vi.fn().mockResolvedValue(ok(undefined)) };
  const push = { send: vi.fn().mockResolvedValue(ok("accepted")) };
  return { subscriptions, push, usecase: createPushNotificationUsecase(subscriptions, push, "key", { now: () => new Date("2026-09-08T00:00:00Z") }) };
};
describe("端末へのテスト通知", () => {
  it("登録済みの端末だけへ送信する", async () => {
    const { subscriptions, push, usecase } = setup();
    subscriptions.find.mockResolvedValue(ok(null));
    expect(await usecase.sendTest(endpoint)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(push.send).not.toHaveBeenCalled();
  });
  it("失効した購読を削除して再登録が必要だと返す", async () => {
    const { subscriptions, push, usecase } = setup();
    push.send.mockResolvedValue(ok("expired"));
    expect(await usecase.sendTest(endpoint)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(subscriptions.remove).toHaveBeenCalledWith(endpoint);
  });
  it("一時的な送信失敗では購読を削除しない", async () => {
    const { subscriptions, push, usecase } = setup();
    push.send.mockResolvedValue(err({ code: "upstream_error", message: "配送失敗" }));
    expect(await usecase.sendTest(endpoint)).toMatchObject({ ok: false });
    expect(subscriptions.remove).not.toHaveBeenCalled();
  });
});
