import type { MonitorOutcome, MonitorTarget } from "@life-console/contracts";
import { z } from "zod";

import type { RunnerConfig } from "../config";
import type { RunnerError } from "../errors";

import type { CommandRepository } from "./command-repository";
import { parseCliJson } from "./connectors";
import { resolveGmailAccount } from "./gmail-connector";

export const classifyProbeFailure = (error: RunnerError, timedOut: boolean): MonitorOutcome => {
  if (timedOut) return "timeout";
  // CLI の生出力は分類にだけ使い、監視履歴や通知本文に保存しない。
  const cause = z.object({ stderr: z.string() }).safeParse(error.cause);
  const text = cause.success ? cause.data.stderr : "";
  if (/invalid_auth|token_revoked|not_authed|invalid_grant|browser session expired|HTTP 401|Error 401/u.test(text)) return "auth_required";
  if (/missing_scope|HTTP 403|Error 403|insufficientPermissions/u.test(text)) return "permission_denied";
  if (error.code === "gmail_account_required") return "not_configured";
  return "unavailable";
};
export const createMonitorProbeRepository = (commands: CommandRepository, configuration: Pick<RunnerConfig, "gmailAccount" | "slackWorkspace" | "chatworkAccount" | "talknoteAccount">) => ({
  async probe(target: MonitorTarget): Promise<MonitorOutcome> {
    const signal = AbortSignal.timeout(20_000);
    let command: string;
    let args: string[];
    let schema: z.ZodType;
    switch (target.service) {
      case "runner": return "healthy";
      case "slack":
        command = "sl";
        args = ["auth", "status", "--output", "json", ...(configuration.slackWorkspace === undefined ? [] : ["--workspace", configuration.slackWorkspace])];
        schema = z.object({ user: z.string().min(1) });
        break;
      case "chatwork":
        command = "cw";
        args = ["me", "--output", "json", ...(configuration.chatworkAccount === undefined ? [] : ["--account", configuration.chatworkAccount])];
        schema = z.object({ account_id: z.number() });
        break;
      case "talknote":
        command = "tn";
        args = ["auth", "status", "--output", "json", ...(configuration.talknoteAccount === undefined ? [] : ["--account", configuration.talknoteAccount])];
        schema = z.object({ user_id: z.string().min(1) });
        break;
      case "orca":
        command = "orca";
        args = ["status", "--json"];
        schema = z.object({ ok: z.literal(true), result: z.object({ runtime: z.object({ reachable: z.literal(true), state: z.literal("ready") }) }) });
        break;
      case "gmail":
      case "calendar": {
        const account = await resolveGmailAccount(commands, configuration.gmailAccount, signal);
        if (!account.ok) return classifyProbeFailure(account.error, signal.aborted);
        command = "gog";
        const flags = ["--account", account.value, "--json", "--no-input", "--gmail-no-send"];
        if (target.service === "gmail") {
          args = ["gmail", "labels", "list", ...flags];
          schema = z.object({ labels: z.array(z.object({ id: z.string() })) });
        } else {
          const now = Date.now();
          args = ["calendar", "freebusy", "primary", "--from", new Date(now).toISOString(), "--to", new Date(now + 60_000).toISOString(), ...flags];
          schema = z.object({ calendars: z.object({ primary: z.object({ busy: z.array(z.unknown()).optional(), errors: z.array(z.unknown()).max(0).optional() }) }) });
        }
        break;
      }
    }
    const result = await commands.execute(command, args, { signal, killSignal: "SIGKILL" });
    if (!result.ok) return classifyProbeFailure(result.error, signal.aborted);
    const parsed = await parseCliJson(result.value.stdout, schema);
    return parsed.ok ? "healthy" : "invalid_response";
  },
});
export type MonitorProbeRepository = ReturnType<typeof createMonitorProbeRepository>;
