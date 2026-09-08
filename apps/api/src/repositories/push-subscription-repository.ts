import type { PushSubscriptionInput } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";

import { appError, type AppError } from "../shared/app-error";

export const createPushSubscriptionRepository = (database: D1Database) => ({
  async save(input: PushSubscriptionInput, now: string): Promise<Result<void, AppError>> {
    const saved = await safeTry(() => database.prepare(`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, updated_at = excluded.updated_at
    `).bind(input.endpoint, input.keys.p256dh, input.keys.auth, now, now).run());
    return saved.ok ? ok(undefined) : err(appError.storage(saved.error));
  },
  async find(endpoint: string): Promise<Result<PushSubscriptionInput | null, AppError>> {
    const found = await safeTry(() => database.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = ?")
      .bind(endpoint).first<{ endpoint: string; p256dh: string; auth: string }>());
    if (!found.ok) return err(appError.storage(found.error));
    const row = found.value;
    return ok(row === null ? null : { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } });
  },
  async remove(endpoint: string): Promise<Result<void, AppError>> {
    const removed = await safeTry(() => database.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run());
    return removed.ok ? ok(undefined) : err(appError.storage(removed.error));
  },
});
export type PushSubscriptionRepository = ReturnType<typeof createPushSubscriptionRepository>;
