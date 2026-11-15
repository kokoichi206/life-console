import { err, ok, safeTry, type Result } from "@life-console/core";
import { stravaConnection } from "@life-console/db";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { appError, type AppError } from "../shared/app-error";

export type StravaCredentials = {
  readonly athleteId: number;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
};

export const createStravaConnectionRepository = (database: D1Database, encryptionKey: string) => {
  const db = drizzle(database);
  const key = () => crypto.subtle.importKey("raw", Uint8Array.from(encryptionKey.match(/.{2}/gu)!, (byte) => Number.parseInt(byte, 16)), "AES-GCM", false, ["encrypt", "decrypt"]);
  return {
    async read(): Promise<Result<StravaCredentials | null, AppError>> {
      const found = await safeTry(async () => {
        const row = await db.select({ credentials: stravaConnection.credentials }).from(stravaConnection).where(eq(stravaConnection.id, 1)).get();
        if (row === undefined || row.credentials === null) return null;
        const bytes = Uint8Array.from(atob(row.credentials), (character) => character.charCodeAt(0));
        const decoded = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await key(), bytes.slice(12));
        return JSON.parse(new TextDecoder().decode(decoded)) as StravaCredentials;
      });
      return found.ok ? ok(found.value) : err(appError.storage(found.error));
    },
    async claim(leaseToken: string, now: number): Promise<Result<boolean, AppError>> {
      const lease = { leaseToken, leaseExpiresAt: now + 90_000 };
      const claimed = await safeTry(() => db.insert(stravaConnection).values({ id: 1, ...lease })
        .onConflictDoUpdate({ target: stravaConnection.id, set: lease,
          setWhere: or(isNull(stravaConnection.leaseToken), lte(stravaConnection.leaseExpiresAt, now))!,
        }).run());
      return claimed.ok ? ok(claimed.value.meta.changes === 1) : err(appError.storage(claimed.error));
    },
    async write(credentials: StravaCredentials | null, leaseToken: string, now: number): Promise<Result<void, AppError>> {
      const saved = await safeTry(async () => {
        let encoded: string | null = null;
        if (credentials !== null) {
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(JSON.stringify(credentials)));
          encoded = btoa(String.fromCharCode(...iv, ...new Uint8Array(ciphertext)));
        }
        return db.update(stravaConnection).set({ credentials: encoded })
          .where(and(eq(stravaConnection.id, 1), eq(stravaConnection.leaseToken, leaseToken), gt(stravaConnection.leaseExpiresAt, now))).run();
      });
      if (!saved.ok) return err(appError.storage(saved.error));
      return saved.value.meta.changes === 1 ? ok(undefined) : err(appError.conflict("Strava の接続処理が時間切れになりました。接続状態を確認してください。"));
    },
    async release(leaseToken: string): Promise<Result<void, AppError>> {
      const released = await safeTry(() => db.update(stravaConnection).set({ leaseToken: null, leaseExpiresAt: null })
        .where(and(eq(stravaConnection.id, 1), eq(stravaConnection.leaseToken, leaseToken))).run());
      return released.ok ? ok(undefined) : err(appError.storage(released.error));
    },
  };
};
export type StravaConnectionRepository = ReturnType<typeof createStravaConnectionRepository>;
