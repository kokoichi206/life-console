import { err, ok, type Result } from "@life-console/core";
import type { RunnerConfig } from "@runner/config";
import { z } from "zod";

import { runnerError, type RunnerError } from "../errors";

import type { CommandRepository } from "./command-repository";
import { parseCliJson, type Connector, type ConnectorBatch } from "./connectors";

export const gmailReadFlags = ["--json", "--no-input", "--gmail-no-send", "--wrap-untrusted"];
export const unwrapGmailContent = (text: string): string => text.replace(
  /^<<<EXTERNAL_UNTRUSTED_CONTENT id="([^"]+)">>>\nSource: google_api\n---\n([\s\S]*)\n<<<END_EXTERNAL_UNTRUSTED_CONTENT id="\1">>>$/u, "$2",
);
const threadSchema = z.object({ thread: z.object({ id: z.string(), messages: z.array(z.object({
  id: z.string(), internalDate: z.number(), labelIds: z.array(z.string()), body: z.string(),
  headers: z.object({ from: z.string(), subject: z.string(), to: z.string().optional(), cc: z.string().optional() }),
})) }) });
export type GmailThread = z.infer<typeof threadSchema>["thread"];

export const readGmailThread = async (commands: CommandRepository, account: string, threadId: string, signal: AbortSignal): Promise<Result<GmailThread, RunnerError>> => {
  const result = await commands.execute("gog", ["gmail", "thread", "get", threadId, "--account", account,
    "--full", "--sanitize-content", ...gmailReadFlags], { signal });
  if (!result.ok) return result;
  const parsed = await parseCliJson(result.value.stdout, threadSchema);
  return parsed.ok ? ok(parsed.value.thread) : parsed;
};

export const resolveGmailAccount = async (commands: CommandRepository, configuredAccount: string | undefined, signal: AbortSignal): Promise<Result<string, RunnerError>> => {
  if (configuredAccount !== undefined) return ok(configuredAccount);
  const listed = await commands.execute("gog", ["auth", "list", ...gmailReadFlags], { signal });
  if (!listed.ok) return listed;
  const parsed = await parseCliJson(listed.value.stdout, z.object({ accounts: z.array(z.object({ email: z.email(), services: z.array(z.string()) })) }));
  if (!parsed.ok) return parsed;
  const accounts = parsed.value.accounts.filter((item) => item.services.includes("gmail"));
  if (accounts.length !== 1) return err(runnerError("gmail_account_required", "GMAIL_ACCOUNT で取り込むアカウントを指定してください。"));
  return ok(accounts[0]!.email);
};

export const createGmailConnector = (commands: CommandRepository, configuration: Pick<RunnerConfig, "gmailAccount" | "gmailSearchQuery">): Connector => ({
  async fetch(signal) {
    const resolvedAccount = await resolveGmailAccount(commands, configuration.gmailAccount, signal);
    if (!resolvedAccount.ok) return resolvedAccount;
    const account = resolvedAccount.value;
    const threadIds = new Set<string>();
    let page: string | null = null;
    do {
      const searched = await commands.execute("gog", ["gmail", "messages", "search", configuration.gmailSearchQuery,
        "--account", account, "--max", "100", ...gmailReadFlags, ...(page === null ? [] : ["--page", page])], { signal });
      if (!searched.ok) return searched;
      const parsed = await parseCliJson(searched.value.stdout, z.object({
        messages: z.array(z.object({ threadId: z.string() })).nullable(), nextPageToken: z.string().nullable(),
      }));
      if (!parsed.ok) return parsed;
      for (const message of parsed.value.messages ?? []) threadIds.add(message.threadId);
      page = parsed.value.nextPageToken === "" ? null : parsed.value.nextPageToken;
    } while (page !== null);
    const batches: ConnectorBatch[] = [];
    for (const threadId of threadIds) {
      const thread = await readGmailThread(commands, account, threadId, signal);
      if (!thread.ok) return thread;
      const received = thread.value.messages.filter((message) => !message.labelIds.includes("SENT") && !message.labelIds.includes("DRAFT"));
      const latest = received.toSorted((a, b) => b.internalDate - a.internalDate)[0];
      if (latest === undefined) continue;
      const subject = unwrapGmailContent(latest.headers.subject);
      batches.push({ connector: "gmail", sourceId: `${account}/${threadId}`, sourceLabel: subject.slice(0, 240), watermark: latest.id,
        conversations: [{ externalMessageId: latest.id, authorLabel: latest.headers.from.slice(0, 120),
          excerpt: `${subject}\n\n${unwrapGmailContent(latest.body)}`.trim().slice(0, 2_000),
          occurredAt: new Date(latest.internalDate).toISOString(), classification: "unprocessed",
          sourceUrl: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account)}#all/${threadId}` }],
      });
    }
    return ok(batches);
  },
});
