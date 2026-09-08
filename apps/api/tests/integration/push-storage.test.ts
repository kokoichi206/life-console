import { describe, expect, it } from "vitest";

import { app } from "../../src/app";
import { createPushSubscriptionRepository } from "../../src/repositories/push-subscription-repository";

import { createApiStorage } from "./support/d1-storage";

const createStorage = () => {
  const { database, binding } = createApiStorage();
  return { database, binding, repository: createPushSubscriptionRepository(binding) };
};
const endpoint = "https://fcm.googleapis.com/fcm/send/example";
const subscription = { endpoint, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } };
const now = "2026-09-08T00:00:00Z";
describe("通知先の永続化", () => {
  it("同じ端末の登録を更新し、別端末を残して解除する", async () => {
    const { database, repository } = createStorage();
    expect(await repository.save(subscription, now)).toMatchObject({ ok: true });
    expect(await repository.save({ ...subscription, endpoint: `${endpoint}-other` }, now)).toMatchObject({ ok: true });
    const refreshed = { ...subscription, keys: { ...subscription.keys, auth: "C".repeat(22) } };
    expect(await repository.save(refreshed, "2026-09-08T01:00:00Z")).toMatchObject({ ok: true });
    expect(await repository.find(endpoint)).toEqual({ ok: true, value: refreshed });
    expect(database.prepare("SELECT count(*) AS count FROM push_subscriptions").get()?.count).toBe(2);
    expect(await repository.remove(endpoint)).toMatchObject({ ok: true });
    expect(await repository.find(endpoint)).toEqual({ ok: true, value: null });
    expect((await repository.find(`${endpoint}-other`)).ok).toBe(true);
    database.close();
  });
  it("HTTP から保存・状態確認・解除でき、秘密情報を返さない", async () => {
    const { database, binding } = createStorage();
    const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding,
      WEB_PUSH_PUBLIC_KEY: "B".repeat(87), WEB_PUSH_PRIVATE_KEY: "A".repeat(43), WEB_PUSH_SUBJECT: "mailto:push@example.com" };
    const request = (path: string, method: string, body: unknown) => app.request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, environment);
    const saved = await request("/api/v1/push/subscription", "PUT", subscription);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ data: null });
    const status = await request("/api/v1/push/subscription/status", "POST", { endpoint });
    expect(await status.json()).toEqual({ data: { registered: true } });
    const config = await app.request("/api/v1/push/configuration", {}, environment);
    expect(await config.json()).toEqual({ data: { publicKey: environment.WEB_PUSH_PUBLIC_KEY } });
    expect((await request("/api/v1/push/subscription", "DELETE", { endpoint })).status).toBe(200);
    const removed = await request("/api/v1/push/subscription/status", "POST", { endpoint });
    expect(await removed.json()).toEqual({ data: { registered: false } });
    database.close();
  });
  it("任意の送信先を HTTP 境界で拒否する", async () => {
    const response = await app.request("/api/v1/push/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: "https://localhost/private" }) }, { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker" });
    expect(response.status).toBe(400);
  });
});
