import type { PushSubscriptionRepository } from "@api/repositories/push-subscription-repository";
import type { WebPushRepository } from "@api/repositories/web-push-repository";
import type { Clock } from "@api/shared/clock";
import type { PushConfiguration, PushSubscriptionInput } from "@life-console/contracts";
import { err, ok, type Result } from "@life-console/core";

import { appError, type AppError } from "../shared/app-error";

export const createPushNotificationUsecase = (subscriptions: PushSubscriptionRepository, push: WebPushRepository, publicKey: string | null, clock: Clock) => ({
  configuration(): Result<PushConfiguration, AppError> { return ok({ publicKey }); },
  async status(endpoint: string): Promise<Result<{ readonly registered: boolean }, AppError>> {
    const found = await subscriptions.find(endpoint);
    return found.ok ? ok({ registered: found.value !== null }) : found;
  },
  async subscribe(input: PushSubscriptionInput): Promise<Result<void, AppError>> {
    if (publicKey === null) return err(appError.validation("この環境では通知がまだ設定されていません。"));
    return subscriptions.save(input, clock.now().toISOString());
  },
  unsubscribe: (endpoint: string): Promise<Result<void, AppError>> => subscriptions.remove(endpoint),
  async sendTest(endpoint: string): Promise<Result<void, AppError>> {
    const found = await subscriptions.find(endpoint);
    if (!found.ok) return found;
    if (found.value === null) return err(appError.notFound("この端末の通知登録がありません。通知を有効にしてください。"));
    const sent = await push.send(found.value, { title: "Life Console", body: "テスト通知です。通知を押すと同期・実行状況を開きます。", tag: "life-console-push-test" });
    if (!sent.ok) return sent;
    if (sent.value === "expired") {
      const removed = await subscriptions.remove(endpoint);
      if (!removed.ok) return removed;
      return err(appError.conflict("通知の登録が失効しました。一度無効にしてから、再度有効にしてください。"));
    }
    return ok(undefined);
  },
});
