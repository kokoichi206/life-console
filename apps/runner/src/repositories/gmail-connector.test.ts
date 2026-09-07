import { ok } from "@life-console/core";
import { describe, expect, it, vi } from "vitest";

import type { CommandRepository } from "./command-repository";
import { createGmailConnector, unwrapGmailContent } from "./gmail-connector";

const configuration = { gmailAccount: "test@example.com", gmailSearchQuery: "in:inbox newer_than:7d" };
describe("Gmail 取り込み", () => {
  it("全ページを取得し、同一スレッドは最新受信 1 件にまとめる", async () => {
    const execute = vi.fn<CommandRepository["execute"]>().mockImplementation((_command, args) => {
      let response: unknown;
      if (args[1] === "messages") response = { messages: [{ threadId: "thread1" }], nextPageToken: args.includes("--page") ? null : "next" };
      else response = { thread: { id: "thread1", messages: [
        { id: "1", internalDate: 1000, labelIds: ["INBOX"], headers: { from: "Sender", subject: "質問" }, body: "最初の質問" },
        { id: "2", internalDate: 2000, labelIds: ["SENT"], headers: { from: "Me", subject: "Re: 質問" }, body: "回答" },
        { id: "3", internalDate: 3000, labelIds: ["INBOX"], headers: { from: "Sender", subject: "Re: 質問" }, body: "追加の質問" },
      ] } };
      return Promise.resolve(ok({ stdout: JSON.stringify(response), stderr: "" }));
    });
    const result = await createGmailConnector({ execute }, configuration).fetch(new AbortController().signal);
    expect(result.ok && result.value[0]?.conversations[0]?.externalMessageId).toBe("3");
    expect(execute).toHaveBeenCalledTimes(3);
    for (const call of execute.mock.calls) {
      expect(call[1]).toContain("--gmail-no-send");
      expect(call[1]).toContain("--wrap-untrusted");
      expect(call[1]).toContain("--no-input");
    }
    expect(execute.mock.calls[2]![1]).toContain("--sanitize-content");
  });
  it("gog の外部コンテンツ枠だけを表示用に外す", () => {
    const original = "件名\n本文";
    expect(unwrapGmailContent(`<<<EXTERNAL_UNTRUSTED_CONTENT id="a1">>>\nSource: google_api\n---\n${original}\n<<<END_EXTERNAL_UNTRUSTED_CONTENT id="a1">>>`)).toBe(original);
    expect(unwrapGmailContent(original)).toBe(original);
  });
});
