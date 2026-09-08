import type { StravaApiRepository, StravaConfiguration } from "@api/repositories/strava-api-repository";
import type { StravaConnectionRepository, StravaCredentials } from "@api/repositories/strava-connection-repository";
import type { Clock } from "@api/shared/clock";
import type { IdGenerator } from "@api/shared/id-generator";
import type { StravaActivityPage, StravaActivityQuery, StravaStatus } from "@life-console/contracts";
import { err, ok, type Result } from "@life-console/core";

import { appError, type AppError } from "../shared/app-error";

export const createStravaUsecase = (connections: StravaConnectionRepository, upstream: StravaApiRepository, configuration: StravaConfiguration, clock: Clock, ids: IdGenerator) => {
  const withLease = async <T>(operation: (lease: string) => Promise<Result<T, AppError>>): Promise<Result<T, AppError>> => {
    const lease = ids.create();
    const claimed = await connections.claim(lease, clock.now().getTime());
    if (!claimed.ok) return claimed;
    if (!claimed.value) return err(appError.conflict("Strava の接続を更新中です。少し待って再試行してください。"));
    const result = await operation(lease);
    const released = await connections.release(lease);
    return released.ok ? result : released;
  };
  const refreshIfNeeded = async (): Promise<Result<StravaCredentials, AppError>> => {
    const current = await connections.read();
    if (!current.ok) return current;
    if (current.value === null) return err(appError.conflict("Strava に接続してください。"));
    if (current.value.expiresAt > clock.now().getTime() / 1000 + 60) return ok(current.value);
    return withLease(async (lease) => {
      const latest = await connections.read();
      if (!latest.ok) return latest;
      if (latest.value === null) return err(appError.conflict("Strava に接続してください。"));
      if (latest.value.expiresAt > clock.now().getTime() / 1000 + 60) return ok(latest.value);
      const refreshed = await upstream.refresh(latest.value.refreshToken);
      if (!refreshed.ok) return refreshed;
      const credentials = { athleteId: latest.value.athleteId, accessToken: refreshed.value.access_token, refreshToken: refreshed.value.refresh_token, expiresAt: refreshed.value.expires_at };
      const saved = await connections.write(credentials, lease, clock.now().getTime());
      return saved.ok ? ok(credentials) : err({ ...saved.error, message: "更新した接続情報を保存できませんでした。Strava に再接続してください。" });
    });
  };
  return {
    async status(): Promise<Result<StravaStatus, AppError>> {
      const current = await connections.read();
      return current.ok ? ok({ configured: true, athleteId: current.value?.athleteId ?? null }) : current;
    },
    authorizationUrl(state: string): Result<string, AppError> {
      const query = new URLSearchParams({ client_id: configuration.clientId, redirect_uri: configuration.redirectUri, response_type: "code", approval_prompt: "force", scope: "activity:read_all", state });
      return ok(`https://www.strava.com/oauth/authorize?${query}`);
    },
    connect(code: string, scope: string): Promise<Result<void, AppError>> {
      if (!scope.split(/[ ,]+/u).includes("activity:read_all")) return Promise.resolve(err(appError.validation("非公開の運動も読み取る権限を許可してください。")));
      return withLease(async (lease) => {
        const authorized = await upstream.authorize(code);
        if (!authorized.ok) return authorized;
        if (authorized.value.scope !== undefined && !authorized.value.scope.split(/[ ,]+/u).includes("activity:read_all")) {
          return err(appError.validation("非公開の運動も読み取る権限を許可してください。"));
        }
        return connections.write({ athleteId: authorized.value.athlete.id, accessToken: authorized.value.access_token, refreshToken: authorized.value.refresh_token, expiresAt: authorized.value.expires_at }, lease, clock.now().getTime());
      });
    },
    async activities(input: StravaActivityQuery): Promise<Result<StravaActivityPage, AppError>> {
      const credentials = await refreshIfNeeded();
      return credentials.ok ? upstream.activities(credentials.value.accessToken, input) : credentials;
    },
    disconnect(): Promise<Result<void, AppError>> {
      return withLease(async (lease) => {
        const current = await connections.read();
        if (!current.ok) return current;
        if (current.value === null) return ok(undefined);
        const revoked = await upstream.revoke(current.value.refreshToken);
        if (!revoked.ok) return revoked;
        return connections.write(null, lease, clock.now().getTime());
      });
    },
  };
};
