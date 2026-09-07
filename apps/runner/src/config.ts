import { hostname } from "node:os";
import { resolve } from "node:path";

import { z } from "zod";

const runnerEnvironmentSchema = z.object({
  LIFE_CONSOLE_API_URL: z.url().default("http://localhost:8788"),
  LIFE_CONSOLE_RUNNER_ID: z.string().min(1).default(`mac-${hostname()}`),
  LIFE_CONSOLE_RUNNER_NAME: z.string().min(1).default(hostname()),
  LIFE_CONSOLE_RUNNER_TOKEN: z.string().min(1).default("local-runner-token"),
  CF_ACCESS_CLIENT_ID: z.string().min(1).optional(),
  CF_ACCESS_CLIENT_SECRET: z.string().min(1).optional(),
  LIFE_CONSOLE_POLL_SECONDS: z.coerce.number().int().min(10).default(60),
  LIFE_CONSOLE_HEARTBEAT_SECONDS: z.coerce.number().int().min(10).default(60),
  SLACK_WORKSPACE: z.string().min(1).optional(),
  SLACK_SEARCH_QUERY: z.string().min(1).optional(),
  CHATWORK_ACCOUNT: z.string().min(1).optional(),
  CHATWORK_ROOM_IDS: z.string().default(""),
  GMAIL_ACCOUNT: z.email().optional(),
  GMAIL_SEARCH_QUERY: z.string().min(1).default("in:inbox category:primary newer_than:7d -in:sent -in:drafts"),
  TALKNOTE_ACCOUNT: z.string().min(1).optional(),
  WEIGHT_CSV_PATH: z.string().min(1).optional(),
  FINANCE_CSV_PATH: z.string().min(1).optional(),
  BACKUP_DIRECTORY: z.string().min(1).optional(),
  CLOUDFLARE_D1_DATABASE_NAME: z.string().min(1).optional(),
  CLOUDFLARE_R2_BUCKET_NAME: z.string().min(1).optional(),
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().min(1).optional(),
  WRANGLER_BIN: z.string().min(1).optional(),
  LIFE_CONSOLE_REPOSITORY_ROOT: z.string().min(1).default(process.cwd()),
});

const environment = runnerEnvironmentSchema.parse(process.env);

if ((environment.CF_ACCESS_CLIENT_ID === undefined) !== (environment.CF_ACCESS_CLIENT_SECRET === undefined)) {
  throw new Error("CF_ACCESS_CLIENT_ID と CF_ACCESS_CLIENT_SECRET は両方設定してください。");
}

export type RunnerConfig = {
  readonly apiUrl: string;
  readonly backupDirectory: string | undefined;
  readonly cfAccessClientId: string | undefined;
  readonly cfAccessClientSecret: string | undefined;
  readonly chatworkAccount: string | undefined;
  readonly chatworkRoomIds: ReadonlyArray<string>;
  readonly gmailAccount: string | undefined;
  readonly gmailSearchQuery: string;
  readonly talknoteAccount: string | undefined;
  readonly d1DatabaseName: string | undefined;
  readonly financeCsvPath: string | undefined;
  readonly heartbeatMilliseconds: number;
  readonly pollMilliseconds: number;
  readonly promotionSkillPath: string;
  readonly r2BucketName: string | undefined;
  readonly r2AccountId: string | undefined;
  readonly runnerId: string;
  readonly runnerName: string;
  readonly runnerToken: string;
  readonly slackSearchQuery: string | undefined;
  readonly slackWorkspace: string | undefined;
  readonly weightCsvPath: string | undefined;
  readonly wranglerBin: string | undefined;
};

export const runnerConfig: RunnerConfig = {
  apiUrl: environment.LIFE_CONSOLE_API_URL.replace(/\/$/u, ""),
  backupDirectory: environment.BACKUP_DIRECTORY,
  cfAccessClientId: environment.CF_ACCESS_CLIENT_ID,
  cfAccessClientSecret: environment.CF_ACCESS_CLIENT_SECRET,
  chatworkAccount: environment.CHATWORK_ACCOUNT,
  chatworkRoomIds: environment.CHATWORK_ROOM_IDS.split(",").map((roomId) => roomId.trim()).filter(Boolean),
  gmailAccount: environment.GMAIL_ACCOUNT,
  gmailSearchQuery: environment.GMAIL_SEARCH_QUERY,
  talknoteAccount: environment.TALKNOTE_ACCOUNT,
  d1DatabaseName: environment.CLOUDFLARE_D1_DATABASE_NAME,
  financeCsvPath: environment.FINANCE_CSV_PATH,
  heartbeatMilliseconds: environment.LIFE_CONSOLE_HEARTBEAT_SECONDS * 1_000,
  pollMilliseconds: environment.LIFE_CONSOLE_POLL_SECONDS * 1_000,
  promotionSkillPath: resolve(environment.LIFE_CONSOLE_REPOSITORY_ROOT, ".agents/skills/github-task-promotion/SKILL.md"),
  r2BucketName: environment.CLOUDFLARE_R2_BUCKET_NAME,
  r2AccountId: environment.CLOUDFLARE_R2_ACCOUNT_ID,
  runnerId: environment.LIFE_CONSOLE_RUNNER_ID,
  runnerName: environment.LIFE_CONSOLE_RUNNER_NAME,
  runnerToken: environment.LIFE_CONSOLE_RUNNER_TOKEN,
  slackSearchQuery: environment.SLACK_SEARCH_QUERY,
  slackWorkspace: environment.SLACK_WORKSPACE,
  weightCsvPath: environment.WEIGHT_CSV_PATH,
  wranglerBin: environment.WRANGLER_BIN,
};
