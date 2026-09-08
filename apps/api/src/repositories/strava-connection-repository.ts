import { err, ok, safeTry, type Result } from "@life-console/core";

import { appError, type AppError } from "../shared/app-error";

export type StravaCredentials = {
  readonly athleteId: number;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
};

export const createStravaConnectionRepository = (database: D1Database, encryptionKey: string) => {
  const key = () => crypto.subtle.importKey("raw", Uint8Array.from(encryptionKey.match(/.{2}/gu)!, (byte) => Number.parseInt(byte, 16)), "AES-GCM", false, ["encrypt", "decrypt"]);
  return {
    async read(): Promise<Result<StravaCredentials | null, AppError>> {
      const found = await safeTry(async () => {
        const row = await database.prepare("SELECT credentials FROM strava_connection WHERE id = 1").first<{ credentials: string | null }>();
        if (row === null || row.credentials === null) return null;
        const bytes = Uint8Array.from(atob(row.credentials), (character) => character.charCodeAt(0));
        const decoded = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await key(), bytes.slice(12));
        return JSON.parse(new TextDecoder().decode(decoded)) as StravaCredentials;
      });
      return found.ok ? ok(found.value) : err(appError.storage(found.error));
    },
    async claim(leaseToken: string, now: number): Promise<Result<boolean, AppError>> {
      const claimed = await safeTry(() => database.prepare(`INSERT INTO strava_connection (id, lease_token, lease_expires_at)
        VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET lease_token = excluded.lease_token, lease_expires_at = excluded.lease_expires_at
        WHERE strava_connection.lease_token IS NULL OR strava_connection.lease_expires_at <= ?`)
        .bind(leaseToken, now + 90_000, now).run());
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
        return database.prepare("UPDATE strava_connection SET credentials = ? WHERE id = 1 AND lease_token = ? AND lease_expires_at > ?")
          .bind(encoded, leaseToken, now).run();
      });
      if (!saved.ok) return err(appError.storage(saved.error));
      return saved.value.meta.changes === 1 ? ok(undefined) : err(appError.conflict("Strava の接続処理が時間切れになりました。接続状態を確認してください。"));
    },
    async release(leaseToken: string): Promise<Result<void, AppError>> {
      const released = await safeTry(() => database.prepare("UPDATE strava_connection SET lease_token = NULL, lease_expires_at = NULL WHERE id = 1 AND lease_token = ?").bind(leaseToken).run());
      return released.ok ? ok(undefined) : err(appError.storage(released.error));
    },
  };
};
export type StravaConnectionRepository = ReturnType<typeof createStravaConnectionRepository>;
