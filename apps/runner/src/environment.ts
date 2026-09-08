import { hostname } from "node:os";

import { monitorServiceSchema } from "@life-console/contracts";
import { APP_ENV, baseEnvSchema } from "@life-console/env";
import { z } from "zod";

export const runnerEnvironmentSchema = baseEnvSchema.extend({
  LIFE_CONSOLE_API_URL: z.url().optional(),
  LIFE_CONSOLE_RUNNER_ID: z.string().min(1).default(`mac-${hostname()}`),
  LIFE_CONSOLE_RUNNER_NAME: z.string().min(1).default(hostname()),
  LIFE_CONSOLE_RUNNER_TOKEN: z.string().min(1).optional(),
  CF_ACCESS_CLIENT_ID: z.string().min(1).optional(),
  CF_ACCESS_CLIENT_SECRET: z.string().min(1).optional(),
  LIFE_CONSOLE_MONITOR_SERVICES: z.string().default("slack,chatwork,talknote,gmail,calendar,orca").transform((value) => Array.from(new Set(value.split(",").map((part) => part.trim()).filter(Boolean)))).pipe(z.array(monitorServiceSchema.exclude(["runner"]))),
  LIFE_CONSOLE_MONITOR_QUEUE_PATH: z.string().min(1).optional(),
  LIFE_CONSOLE_POLL_SECONDS: z.coerce.number().int().min(10).default(60),
  LIFE_CONSOLE_HEARTBEAT_SECONDS: z.coerce.number().int().min(10).default(60),
  SLACK_WORKSPACE: z.string().min(1).optional(),
  SLACK_SEARCH_QUERY: z.string().min(1).optional(),
  CHATWORK_ACCOUNT: z.string().min(1).optional(),
  CHATWORK_ROOM_IDS: z.string().default(""),
  GMAIL_ACCOUNT: z.email().optional(),
  GMAIL_SEARCH_QUERY: z.string().min(1).default("in:inbox category:primary newer_than:7d -in:sent -in:drafts"),
  TALKNOTE_ACCOUNT: z.string().min(1).optional(),
  OBSIDIAN_VAULT_PATH: z.string().min(1).optional(),
  WEIGHT_CSV_PATH: z.string().min(1).optional(),
  FINANCE_CSV_PATH: z.string().min(1).optional(),
  BACKUP_DIRECTORY: z.string().min(1).optional(),
  CLOUDFLARE_D1_DATABASE_NAME: z.string().min(1).optional(),
  CLOUDFLARE_R2_BUCKET_NAME: z.string().min(1).optional(),
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().min(1).optional(),
  WRANGLER_BIN: z.string().min(1).optional(),
  LIFE_CONSOLE_REPOSITORY_ROOT: z.string().min(1).default(process.cwd()),
}).superRefine((environment, context) => {
  if (environment.APP_ENV !== APP_ENV.LOCAL) {
    if (environment.LIFE_CONSOLE_API_URL === undefined) context.addIssue({ code: "custom", path: ["LIFE_CONSOLE_API_URL"], message: "接続先を指定してください。" });
    if (environment.LIFE_CONSOLE_RUNNER_TOKEN === undefined || environment.LIFE_CONSOLE_RUNNER_TOKEN === "local-runner-token") context.addIssue({ code: "custom", path: ["LIFE_CONSOLE_RUNNER_TOKEN"], message: "専用の token を設定してください。" });
  }
  if ((environment.CF_ACCESS_CLIENT_ID === undefined) !== (environment.CF_ACCESS_CLIENT_SECRET === undefined)) context.addIssue({ code: "custom", path: ["CF_ACCESS_CLIENT_ID"], message: "Access の ID と secret は両方設定してください。" });
}).transform((environment) => ({
  ...environment,
  LIFE_CONSOLE_API_URL: environment.LIFE_CONSOLE_API_URL ?? "http://localhost:8788",
  LIFE_CONSOLE_RUNNER_TOKEN: environment.LIFE_CONSOLE_RUNNER_TOKEN ?? "local-runner-token",
}));
