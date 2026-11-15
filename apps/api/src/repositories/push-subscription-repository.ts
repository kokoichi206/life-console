import type { PushSubscriptionInput } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";
import { pushSubscriptions } from "@life-console/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { appError, type AppError } from "../shared/app-error";

export const createPushSubscriptionRepository = (database: D1Database) => {
  const db = drizzle(database);
  return {
    async save(input: PushSubscriptionInput, now: string): Promise<Result<void, AppError>> {
      const keys = { p256dh: input.keys.p256dh, auth: input.keys.auth, updatedAt: now };
      const saved = await safeTry(() => db.insert(pushSubscriptions).values({ endpoint: input.endpoint, ...keys, createdAt: now })
        .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: keys }).run());
      return saved.ok ? ok(undefined) : err(appError.storage(saved.error));
    },
    async find(endpoint: string): Promise<Result<PushSubscriptionInput | null, AppError>> {
      const found = await safeTry(() => db.select({ endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
        .from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).get());
      if (!found.ok) return err(appError.storage(found.error));
      const row = found.value;
      return ok(row === undefined ? null : { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } });
    },
    async remove(endpoint: string): Promise<Result<void, AppError>> {
      const removed = await safeTry(() => db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run());
      return removed.ok ? ok(undefined) : err(appError.storage(removed.error));
    },
  };
};
export type PushSubscriptionRepository = ReturnType<typeof createPushSubscriptionRepository>;
