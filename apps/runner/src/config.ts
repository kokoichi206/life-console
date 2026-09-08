import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type { MonitorTarget } from "@life-console/contracts";

import { runnerEnvironmentSchema } from "./environment";

const environment = runnerEnvironmentSchema.parse(process.env);

export type RunnerConfig = {
  readonly monitorTargets: ReadonlyArray<MonitorTarget>;
  readonly monitorQueuePath: string;
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
  readonly obsidianVaultPath: string | undefined;
  readonly weightCsvPath: string | undefined;
  readonly wranglerBin: string | undefined;
};

export const runnerConfig: RunnerConfig = {
  monitorTargets: [{ service: "runner", account: "process" }, ...environment.LIFE_CONSOLE_MONITOR_SERVICES.map((service) => ({ service,
    account: ({ slack: environment.SLACK_WORKSPACE, chatwork: environment.CHATWORK_ACCOUNT, talknote: environment.TALKNOTE_ACCOUNT,
      gmail: environment.GMAIL_ACCOUNT, calendar: environment.GMAIL_ACCOUNT, orca: "local" })[service] ?? "default",
  }))],
  monitorQueuePath: environment.LIFE_CONSOLE_MONITOR_QUEUE_PATH ?? resolve(homedir(), ".local/state/life-console/monitoring",
    `${createHash("sha256").update(`${environment.LIFE_CONSOLE_API_URL}:${environment.LIFE_CONSOLE_RUNNER_ID}`).digest("hex")}.sqlite`),
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
  obsidianVaultPath: environment.OBSIDIAN_VAULT_PATH,
  weightCsvPath: environment.WEIGHT_CSV_PATH,
  wranglerBin: environment.WRANGLER_BIN,
};
