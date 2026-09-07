import { err, ok, safeTry, type Result } from "@life-console/contracts";
import { z } from "zod";

import type { RunnerConfig } from "../config";
import { runnerError, type RunnerError } from "../errors";

import type { CommandRepository } from "./command-repository";

export type ImportedConversation = {
  readonly externalMessageId: string;
  readonly authorLabel: string;
  readonly excerpt: string;
  readonly sourceUrl: string | null;
  readonly occurredAt: string;
  readonly classification: "unprocessed" | "task_candidate";
};

export type ConnectorBatch = {
  readonly connector: "slack" | "chatwork" | "gmail" | "talknote";
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly watermark: string;
  readonly conversations: ReadonlyArray<ImportedConversation>;
};

export interface Connector {
  fetch(signal: AbortSignal): Promise<Result<ReadonlyArray<ConnectorBatch>, RunnerError>>;
}

const slackSearchSchema = z.object({
  paging: z.object({ pages: z.number().int() }),
  matches: z.array(z.object({
    channel: z.object({
      id: z.string(),
      name: z.string(),
    }),
    permalink: z.url(),
    text: z.string(),
    ts: z.string(),
    username: z.string(),
  })),
});

const slackAuthStatusSchema = z.object({
  user: z.string().min(1),
});

const chatworkMessagesSchema = z.array(z.object({
  message_id: z.string(),
  account: z.object({ name: z.string() }),
  body: z.string(),
  send_time: z.number().int(),
}));

const chatworkMeSchema = z.object({
  account_id: z.number().int(),
});

const chatworkTasksSchema = z.array(z.object({
  assigned_by_account: z.object({ name: z.string() }),
  body: z.string(),
  limit_time: z.number().int(),
  message_id: z.string(),
  room: z.object({ room_id: z.number().int() }),
}));

const chatworkRoomsSchema = z.array(z.object({
  name: z.string(),
  room_id: z.number().int(),
}));

export const parseCliJson = async <T>(text: string, schema: z.ZodType<T>): Promise<Result<T, RunnerError>> => {
  const parsedJson = await safeTry(() => JSON.parse(text) as unknown);
  if (!parsedJson.ok) return err(runnerError("invalid_cli_json", "CLI の JSON を解析できません。", parsedJson.error));
  const parsed = schema.safeParse(parsedJson.value);
  if (!parsed.success) return err(runnerError("invalid_cli_response", "CLI の応答形式が不正です。", parsed.error));
  return ok(parsed.data);
};

const parseJson = parseCliJson;

