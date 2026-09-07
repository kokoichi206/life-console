import { z } from "zod";

export const APP_ENV = {
  LOCAL: "local",
  DEV: "development",
  PROD: "production",
} as const;

export const appEnvSchema = z.enum(Object.values(APP_ENV));
export type AppEnv = z.infer<typeof appEnvSchema>;
export const baseEnvSchema = z.object({ APP_ENV: appEnvSchema });
