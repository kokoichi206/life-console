import type { PushMessage, PushSubscriptionInput } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";
import webPush from "web-push";

import { appError, type AppError } from "../shared/app-error";

export type WebPushKeys = { readonly publicKey: string; readonly privateKey: string; readonly subject: string };
export const createWebPushRepository = (keys: WebPushKeys | null, send: typeof fetch = fetch) => ({
  async send(subscription: PushSubscriptionInput, message: PushMessage): Promise<Result<"accepted" | "expired", AppError>> {
    if (keys === null) return err(appError.validation("この環境では通知がまだ設定されていません。"));
    const request = await safeTry(() => webPush.generateRequestDetails(subscription, JSON.stringify(message), {
      vapidDetails: keys, TTL: 300, urgency: "high",
    }));
    if (!request.ok) return err(appError.upstream("通知の暗号化に失敗しました。", request.error));
    const response = await safeTry(() => send(request.value.endpoint, {
      method: request.value.method, headers: request.value.headers,
      body: request.value.body === null ? null : new Uint8Array(request.value.body),
      redirect: "manual", signal: AbortSignal.timeout(15_000),
    }));
    if (!response.ok) return err(appError.upstream("通知サービスに接続できませんでした。", response.error));
    if (response.value.status === 404 || response.value.status === 410) return ok("expired");
    if (!response.value.ok) return err(appError.upstream("通知サービスが送信を受け付けませんでした。"));
    return ok("accepted");
  },
});
export type WebPushRepository = ReturnType<typeof createWebPushRepository>;
