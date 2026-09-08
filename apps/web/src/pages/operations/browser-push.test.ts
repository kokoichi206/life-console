import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../../api";

import { disableBrowserPush, enableBrowserPush, readBrowserPushState } from "./browser-push";

vi.mock("../../api", () => ({ api: { subscribePush: vi.fn(), unsubscribePush: vi.fn(), pushSubscriptionStatus: vi.fn() } }));
const publicKey = "B".repeat(87);
const setup = () => {
  const current = { endpoint: "https://fcm.googleapis.com/test", options: { applicationServerKey: null }, unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } }) };
  const pushManager = { getSubscription: vi.fn().mockResolvedValue(current), subscribe: vi.fn().mockResolvedValue(current) };
  const registration = { pushManager };
  const serviceWorker = { register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration), getRegistration: vi.fn().mockResolvedValue(registration) };
  const requestPermission = vi.fn().mockResolvedValue("granted");
  vi.stubGlobal("window", { isSecureContext: true, PushManager: {}, Notification: {} });
  vi.stubGlobal("navigator", { serviceWorker });
  vi.stubGlobal("Notification", { permission: "granted", requestPermission });
  vi.mocked(api.subscribePush).mockResolvedValue(null);
  vi.mocked(api.unsubscribePush).mockResolvedValue(null);
  vi.mocked(api.pushSubscriptionStatus).mockResolvedValue({ registered: true });
  return { current, pushManager, serviceWorker, requestPermission };
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
describe("端末の通知登録", () => {
  it("許可要求を最初に行い、既存の購読を再利用して保存する", async () => {
    const { pushManager, serviceWorker, requestPermission } = setup();
    await enableBrowserPush(publicKey);
    expect(requestPermission.mock.invocationCallOrder[0]).toBeLessThan(serviceWorker.register.mock.invocationCallOrder[0]!);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(api.subscribePush).toHaveBeenCalledOnce();
  });
  it("許可されなければ購読や API 保存を行わない", async () => {
    const { requestPermission, serviceWorker } = setup();
    requestPermission.mockResolvedValue("denied");
    await expect(enableBrowserPush(publicKey)).rejects.toThrow("通知が許可されませんでした");
    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(api.subscribePush).not.toHaveBeenCalled();
  });
  it("DB に保存できなければ有効化を成功にしない", async () => {
    setup();
    vi.mocked(api.subscribePush).mockRejectedValue(new Error("保存失敗"));
    await expect(enableBrowserPush(publicKey)).rejects.toThrow("保存失敗");
  });
  it("サーバーの解除が失敗したら端末の購読を残し再試行できる", async () => {
    const { current } = setup();
    vi.mocked(api.unsubscribePush).mockRejectedValue(new Error("解除失敗"));
    await expect(disableBrowserPush()).rejects.toThrow("解除失敗");
    expect(current.unsubscribe).not.toHaveBeenCalled();
  });
  it("ブラウザの購読だけでは登録済みと表示しない", async () => {
    setup();
    vi.mocked(api.pushSubscriptionStatus).mockResolvedValue({ registered: false });
    expect(await readBrowserPushState()).toMatchObject({ subscribed: true, registered: false });
  });
});
