import type { StravaActivityPage, StravaActivityQuery } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";
import { z } from "zod";

import { appError, type AppError } from "../shared/app-error";

const tokensSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_at: z.number().int().positive() });
const authorizationSchema = tokensSchema.extend({ athlete: z.object({ id: z.number().int().positive() }), scope: z.string().optional() });
const activitySchema = z.object({
  id: z.number().int().positive(), name: z.string(), sport_type: z.string(), start_date: z.iso.datetime(),
  distance: z.number().nonnegative(), moving_time: z.number().nonnegative(), elapsed_time: z.number().nonnegative(),
  average_heartrate: z.number().nonnegative().nullish(),
});
export type StravaConfiguration = { readonly clientId: string; readonly clientSecret: string; readonly redirectUri: string };

export const createStravaApiRepository = (configuration: StravaConfiguration, request: typeof fetch = fetch) => {
  const send = async (url: string, init: RequestInit): Promise<Result<Response, AppError>> => {
    const response = await safeTry(() => request(url, { ...init, signal: AbortSignal.timeout(15_000), redirect: "manual" }));
    if (!response.ok) return err(appError.upstream("Strava に接続できませんでした。時間をおいて再試行してください。"));
    if (response.value.status === 401) return err(appError.upstream("Strava の認可が失効しています。再接続してください。"));
    if (response.value.status === 429) return err(appError.upstream("Strava の API 利用上限に達しました。時間をおいて更新してください。"));
    if (!response.value.ok) return err(appError.upstream("Strava の処理に失敗しました。接続状態を確認して再試行してください。"));
    return ok(response.value);
  };
  const readJson = async <T>(response: Result<Response, AppError>, schema: z.ZodType<T>): Promise<Result<T, AppError>> => {
    if (!response.ok) return response;
    const parsed = await safeTry(async () => schema.parse(await response.value.json()));
    return parsed.ok ? ok(parsed.value) : err(appError.upstream("Strava から受け取ったデータの形式を確認できませんでした。"));
  };
  const exchange = (parameters: Record<string, string>) => send("https://www.strava.com/oauth/token", {
    method: "POST", body: new URLSearchParams({ client_id: configuration.clientId, client_secret: configuration.clientSecret, ...parameters }),
  });
  return {
    authorize: (code: string): Promise<Result<z.infer<typeof authorizationSchema>, AppError>> => exchange({ grant_type: "authorization_code", code }).then((response) => readJson(response, authorizationSchema)),
    refresh: (refreshToken: string): Promise<Result<z.infer<typeof tokensSchema>, AppError>> => exchange({ grant_type: "refresh_token", refresh_token: refreshToken }).then((response) => readJson(response, tokensSchema)),
    async activities(accessToken: string, input: StravaActivityQuery): Promise<Result<StravaActivityPage, AppError>> {
      const query = new URLSearchParams({
        after: String(Date.parse(`${input.from}T00:00:00+09:00`) / 1000 - 1),
        before: String(Date.parse(`${input.to}T00:00:00+09:00`) / 1000 + 86400),
        page: String(input.page), per_page: "100",
      });
      const response = await readJson(await send(`https://www.strava.com/api/v3/athlete/activities?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } }), z.array(activitySchema));
      if (!response.ok) return response;
      return ok({
        activities: response.value.filter((activity) => {
          const startedAt = Date.parse(activity.start_date);
          return startedAt >= Date.parse(`${input.from}T00:00:00+09:00`) && startedAt < Date.parse(`${input.to}T00:00:00+09:00`) + 86_400_000;
        }).map((activity) => ({
          id: String(activity.id), name: activity.name, sportType: activity.sport_type, occurredAt: activity.start_date,
          distanceMeters: activity.distance, movingSeconds: activity.moving_time, elapsedSeconds: activity.elapsed_time,
          averageHeartrate: activity.average_heartrate === 0 ? null : activity.average_heartrate ?? null,
        })),
        nextPage: response.value.length === 0 ? null : input.page + 1,
      });
    },
    async revoke(refreshToken: string): Promise<Result<void, AppError>> {
      const response = await send("https://www.strava.com/oauth/revoke", {
        method: "POST", headers: { Authorization: `Basic ${btoa(`${configuration.clientId}:${configuration.clientSecret}`)}` },
        body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" }),
      });
      return response.ok ? ok(undefined) : response;
    },
  };
};
export type StravaApiRepository = ReturnType<typeof createStravaApiRepository>;
