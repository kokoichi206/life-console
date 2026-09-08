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
