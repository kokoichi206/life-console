import type { Conversation, ReplyDraft } from "@life-console/contracts";
import { describe, expect, it } from "vitest";

import { matchesWorkStatus, parseWorkSearch } from "./work-search";

const conversation: Conversation = { id: "c1", connector: "slack", sourceId: "default/C1", externalMessageId: "1", authorLabel: "依頼者", excerpt: "確認お願いします", occurredAt: "2026-09-06T00:00:00Z", sourceUrl: null, classification: "unprocessed" };
const draft: ReplyDraft = { ...conversation, conversationId: conversation.id, status: "needs_review", body: "返信案", reason: "要確認", replyEvidenceId: null, checkedAt: conversation.occurredAt, editedAt: null, updatedAt: conversation.occurredAt };
describe("仕事の受信箱", () => {
  it("返信済みは通常表示と下書き表示から除外し、すべてでは確認できる", () => {
    const replied = { ...draft, status: "replied" as const };
    expect(matchesWorkStatus(conversation, replied, "pending")).toBe(false);
    expect(matchesWorkStatus(conversation, replied, "draft")).toBe(false);
    expect(matchesWorkStatus(conversation, replied, "all")).toBe(true);
  });
  it("未生成の連絡と確認待ちの下書きを分ける", () => {
    expect(matchesWorkStatus(conversation, undefined, "pending")).toBe(true);
    expect(matchesWorkStatus(conversation, undefined, "draft")).toBe(false);
    expect(matchesWorkStatus(conversation, draft, "draft")).toBe(true);
    expect(matchesWorkStatus(conversation, { ...draft, body: "" }, "draft")).toBe(false);
    expect(matchesWorkStatus(conversation, draft, "review")).toBe(true);
    expect(matchesWorkStatus({ ...conversation, classification: "no_action" }, undefined, "pending")).toBe(false);
  });
  it("URL に選択とフィルターを保持し、旧タスク追加リンクもタスクを開く", () => {
    expect(parseWorkSearch({ service: "gmail", status: "draft", conversationId: "c1", period: "3d" })).toEqual({ service: "gmail", status: "draft", conversationId: "c1", period: "3d" });
    expect(parseWorkSearch({ create: true })).toEqual({ create: true, view: "tasks" });
    expect(parseWorkSearch({ create: true, view: "inbox" })).toEqual({ view: "inbox" });
    expect(parseWorkSearch({ status: "invalid", service: "invalid" })).toEqual({});
  });
  it("URL の再検証でもタスク追加の状態を保持する", () => {
    const search = parseWorkSearch({ create: true });
    expect(parseWorkSearch(search)).toEqual(search);
  });
  it("文字列へ変換すると候補に一致する配列も、フィルターには受け入れない", () => {
    expect(parseWorkSearch({ service: ["gmail"], period: ["7d"], status: ["draft"] })).toEqual({});
  });
});
