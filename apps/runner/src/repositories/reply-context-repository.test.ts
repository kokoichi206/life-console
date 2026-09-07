import { ok, type Conversation } from "@life-console/contracts";
import { describe, expect, it, vi } from "vitest";

import type { CommandRepository } from "./command-repository";
import { createReplyContextRepository } from "./reply-context-repository";

const target: Conversation = { id: "c1", connector: "chatwork", sourceId: "work/10", externalMessageId: "100",
  authorLabel: "依頼者", excerpt: "確認できますか", sourceUrl: null, classification: "unprocessed", occurredAt: "2026-09-05T00:00:00Z" };
const cliResult = (value: unknown) => Promise.resolve(ok({ stdout: JSON.stringify(value), stderr: "" }));
describe("返信履歴の取得", () => {
  it.each([
    { body: "別の件について回答します", expected: null },
    { body: "[rp aid=20 to=10-100] 回答です", expected: "101" },
    { body: "[rp aid=20 to=10-999] 別の連絡への回答", expected: null },
  ])("Chatwork で返信先を照合する: $body", async ({ body, expected }) => {
    const execute = vi.fn<CommandRepository["execute"]>().mockImplementation((_command, args) => {
      if (args[0] === "me") return cliResult({ account_id: 42, name: "本人" });
      if (args[0] === "sync") return cliResult({ room_id: 10, gap: false });
      return cliResult([
        { message_id: "100", body: "確認お願いします", send_time: 100, account: { account_id: 20, name: "依頼者" } },
        { message_id: "101", body, send_time: 101, account: { account_id: 42, name: "本人" } },
      ]);
    });
    const result = await createReplyContextRepository({ execute }).read(target, new AbortController().signal);
    expect(result.ok && result.value.explicitReplyId).toBe(expected);
  });
  it("Slack の通常投稿は history から対象を特定して返信を読む", async () => {
    const execute = vi.fn<CommandRepository["execute"]>().mockImplementation((_command, args) => {
      if (args[0] === "auth") return cliResult({ user: "本人", user_id: "U1" });
      if (!args.includes("--thread")) return cliResult({ messages: [{ ts: "100", user: "U2", text: "質問", reply_count: 1 }], next_cursor: "" });
      return cliResult({ messages: [{ ts: "100", user: "U2", text: "質問" }, { ts: "101", user: "U1", text: "回答" }], next_cursor: "" });
    });
    const result = await createReplyContextRepository({ execute }).read({ ...target, connector: "slack", sourceId: "default/C1" }, new AbortController().signal);
    expect(result.ok && result.value.messages.map((message) => message.isOwn)).toEqual([false, true]);
    expect(execute.mock.calls[2]![1]).toContain("--thread");
  });
  it("取得できない元メッセージは未返信と断定しない", async () => {
    const execute = vi.fn<CommandRepository["execute"]>().mockImplementation((_command, args) => {
      if (args[0] === "me") return cliResult({ account_id: 42, name: "本人" });
      if (args[0] === "sync") return cliResult({ room_id: 10, gap: false });
      return cliResult([]);
    });
    const result = await createReplyContextRepository({ execute }).read(target, new AbortController().signal);
    expect(result.ok).toBe(false);
  });
});
