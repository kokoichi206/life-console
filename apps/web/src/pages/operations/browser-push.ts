import { api } from "../../api";

const workerPath = "/push-sw.js";
export type BrowserPushState = {
  readonly supported: boolean;
  readonly permission: NotificationPermission;
  readonly subscribed: boolean;
  readonly registered: boolean;
};
export const supportsBrowserPush = (): boolean => window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const subscription = async (): Promise<PushSubscription | null> => {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration === undefined ? null : registration.pushManager.getSubscription();
};
export const readBrowserPushState = async (): Promise<BrowserPushState> => {
  if (!supportsBrowserPush()) return { supported: false, permission: "default", subscribed: false, registered: false };
  const current = await subscription();
  const status = current === null ? { registered: false } : await api.pushSubscriptionStatus(current.endpoint);
  return { supported: true, permission: Notification.permission, subscribed: current !== null, registered: status.registered };
};
export const enableBrowserPush = async (publicKey: string): Promise<void> => {
  // iOS の許可要求はクリックから直接呼び、通信や SW 登録を先に待たない。
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("通知が許可されませんでした。ブラウザまたは端末の通知設定を確認してください。");
  await navigator.serviceWorker.register(workerPath, { scope: "/", updateViaCache: "none" });
  const registration = await navigator.serviceWorker.ready;
  let current = await registration.pushManager.getSubscription();
  const applicationServerKey = Uint8Array.from(atob(publicKey.replaceAll("-", "+").replaceAll("_", "/")), (character) => character.charCodeAt(0));
  if (current !== null && current.options.applicationServerKey !== null && !new Uint8Array(current.options.applicationServerKey).every((byte, index) => byte === applicationServerKey[index])) {
    await api.unsubscribePush(current.endpoint);
    if (!await current.unsubscribe()) throw new Error("以前の通知登録を解除できませんでした。もう一度お試しください。");
    current = null;
  }
  current ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  const encoded = current.toJSON();
  await api.subscribePush({ endpoint: current.endpoint, keys: { p256dh: encoded.keys!.p256dh!, auth: encoded.keys!.auth! } });
};
export const disableBrowserPush = async (): Promise<void> => {
  const current = await subscription();
  if (current === null) return;
  // サーバーの解除を先に確定し、保存失敗時も端末から再試行できるようにする。
  await api.unsubscribePush(current.endpoint);
  if (!await current.unsubscribe()) throw new Error("通知の送信は停止しましたが、端末の登録を解除できませんでした。もう一度お試しください。");
};
export const sendBrowserPushTest = async (): Promise<void> => {
  const current = await subscription();
  if (current === null) throw new Error("この端末で通知を有効にしてください。");
  await api.testPush(current.endpoint);
};
