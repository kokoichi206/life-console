import { err, ok, type Conversation, type Result } from "@life-console/contracts";
import { z } from "zod";

import { runnerError, type RunnerError } from "../errors";

import type { CommandRepository } from "./command-repository";
import { parseCliJson } from "./connectors";
import { readGmailThread, unwrapGmailContent } from "./gmail-connector";
import { talknoteAuthSchema, talknoteMessageSchema, talknoteName } from "./talknote-connector";

export type ReplyContextMessage = {
  readonly id: string;
  readonly author: string;
  readonly isOwn: boolean;
  readonly text: string;
  readonly at: number;
};
export type ReplyContext = {
  readonly ownName: string;
  readonly messages: ReadonlyArray<ReplyContextMessage>;
  readonly explicitReplyId: string | null;
};
export interface ReplyContextRepository {
  read(conversation: Conversation, signal: AbortSignal): Promise<Result<ReplyContext, RunnerError>>;
}
const missingTarget = () => err(runnerError("reply_context_incomplete", "元のメッセージを会話履歴で確認できません。返信済みかどうかは未確認です。"));

export const createReplyContextRepository = (commands: CommandRepository): ReplyContextRepository => ({
  async read(conversation, signal) {
    const [account, source, noteId, postId] = conversation.sourceId.split("/") as [string, string, string?, string?];
    const read = async <T>(command: string, args: string[], schema: z.ZodType<T>) => {
      const result = await commands.execute(command, [...args, "--output", "json",
        ...(account === "default" ? [] : [command === "sl" ? "--workspace" : "--account", account])], { signal });
      return result.ok ? parseCliJson(result.value.stdout, schema) : result;
    };
    if (conversation.connector === "gmail") {
      const thread = await readGmailThread(commands, account, source, signal);
      if (!thread.ok) return thread;
      const messages = thread.value.messages.filter((item) => !item.labelIds.includes("DRAFT")).map((item) => ({
        id: item.id, author: item.headers.from, isOwn: item.labelIds.includes("SENT"),
        text: [
          unwrapGmailContent(item.headers.subject),
          ...(item.headers.to === undefined ? [] : [`To: ${item.headers.to}`]),
          ...(item.headers.cc === undefined ? [] : [`Cc: ${item.headers.cc}`]),
          unwrapGmailContent(item.body),
        ].join("\n"), at: item.internalDate,
      }));
      if (!messages.some((item) => item.id === conversation.externalMessageId)) return missingTarget();
      return ok({ ownName: account, messages, explicitReplyId: null });
    }
    if (conversation.connector === "slack") {
      const auth = await read("sl", ["auth", "status"], z.object({ user_id: z.string(), user: z.string() }));
      if (!auth.ok) return auth;
      let threadTs = conversation.sourceUrl === null ? null : new URL(conversation.sourceUrl).searchParams.get("thread_ts");
      const slackMessageSchema = z.object({ ts: z.string(), user: z.string().optional(), bot_id: z.string().optional(),
        text: z.string(), thread_ts: z.string().optional(), reply_count: z.number().optional() });
      const toMessage = (item: z.infer<typeof slackMessageSchema>): ReplyContextMessage => ({
        id: item.ts, author: item.user ?? `bot:${item.bot_id ?? "unknown"}`,
        isOwn: item.user === auth.value.user_id, text: item.text, at: Number(item.ts) * 1_000,
      });
      const messages: ReplyContextMessage[] = [];
      let cursor = "";
      if (threadTs === null) {
        do {
          const history = await read("sl", ["messages", "read", source, "--limit", "100", ...(cursor === "" ? [] : ["--cursor", cursor])],
            z.object({ messages: z.array(slackMessageSchema), next_cursor: z.string() }));
          if (!history.ok) return history;
          messages.push(...history.value.messages.map(toMessage));
          const target = history.value.messages.find((item) => item.ts === conversation.externalMessageId);
          if (target !== undefined) {
            if (target.thread_ts !== undefined || (target.reply_count !== undefined && target.reply_count > 0)) threadTs = target.thread_ts ?? target.ts;
            break;
          }
          if (history.value.messages.some((item) => Number(item.ts) < Number(conversation.externalMessageId))) break;
          cursor = history.value.next_cursor;
        } while (cursor !== "");
        if (!messages.some((item) => item.id === conversation.externalMessageId)) return missingTarget();
        if (threadTs === null) return ok({ ownName: auth.value.user, messages, explicitReplyId: null });
        messages.length = 0;
        cursor = "";
      }
      do {
        const page = await read("sl", ["messages", "read", source, "--thread", threadTs, "--limit", "100", ...(cursor === "" ? [] : ["--cursor", cursor])], z.object({
          messages: z.array(slackMessageSchema), next_cursor: z.string(),
        }));
        if (!page.ok) return page;
        messages.push(...page.value.messages.map(toMessage));
        cursor = page.value.next_cursor;
      } while (cursor !== "");
      if (!messages.some((item) => item.id === conversation.externalMessageId)) return missingTarget();
      return ok({ ownName: auth.value.user, messages, explicitReplyId: null });
    }
    if (conversation.connector === "chatwork") {
      const auth = await read("cw", ["me"], z.object({ account_id: z.number(), name: z.string() }));
      if (!auth.ok) return auth;
      const synchronized = await read("cw", ["sync", source], z.object({ room_id: z.union([z.number(), z.string()]), gap: z.boolean() }));
      if (!synchronized.ok) return synchronized;
      if (synchronized.value.gap) return err(runnerError("chatwork_history_gap", "Chatwork の履歴に取得漏れがあります。返信済みの判定には確認が必要です。"));
      const history = await read("cw", ["messages", "read", source, "--local"], z.array(z.object({
        message_id: z.string(), body: z.string(), send_time: z.number(), account: z.object({ account_id: z.number(), name: z.string() }),
      })));
      if (!history.ok) return history;
      const messages = history.value.map((item) => ({ id: item.message_id, author: item.account.name,
        isOwn: item.account.account_id === auth.value.account_id, text: item.body, at: item.send_time * 1_000 }));
      const target = messages.find((item) => item.id === conversation.externalMessageId);
      if (target === undefined) return missingTarget();
      const explicit = messages.find((item) => item.isOwn && item.at >= target.at && item.id !== target.id
        && new RegExp(`\\[rp aid=\\d+ to=${source}-${conversation.externalMessageId}\\]`, "u").test(item.text));
      return ok({ ownName: auth.value.name, messages, explicitReplyId: explicit?.id ?? null });
    }
    if (conversation.connector === "talknote") {
      const auth = await read("tn", ["auth", "status"], talknoteAuthSchema);
      if (!auth.ok) return auth;
      let messages: z.infer<typeof talknoteMessageSchema>[];
      if (source === "dm") {
        const history = await read("tn", ["dms", "read", noteId!, "--limit", "100"], z.object({ messages: z.array(talknoteMessageSchema) }));
        if (!history.ok) return history;
        messages = history.value.messages;
      } else {
        const posts = await read("tn", ["notes", "read", noteId!, "--limit", "100"], z.object({ posts: z.array(talknoteMessageSchema.extend({ data: talknoteMessageSchema.shape.data.extend({ commentCount: z.number() }) })) }));
        if (!posts.ok) return posts;
        const post = posts.value.posts.find(({ data }) => data.id === postId);
        if (post === undefined) return missingTarget();
        const history = await read("tn", ["notes", "comments", "list", noteId!, postId!, "--limit", "100"], z.object({ comments: z.array(talknoteMessageSchema) }));
        if (!history.ok) return history;
        if (post.data.commentCount > history.value.comments.length) return missingTarget();
        messages = [post, ...history.value.comments];
      }
      if (!messages.some(({ data }) => data.id === conversation.externalMessageId)) return missingTarget();
      return ok({ ownName: auth.value.user_name, explicitReplyId: null, messages: messages.map(({ data }) => ({
        id: data.id, author: talknoteName(data.postedUser), text: data.content, at: data.createdAt, isOwn: data.postedUser.id === auth.value.user_id,
      })) });
    }
    return err(runnerError("unsupported_connector", "このサービスの返信履歴は未対応です。"));
  },
});
