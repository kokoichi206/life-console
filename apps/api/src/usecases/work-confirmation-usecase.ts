import type { PushSubscriptionRepository } from "@api/repositories/push-subscription-repository";
import type { WebPushRepository } from "@api/repositories/web-push-repository";
import type { WorkConfirmationRepository } from "@api/repositories/work-confirmation-repository";
import type { ImportWorkConfirmationsInput } from "@life-console/contracts";
import { ok } from "@life-console/core";

import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

export const createWorkConfirmationUsecase = (
  repository: WorkConfirmationRepository, subscriptions: PushSubscriptionRepository, push: WebPushRepository,
  clock: Clock, ids: IdGenerator, pushConfigured: boolean,
) => ({
  list: () => repository.list(),
  import: (input: ImportWorkConfirmationsInput) => repository.import(input, clock.now().toISOString(), ids),
  complete: (id: string) => repository.complete(id, clock.now().toISOString()),
  async deliverNotifications() {
    if (!pushConfigured) return ok(undefined);
    for (let index = 0; index < 5; index++) {
      const now = clock.now();
      const token = ids.create();
      const claimed = await repository.claimDelivery(token, now.toISOString(), new Date(now.getTime() + 60_000).toISOString());
      if (!claimed.ok) return claimed;
      if (claimed.value === null) return ok(undefined);
      const delivery = claimed.value;
      const subscription = await subscriptions.find(delivery.endpoint);
      if (!subscription.ok) return subscription;
      if (subscription.value === null) {
        const canceled = await repository.finishDelivery(delivery.id, token, "canceled", now.toISOString());
        if (!canceled.ok) return canceled;
        continue;
      }
      const sent = await push.send(subscription.value, {
        title: "Life Console", body: "自分の確認待ちに新しい依頼があります。",
        tag: "work-confirmation-" + delivery.confirmationId,
        workConfirmationId: delivery.confirmationId,
      });
      const retryAt = new Date(clock.now().getTime() + Math.min(3600, 60 * 2 ** Math.min(delivery.attempts - 1, 6)) * 1000).toISOString();
      const finished = await repository.finishDelivery(delivery.id, token, sent.ok ? sent.value : "failed", retryAt);
      if (!finished.ok) return finished;
      if (!sent.ok) return sent;
      if (sent.value === "expired") {
        const removed = await subscriptions.remove(delivery.endpoint);
        if (!removed.ok) return removed;
      }
    }
    return ok(undefined);
  },
});
