import { err, ok } from "@life-console/contracts";
import { describe, expect, it, vi } from "vitest";

import { runnerError } from "../errors";

import type { CommandRepository } from "./command-repository";
import { createTalknoteConnector } from "./talknote-connector";

const configuration = { talknoteAccount: "work" };
describe("Talknote 取り込み", () => {
  it("認証失敗を 0 件の成功にしない", async () => {
    const execute = vi.fn<CommandRepository["execute"]>().mockResolvedValue(err(runnerError("command_failed", "認証に失敗しました")));
    const result = await createTalknoteConnector({ execute }, configuration).fetch(new AbortController().signal);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("talknote_auth_required");
  });
  it("DM の本人の送信を取り込まず、相手の連絡を取り込む", async () => {
    const now = Date.now();
    const execute = vi.fn<CommandRepository["execute"]>().mockImplementation((_command, args) => {
      let response: unknown;
      if (args[0] === "auth") response = { user_id: "me", user_name: "本人" };
      else if (args[0] === "notes") response = { notes: [] };
      else if (args[1] === "list") response = { threads: [{ data: { id: "dm1", lastPostedAt: now }, session: { displayTitle: "打ち合わせ" } }] };
      else response = { messages: [
        { data: { id: "1", content: "お願いできますか", createdAt: now, postedUser: { id: "other", firstName: "太郎", lastName: "相手" } } },
        { data: { id: "2", content: "回答", createdAt: now, postedUser: { id: "me", firstName: "太郎", lastName: "本人" } } },
      ] };
      return Promise.resolve(ok({ stdout: JSON.stringify(response), stderr: "" }));
    });
    const result = await createTalknoteConnector({ execute }, configuration).fetch(new AbortController().signal);
    expect(result.ok && result.value[0]?.conversations.map((message) => message.externalMessageId)).toEqual(["1"]);
    expect(result.ok && result.value[0]?.sourceId).toBe("work/dm/dm1");
  });
});
