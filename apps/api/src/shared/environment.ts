import { APP_ENV, baseEnvSchema } from "@life-console/env";
import { z } from "zod";

export const apiEnvironmentSchema = baseEnvSchema.extend({
  PHOTO_UPLOAD_MODE: z.enum(["worker", "r2"]),
  RUNNER_TOKEN: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
}).superRefine((environment, context) => {
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
