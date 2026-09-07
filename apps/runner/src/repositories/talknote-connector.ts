import { err, ok } from "@life-console/contracts";
import type { RunnerConfig } from "@runner/config";
import { z } from "zod";

import { runnerError } from "../errors";

import type { CommandRepository } from "./command-repository";
import { parseCliJson, type Connector, type ConnectorBatch } from "./connectors";

export const talknoteMessageSchema = z.object({ data: z.object({
  id: z.string(), content: z.string(), createdAt: z.number(),
  postedUser: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }),
}) });
export const talknoteName = (user: z.infer<typeof talknoteMessageSchema>["data"]["postedUser"]): string => `${user.lastName} ${user.firstName}`.trim();
export const talknoteAuthSchema = z.object({ user_id: z.string(), user_name: z.string() });
export const talknoteAuthError = () => runnerError("talknote_auth_required", "Talknote を読み取れません。tn auth status を確認し、セッション切れの場合は tn auth guide の手順で再ログインしてください。");

export const createTalknoteConnector = (commands: CommandRepository, configuration: Pick<RunnerConfig, "talknoteAccount">): Connector => ({
  async fetch(signal) {
    const accountFlags = configuration.talknoteAccount === undefined ? [] : ["--account", configuration.talknoteAccount];
    const read = async <T>(args: string[], schema: z.ZodType<T>) => {
      const result = await commands.execute("tn", [...args, "--output", "json", ...accountFlags], { signal });
      return result.ok ? parseCliJson(result.value.stdout, schema) : result;
    };
    const auth = await read(["auth", "status"], talknoteAuthSchema);
    if (!auth.ok) return err(talknoteAuthError());
    const threads = await read(["dms", "list"], z.object({ threads: z.array(z.object({
      data: z.object({ id: z.string(), lastPostedAt: z.number() }), session: z.object({ displayTitle: z.string() }),
    })) }));
    if (!threads.ok) return threads;
    const since = Date.now() - 7 * 86_400_000;
    const batches: ConnectorBatch[] = [];
    const addBatch = (source: string, label: string, messages: z.infer<typeof talknoteMessageSchema>[]) => {
      const incoming = messages.filter(({ data }) => data.postedUser.id !== auth.value.user_id && data.createdAt >= since && data.content.trim().length > 0);
      batches.push({ connector: "talknote", sourceId: `${configuration.talknoteAccount ?? "default"}/${source}`,
        sourceLabel: label.slice(0, 240), watermark: String(Date.now()), conversations: incoming.map(({ data }) => ({
          externalMessageId: data.id, authorLabel: talknoteName(data.postedUser).slice(0, 120), excerpt: data.content.trim().slice(0, 2_000),
          occurredAt: new Date(data.createdAt).toISOString(), classification: "unprocessed", sourceUrl: null,
        })) });
    };
    for (const thread of threads.value.threads.filter((item) => item.data.lastPostedAt >= since)) {
      const messages = await read(["dms", "read", thread.data.id, "--limit", "100"], z.object({ messages: z.array(talknoteMessageSchema) }));
      if (!messages.ok) return messages;
      if (messages.value.messages.length === 100 && messages.value.messages.every(({ data }) => data.createdAt >= since)) {
        return err(runnerError("talknote_history_truncated", "Talknote DM が取得上限の 100 件に達しました。CLI のページ取得への対応が必要です。"));
      }
      addBatch(`dm/${thread.data.id}`, thread.session.displayTitle, messages.value.messages);
    }
    const notes = await read(["notes", "list"], z.object({ notes: z.array(z.object({
      data: z.object({ id: z.string(), name: z.string() }), order: z.object({ youBelong: z.boolean() }),
    })) }));
    if (!notes.ok) return notes;
    for (const note of notes.value.notes.filter((item) => item.order.youBelong)) {
      const posts = await read(["notes", "read", note.data.id, "--limit", "100"], z.object({ posts: z.array(talknoteMessageSchema.extend({ data: talknoteMessageSchema.shape.data.extend({ commentCount: z.number(), updatedAt: z.number() }) })) }));
      if (!posts.ok) return posts;
      if (posts.value.posts.length === 100 && posts.value.posts.every(({ data }) => data.createdAt >= since)) {
        return err(runnerError("talknote_history_truncated", "Talknote の投稿が取得上限の 100 件に達しました。CLI のページ取得への対応が必要です。"));
      }
      for (const post of posts.value.posts.filter(({ data }) => data.updatedAt >= since || data.createdAt >= since)) {
        const comments = await read(["notes", "comments", "list", note.data.id, post.data.id, "--limit", "100"], z.object({ comments: z.array(talknoteMessageSchema) }));
        if (!comments.ok) return comments;
        if (post.data.commentCount > comments.value.comments.length) return err(runnerError("talknote_history_truncated", "Talknote のコメント履歴を全件取得できませんでした。"));
        addBatch(`note/${note.data.id}/${post.data.id}`, note.data.name, [post, ...comments.value.comments]);
      }
    }
    return ok(batches);
  },
});
