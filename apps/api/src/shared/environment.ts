import { APP_ENV, baseEnvSchema } from "@life-console/env";
import { z } from "zod";

export const apiEnvironmentSchema = baseEnvSchema.extend({
  STRAVA_CLIENT_ID: z.string().regex(/^\d+$/u).optional(),
  STRAVA_CLIENT_SECRET: z.string().min(1).optional(),
  STRAVA_TOKEN_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/u).optional(),
  STRAVA_REDIRECT_URI: z.url().refine((value) => {
    const url = new URL(value);
    return url.pathname === "/api/v1/strava/callback" && url.search === "" && url.hash === "" && url.username === "" && url.password === ""
      && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  }).optional(),
  PHOTO_UPLOAD_MODE: z.enum(["worker", "r2"]),
  MONITORED_RUNNER_IDS: z.string().min(1).refine((value) => value.split(",").every((id) => id.trim().length > 0 && id.trim().length <= 200)).optional(),
  WEB_PUSH_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{87}$/u).optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/u).optional(),
  WEB_PUSH_SUBJECT: z.url().refine((value) => value.startsWith("mailto:") || value.startsWith("https://")).optional(),
  RUNNER_TOKEN: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
}).superRefine((environment, context) => {
  const stravaKeys = ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_TOKEN_KEY", "STRAVA_REDIRECT_URI"] as const;
  if (stravaKeys.some((key) => environment[key] !== undefined)) {
    for (const key of stravaKeys) {
      if (environment[key] === undefined) context.addIssue({ code: "custom", path: [key], message: "Strava の設定は 4 項目すべて指定してください。" });
    }
  }
  const pushKeys = ["WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_PRIVATE_KEY", "WEB_PUSH_SUBJECT"] as const;
  if (pushKeys.some((key) => environment[key] !== undefined)) {
    for (const key of pushKeys) {
      if (environment[key] === undefined) context.addIssue({ code: "custom", path: [key], message: "Web Push の設定は 3 項目すべて指定してください。" });
    }
  }
  if (environment.APP_ENV !== APP_ENV.LOCAL && environment.RUNNER_TOKEN === "local-runner-token") {
    context.addIssue({ code: "custom", path: ["RUNNER_TOKEN"], message: "local 以外では専用の token を設定してください。" });
  }
  if (environment.PHOTO_UPLOAD_MODE === "r2") {
    for (const key of ["R2_ACCESS_KEY_ID", "R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_SECRET_ACCESS_KEY"] as const) {
      if (environment[key] === undefined) context.addIssue({ code: "custom", path: [key], message: "R2 直接 upload に必要です。" });
    }
  }
});

export interface ApiEnvironment extends z.infer<typeof apiEnvironmentSchema> {
  readonly ASSETS: Fetcher;
  readonly DB: D1Database;
  readonly MEAL_PHOTOS: R2Bucket;
}

export const parseApiEnvironment = (bindings: ApiEnvironment): ApiEnvironment => ({ ...bindings, ...apiEnvironmentSchema.parse(bindings) });
