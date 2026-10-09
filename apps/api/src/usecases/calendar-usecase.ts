import type { CalendarRepository } from "@api/repositories/calendar-repository";
import type { PushSubscriptionRepository } from "@api/repositories/push-subscription-repository";
import type { WebPushRepository } from "@api/repositories/web-push-repository";
import type { CalendarRange, CollectionCalendar, CollectionSettings, UpdateCalendarEvent } from "@life-console/contracts";
import { err, ok, type Result } from "@life-console/core";

import { appError, type AppError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

export const createCalendarUsecase = (repository: CalendarRepository, subscriptions: PushSubscriptionRepository, push: WebPushRepository, clock: Clock, ids: IdGenerator, pushConfigured: boolean) => ({
  list: (range: CalendarRange): Promise<Result<CollectionCalendar, AppError>> => repository.list(range),
  async saveSettings(input: CollectionSettings): Promise<Result<void, AppError>> {
    if (input.notificationsEnabled && !pushConfigured) return err(appError.validation("この環境では通知がまだ設定されていません。収集日だけを保存するか、通知の設定を確認してください。"));
    const now = clock.now().toISOString();
    const saved = await repository.saveSettings(input, now);
    return saved.ok ? repository.reconcile(now) : saved;
  },
  async updateEvent(id: string, input: UpdateCalendarEvent): Promise<Result<void, AppError>> {
    const now = clock.now().toISOString();
    const saved = await repository.updateEvent(id, input, now);
    return saved.ok ? repository.reconcile(now) : saved;
  },
  createPreparation: (id: string): Promise<Result<void, AppError>> => repository.createPreparation(id, ids.create(), clock.now().toISOString()),
  async maintain(): Promise<Result<void, AppError>> {
    const reconciled = await repository.reconcile(clock.now().toISOString());
    if (!reconciled.ok) return reconciled;
    if (!pushConfigured) return ok(undefined);
    const expanded = await repository.expandDue(clock.now().toISOString());
    if (!expanded.ok) return expanded;
    for (let index = 0; index < 5; index++) {
      const now = clock.now();
      const token = ids.create();
      const claimed = await repository.claimDelivery(token, now.toISOString(), new Date(now.getTime() + 60_000).toISOString());
      if (!claimed.ok) return claimed;
      if (claimed.value === null) break;
      const delivery = claimed.value;
      const subscription = await subscriptions.find(delivery.endpoint);
      if (!subscription.ok) return subscription;
      const sent = subscription.value === null
        ? ok("canceled" as const)
        : await push.send(subscription.value, {
            title: "Life Console", body: `${delivery.date} は${delivery.title}の収集日です。午前 8 時 30 分までに出してください。`,
            tag: `calendar-${delivery.eventId}`, calendarEventId: delivery.eventId,
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
    return repository.finishReservations();
  },
});
