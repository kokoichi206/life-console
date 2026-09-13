import { stravaCaloriesStatuses } from "@life-console/domain";
import { z } from "zod";

export const stravaActivityQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  page: z.coerce.number().int().positive().max(100_000).default(1),
}).refine((value) => value.from <= value.to, { message: "開始日と終了日を確認してください。" });
export type StravaActivityQuery = z.infer<typeof stravaActivityQuerySchema>;
export const stravaActivitySchema = z.object({
  id: z.string(),
  name: z.string(),
  sportType: z.string(),
  occurredAt: z.iso.datetime(),
  distanceMeters: z.number().nonnegative(),
  movingSeconds: z.number().nonnegative(),
  elapsedSeconds: z.number().nonnegative(),
  averageHeartrate: z.number().positive().nullable(),
});
export type StravaActivity = z.infer<typeof stravaActivitySchema>;
export type StravaStatus = { readonly configured: boolean; readonly athleteId: number | null };
export type StravaActivityPage = { readonly activities: ReadonlyArray<StravaActivity>; readonly nextPage: number | null };

export const stravaCaloriesQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
}).refine((value) => value.from <= value.to, { message: "開始日と終了日を確認してください。" });
export const stravaActivityCaloriesSchema = z.object({
  activityId: z.string(),
  status: z.enum(stravaCaloriesStatuses),
  caloriesKcal: z.number().int().nonnegative().nullable(),
});
export type StravaActivityCalories = z.infer<typeof stravaActivityCaloriesSchema>;

export const stravaCaloriesSyncPayloadSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
}).refine((value) => value.from <= value.to, { message: "開始日と終了日を確認してください。" });
export const stravaCaloriesReconcileSchema = z.object({
  jobId: z.string().min(1).max(128),
  leaseToken: z.uuid(),
  from: z.iso.date(),
  to: z.iso.date(),
  page: z.number().int().positive().max(100_000),
});
export const stravaCaloriesFetchSchema = z.object({
  jobId: z.string().min(1).max(128),
  leaseToken: z.uuid(),
});
export type StravaCaloriesReconcileInput = z.infer<typeof stravaCaloriesReconcileSchema>;
export type StravaCaloriesFetchInput = z.infer<typeof stravaCaloriesFetchSchema>;

export const stravaCaloriesReconcileResultSchema = z.object({
  nextPage: z.number().int().positive().nullable(),
  registered: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  retryAfterSeconds: z.number().int().nonnegative().nullable(),
  dailyLimitReached: z.boolean(),
});
export const stravaCaloriesFetchResultSchema = z.object({
  fetched: z.number().int().nonnegative(),
  unavailable: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  retryAfterSeconds: z.number().int().nonnegative().nullable(),
  dailyLimitReached: z.boolean(),
});
export type StravaCaloriesReconcileResult = z.infer<typeof stravaCaloriesReconcileResultSchema>;
export type StravaCaloriesFetchResult = z.infer<typeof stravaCaloriesFetchResultSchema>;
