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
const activityDetailSchema = z.object({ calories: z.number().nonnegative().nullish(), moving_time: z.number().nonnegative() });
export type StravaConfiguration = { readonly clientId: string; readonly clientSecret: string; readonly redirectUri: string };

/** Strava が全応答で返す 15 分・日次の使用率。上限に対する割合で、1 に近いほど 429 が近い。 */
export type StravaRateLimitUsage = { readonly fifteenMinuteRatio: number; readonly dailyRatio: number };
export type StravaActivityDetail = { readonly caloriesKcal: number | null; readonly rateLimit: StravaRateLimitUsage | null };
export type StravaActivityPageResult = StravaActivityPage & { readonly rateLimit: StravaRateLimitUsage | null };

const parseHeaderPair = (value: string | null): readonly [number, number] | null => {
  const parts = value?.split(",").map((part) => Number(part.trim()));
  if (parts?.length !== 2 || parts.some((part) => !Number.isFinite(part))) return null;
  return [parts[0]!, parts[1]!];
};

// 読み取りは全体上限と read 専用上限の両方を消費するため、厳しい方の使用率を採る。
const readRateLimitUsage = (headers: Headers): StravaRateLimitUsage | null => {
  const ratios = (["X-ReadRateLimit", "X-RateLimit"] as const).flatMap((prefix) => {
    const limit = parseHeaderPair(headers.get(`${prefix}-Limit`));
    const usage = parseHeaderPair(headers.get(`${prefix}-Usage`));
    if (limit === null || usage === null || limit[0] <= 0 || limit[1] <= 0) return [];
    return [{ fifteenMinuteRatio: usage[0] / limit[0], dailyRatio: usage[1] / limit[1] }];
  });
  if (ratios.length === 0) return null;
  return {
    fifteenMinuteRatio: Math.max(...ratios.map((ratio) => ratio.fifteenMinuteRatio)),
    dailyRatio: Math.max(...ratios.map((ratio) => ratio.dailyRatio)),
  };
};

export const createStravaApiRepository = (configuration: StravaConfiguration, request: typeof fetch = fetch) => {
  const send = async (url: string, init: RequestInit): Promise<Result<Response, AppError>> => {
    const response = await safeTry(() => request(url, { ...init, signal: AbortSignal.timeout(15_000), redirect: "manual" }));
    if (!response.ok) return err(appError.upstream("Strava に接続できませんでした。時間をおいて再試行してください。"));
    if (response.value.status === 401) return err(appError.upstream("Strava の認可が失効しています。再接続してください。"));
    if (response.value.status === 429) return err(appError.rateLimited("Strava の API 利用上限に達しました。時間をおいて更新してください。"));
    if (response.value.status === 404) return err(appError.notFound("Strava に該当するデータがありません。"));
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
    async activities(accessToken: string, input: StravaActivityQuery): Promise<Result<StravaActivityPageResult, AppError>> {
      const query = new URLSearchParams({
        after: String(Date.parse(`${input.from}T00:00:00+09:00`) / 1000 - 1),
        before: String(Date.parse(`${input.to}T00:00:00+09:00`) / 1000 + 86400),
        page: String(input.page), per_page: "100",
      });
      const sent = await send(`https://www.strava.com/api/v3/athlete/activities?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!sent.ok) return sent;
      const rateLimit = readRateLimitUsage(sent.value.headers);
      const response = await readJson(ok(sent.value), z.array(activitySchema));
      if (!response.ok) return response;
      return ok({
        rateLimit,
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
    async activityDetail(accessToken: string, activityId: string): Promise<Result<StravaActivityDetail, AppError>> {
      const response = await send(`https://www.strava.com/api/v3/activities/${encodeURIComponent(activityId)}?include_all_efforts=false`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) return response;
      const rateLimit = readRateLimitUsage(response.value.headers);
      const detail = await readJson(ok(response.value), activityDetailSchema);
      if (!detail.ok) return detail;
      const { calories, moving_time: movingSeconds } = detail.value;
      // 移動時間のある活動の消費が 0 kcal になることは実際には起こらないため、値を持たない活動として扱う。
      const caloriesKcal = calories == null || (calories === 0 && movingSeconds > 0) ? null : Math.round(calories);
      return ok({ caloriesKcal, rateLimit });
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
