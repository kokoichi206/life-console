import { describe, expect, it, vi } from "vitest";
import webPush from "web-push";

import { createWebPushRepository } from "./web-push-repository";

const keys = { ...webPush.generateVAPIDKeys(), subject: "mailto:push@example.com" };

const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/test", keys: { p256dh: webPush.generateVAPIDKeys().publicKey, auth: "AAAAAAAAAAAAAAAAAAAAAA" } };
const message = { title: "Life Console", body: "テスト通知", tag: "test" };
describe("Web Push の配送", () => {
  it("暗号化と VAPID 署名を行い、リダイレクトせず配送先へ送る", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
    expect(await createWebPushRepository(keys, send).send(subscription, message)).toEqual({ ok: true, value: "accepted" });
    const [, request] = send.mock.calls[0]!;
    expect(request?.redirect).toBe("manual");
    expect(new Headers(request?.headers).get("authorization")).toMatch(/^vapid /u);
    expect(new Headers(request?.headers).get("content-encoding")).toBe("aes128gcm");
    expect(new TextDecoder().decode(request?.body as Uint8Array)).not.toContain(message.body);
  });
  it.each([404, 410])("%i の購読失効を一時的な配送失敗と区別する", async (status) => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    expect(await createWebPushRepository(keys, send).send(subscription, message)).toEqual({ ok: true, value: "expired" });
  });
  it("通知先からのリダイレクトを追わず失敗として返す", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://other.example" } }));
    expect(await createWebPushRepository(keys, send).send(subscription, message)).toMatchObject({ ok: false, error: { code: "upstream_error" } });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![1]?.redirect).toBe("manual");
  });
  it("配送拒否・通信失敗を成功にしない", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 503 })).mockRejectedValueOnce(new Error("offline"));
    const repository = createWebPushRepository(keys, send);
    expect(await repository.send(subscription, message)).toMatchObject({ ok: false, error: { code: "upstream_error" } });
    expect(await repository.send(subscription, message)).toMatchObject({ ok: false, error: { code: "upstream_error" } });
  });
});
