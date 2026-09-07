import { ok } from "@life-console/core";
import { describe, expect, it, vi } from "vitest";

import type { RunnerConfig } from "../config";

import type { CommandRepository } from "./command-repository";
import { createChatworkConnector, createConversationReplyRepository, createSlackConnector } from "./connectors";

const configuration: RunnerConfig = {
  apiUrl: "http://localhost:8787",
  backupDirectory: undefined,
  cfAccessClientId: undefined,
  cfAccessClientSecret: undefined,
  chatworkAccount: "work",
  chatworkRoomIds: ["10"],
  gmailAccount: undefined,
  gmailSearchQuery: "in:inbox category:primary newer_than:7d",
  talknoteAccount: undefined,
  d1DatabaseName: undefined,
  financeCsvPath: undefined,
  heartbeatMilliseconds: 60_000,
  pollMilliseconds: 60_000,
  promotionSkillPath: "/tmp/promotion/SKILL.md",
  r2AccountId: undefined,
  r2BucketName: undefined,
  runnerId: "runner-test",
  runnerName: "Test Runner",
  runnerToken: "runner-token",
  slackSearchQuery: "to:me",
  slackWorkspace: undefined,
  weightCsvPath: undefined,
  wranglerBin: undefined,
};

describe("createSlackConnector", () => {
  it("現在の Slack ユーザーへの mention をチャンネル別に取り込む", async () => {
    const execute = vi.fn<CommandRepository["execute"]>().mockImplementation((_command, arguments_) => {
      if (arguments_[0] === "auth") {
        return Promise.resolve(ok({ stdout: JSON.stringify({ user: "test.owner" }), stderr: "" }));
      }
      return Promise.resolve(ok({
        stdout: JSON.stringify({
          matches: [{
            channel: { id: "C123", name: "project" },
            permalink: "https://example.slack.com/archives/C123/p123456",
            text: "@test.owner 確認をお願いします",
            ts: "123.456",
            username: "requester",
            user: "U123",
            type: "message",
          }],
          paging: { count: 100, page: 1, pages: 1, total: 1 },
          total: 1,
        }),
        stderr: "",
      }));
    });
    const connector = createSlackConnector(
      { execute },
      { ...configuration, slackSearchQuery: undefined },
      () => new Date("2026-09-02T14:00:00.000Z"),
    );

    const result = await connector.fetch(new AbortController().signal);

    expect(result).toEqual({
      ok: true,
      value: [{
        connector: "slack",
        sourceId: "default/C123",
        sourceLabel: "#project",
        watermark: "123.456",
        conversations: [expect.objectContaining({ externalMessageId: "123.456" })],
      }],
    });
    expect(execute).toHaveBeenNthCalledWith(1, "sl", ["auth", "status", "--output", "json"], { signal: expect.any(AbortSignal) });
    expect(execute).toHaveBeenNthCalledWith(2, "sl", ["search", "@test.owner after:2026-08-26", "--count", "100", "--page", "1", "--output", "json"], { signal: expect.any(AbortSignal) });
  });
});

describe("createChatworkConnector", () => {
  it("ルーム指定時は他のルームの open task を取り込まない", async () => {
    const execute = vi.fn<CommandRepository["execute"]>().mockImplementation((_command, args) => {
      const operation = args.slice(0, 2).join(" ");
      if (operation === "me --output") return Promise.resolve(ok({ stdout: JSON.stringify({ account_id: 42 }), stderr: "" }));
      if (operation === "rooms list") return Promise.resolve(ok({ stdout: JSON.stringify([{ room_id: 10, name: "対象" }, { room_id: 99, name: "対象外" }]), stderr: "" }));
      if (operation === "tasks list") return Promise.resolve(ok({ stdout: JSON.stringify([
        { assigned_by_account: { name: "依頼者" }, body: "対象外の依頼", limit_time: 1_788_192_000, message_id: "100", room: { room_id: 99 } },
      ]), stderr: "" }));
      return Promise.resolve(ok({ stdout: "[]", stderr: "" }));
    });
    const result = await createChatworkConnector({ execute }, configuration).fetch(new AbortController().signal);
    expect(result.ok && result.value.map((batch) => batch.sourceId)).toEqual(["work/10"]);
  });

  it("room 未指定時は参加 room から自分への mention と open task だけを取り込む", async () => {
    const execute = vi.fn<CommandRepository["execute"]>().mockImplementation((_command, arguments_) => {
      const operation = arguments_.slice(0, 2).join(" ");
      if (operation === "me --output") return Promise.resolve(ok({ stdout: JSON.stringify({ account_id: 42 }), stderr: "" }));
      if (operation === "tasks list") {
        return Promise.resolve(ok({
          stdout: JSON.stringify([{
            assigned_by_account: { name: "依頼者" },
            body: "レビューする",
            limit_time: 1_788_192_000,
            message_id: "100",
            room: { room_id: 10 },
          }]),
          stderr: "",
        }));
      }
      if (operation === "rooms list") {
        return Promise.resolve(ok({
          stdout: JSON.stringify([{ room_id: 10, name: "プロジェクト" }]),
          stderr: "",
        }));
      }
      return Promise.resolve(ok({
        stdout: JSON.stringify([
          { message_id: "101", account: { name: "メンバー" }, body: "[To:42] 確認お願いします", send_time: 1_788_105_600 },
          { message_id: "102", account: { name: "メンバー" }, body: "共有だけです", send_time: 1_788_105_700 },
        ]),
        stderr: "",
      }));
    });
    const connector = createChatworkConnector({ execute }, { ...configuration, chatworkRoomIds: [] });

    const result = await connector.fetch(new AbortController().signal);

    expect(result).toEqual({
      ok: true,
      value: [{
        connector: "chatwork",
        sourceId: "work/10",
        sourceLabel: "プロジェクト",
        watermark: "101",
        conversations: [
          expect.objectContaining({ externalMessageId: "100", classification: "task_candidate" }),
          expect.objectContaining({ externalMessageId: "101", classification: "unprocessed" }),
        ],
      }],
    });
    expect(execute).toHaveBeenCalledWith("cw", ["sync", "10", "--output", "json", "--account", "work"], { signal: expect.any(AbortSignal) });
  });
});

describe("createConversationReplyRepository", () => {
  it.each([
    {
      input: { body: "確認します", connector: "slack" as const, externalMessageId: "123.456", sourceId: "work/C123" },
      expectedCommand: "sl",
      expectedArguments: ["messages", "reply", "C123", "123.456", "確認します", "--output", "json", "--workspace", "work"],
    },
    {
      input: { body: "確認します", connector: "chatwork" as const, externalMessageId: "123", sourceId: "work/456" },
      expectedCommand: "cw",
      expectedArguments: ["messages", "reply", "456", "123", "確認します", "--output", "json", "--account", "work"],
    },
  ])("$input.connector の元会話へ返信する", async ({ input, expectedCommand, expectedArguments }) => {
    const execute = vi.fn<CommandRepository["execute"]>().mockResolvedValue(ok({ stdout: "{}", stderr: "" }));
    const replies = createConversationReplyRepository({ execute });
    const signal = new AbortController().signal;

    const result = await replies.send(input, signal);

    expect(result).toEqual(ok(undefined));
    expect(execute).toHaveBeenCalledWith(expectedCommand, expectedArguments, { signal });
  });
});