export const createSlackConnector = (
  commands: CommandRepository,
  configuration: RunnerConfig,
  currentDate: () => Date = () => new Date(),
): Connector => ({
  async fetch(signal) {
    let query = configuration.slackSearchQuery;
    if (query === undefined) {
      const authArguments = ["auth", "status", "--output", "json"];
      if (configuration.slackWorkspace !== undefined) authArguments.push("--workspace", configuration.slackWorkspace);
      const authStatus = await commands.execute("sl", authArguments, { signal });
      if (!authStatus.ok) return authStatus;
      const parsedAuthStatus = await parseJson(authStatus.value.stdout, slackAuthStatusSchema);
      if (!parsedAuthStatus.ok) return parsedAuthStatus;
      const previousDate = new Date(currentDate().getTime() - 7 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
      query = `@${parsedAuthStatus.value.user} after:${previousDate}`;
    }
    const matches: z.infer<typeof slackSearchSchema>["matches"] = [];
    let page = 1;
    let pages: number;
    do {
      const arguments_ = ["search", query, "--count", "100", "--page", String(page), "--output", "json"];
      if (configuration.slackWorkspace !== undefined) arguments_.push("--workspace", configuration.slackWorkspace);
      const executed = await commands.execute("sl", arguments_, { signal });
      if (!executed.ok) return executed;
      const parsed = await parseJson(executed.value.stdout, slackSearchSchema);
      if (!parsed.ok) return parsed;
      matches.push(...parsed.value.matches);
      pages = parsed.value.paging.pages;
      page += 1;
    } while (page <= pages);
    const matchesWithBody = matches.filter((match) => match.text.trim().length > 0);
    const grouped = matchesWithBody.reduce((groups, match) => {
      const existing = groups.get(match.channel.id);
      if (existing === undefined) {
        groups.set(match.channel.id, [match]);
      } else {
        existing.push(match);
      }
      return groups;
    }, new Map<string, Array<z.infer<typeof slackSearchSchema>["matches"][number]>>());
    return ok(Array.from(grouped.entries()).map(([channelId, matches]) => {
      const sorted = matches.toSorted((left, right) => left.ts.localeCompare(right.ts));
      const last = sorted.at(-1) as z.infer<typeof slackSearchSchema>["matches"][number];
      return {
        connector: "slack" as const,
        sourceId: `${configuration.slackWorkspace ?? "default"}/${channelId}`,
        sourceLabel: `#${last.channel.name}`,
        watermark: last.ts,
        conversations: sorted.map((match) => ({
          externalMessageId: match.ts,
          authorLabel: match.username,
          excerpt: match.text.trim().slice(0, 2_000),
          sourceUrl: match.permalink,
          occurredAt: new Date(Number(match.ts) * 1_000).toISOString(),
          classification: "unprocessed" as const,
        })),
      };
    }));
  },
});

export const createChatworkConnector = (
  commands: CommandRepository,
  configuration: RunnerConfig,
): Connector => ({
  async fetch(signal) {
    const accountArguments = configuration.chatworkAccount === undefined ? [] : ["--account", configuration.chatworkAccount];
    const ownAccount = await commands.execute("cw", ["me", "--output", "json", ...accountArguments], { signal });
    if (!ownAccount.ok) return ownAccount;
    const parsedAccount = await parseJson(ownAccount.value.stdout, chatworkMeSchema);
    if (!parsedAccount.ok) return parsedAccount;
    const listedRooms = await commands.execute("cw", ["rooms", "list", "--output", "json", ...accountArguments], { signal });
    if (!listedRooms.ok) return listedRooms;
    const parsedRooms = await parseJson(listedRooms.value.stdout, chatworkRoomsSchema);
    if (!parsedRooms.ok) return parsedRooms;
    const roomNames = new Map(parsedRooms.value.map((room) => [String(room.room_id), room.name]));
    const listedTasks = await commands.execute("cw", ["tasks", "list", "--status", "open", "--output", "json", ...accountArguments], { signal });
    if (!listedTasks.ok) return listedTasks;
    const parsedTasks = await parseJson(listedTasks.value.stdout, chatworkTasksSchema);
    if (!parsedTasks.ok) return parsedTasks;
    const targetRoomIds = configuration.chatworkRoomIds.length === 0
      ? parsedRooms.value.map((room) => String(room.room_id))
      : configuration.chatworkRoomIds;
    const conversationsByRoom = parsedTasks.value.reduce((rooms, task) => {
      const roomId = String(task.room.room_id);
      if (!targetRoomIds.includes(roomId)) return rooms;
      const conversations = rooms.get(roomId) ?? new Map<string, ImportedConversation>();
      conversations.set(task.message_id, {
        externalMessageId: task.message_id,
        authorLabel: task.assigned_by_account.name,
        excerpt: task.body,
        sourceUrl: null,
        occurredAt: new Date(task.limit_time * 1_000).toISOString(),
        classification: "task_candidate",
      });
      rooms.set(roomId, conversations);
      return rooms;
    }, new Map<string, Map<string, ImportedConversation>>());
    for (const roomId of targetRoomIds) {
      const arguments_ = ["sync", roomId, "--output", "json", ...accountArguments];
      const executed = await commands.execute("cw", arguments_, { signal });
      if (!executed.ok) return executed;
      // sync の差分だけでは、別の CLI 利用時に取得済みのメンションが欠落する。
      const history = await commands.execute("cw", ["messages", "read", roomId, "--local", "--since",
        new Date(Date.now() - 7 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }),
        "--output", "json", ...accountArguments], { signal });
      if (!history.ok) return history;
      const parsed = await parseJson(history.value.stdout, chatworkMessagesSchema);
      if (!parsed.ok) return parsed;
      const roomConversations = conversationsByRoom.get(roomId) ?? new Map<string, ImportedConversation>();
      const mention = `[To:${String(parsedAccount.value.account_id)}]`;
      const reply = `[rp aid=${String(parsedAccount.value.account_id)} `;
      for (const message of parsed.value.filter((item) => item.body.includes(mention) || item.body.includes(reply) || roomConversations.has(item.message_id))) {
        const classification = roomConversations.get(message.message_id)?.classification ?? "unprocessed";
        roomConversations.set(message.message_id, {
          externalMessageId: message.message_id,
          authorLabel: message.account.name,
          excerpt: message.body.trim().slice(0, 2_000),
          sourceUrl: `https://www.chatwork.com/#!rid${roomId}-${message.message_id}`,
          occurredAt: new Date(message.send_time * 1_000).toISOString(),
          classification,
        });
      }
      conversationsByRoom.set(roomId, roomConversations);
    }
    return ok(Array.from(conversationsByRoom.entries()).map(([roomId, conversations]) => {
      const sorted = Array.from(conversations.values()).toSorted((left, right) => Number(left.externalMessageId) - Number(right.externalMessageId));
      return {
        connector: "chatwork",
        sourceId: `${configuration.chatworkAccount ?? "default"}/${roomId}`,
        sourceLabel: roomNames.get(roomId) ?? `Chatwork ${roomId}`,
        watermark: sorted.at(-1)?.externalMessageId ?? "empty",
        conversations: sorted,
      };
    }));
  },
});

export type ConversationReply = {
  readonly body: string;
  readonly connector: "slack" | "chatwork";
  readonly externalMessageId: string;
  readonly sourceId: string;
};

export interface ConversationReplyRepository {
  send(input: ConversationReply, signal: AbortSignal): Promise<Result<void, RunnerError>>;
}

const splitSourceId = (sourceId: string): readonly [string, string] => {
  const separatorIndex = sourceId.indexOf("/");
  return [sourceId.slice(0, separatorIndex), sourceId.slice(separatorIndex + 1)];
};

export const createConversationReplyRepository = (commands: CommandRepository): ConversationReplyRepository => ({
  async send(input, signal) {
    const [account, source] = splitSourceId(input.sourceId);
    const accountArguments = account === "default"
      ? []
      : [input.connector === "slack" ? "--workspace" : "--account", account];
    const command = input.connector === "slack" ? "sl" : "cw";
    const executed = await commands.execute(command, [
      "messages",
      "reply",
      source,
      input.externalMessageId,
      input.body,
      "--output",
      "json",
      ...accountArguments,
    ], { signal });
    if (!executed.ok) return executed;
    return ok(undefined);
  },
});

export type TalknoteConnector = Connector;
