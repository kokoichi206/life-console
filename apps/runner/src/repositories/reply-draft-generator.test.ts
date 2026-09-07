import { ok, type Conversation } from "@life-console/contracts";
import { describe, expect, it, vi } from "vitest";

import type { CommandRepository } from "./command-repository";
import type { ReplyCalendarContext } from "./reply-calendar-repository";
import type { ReplyContext } from "./reply-context-repository";
import { createReplyDraftGenerator, validateReplyDecision } from "./reply-draft-generator";

const conversation: Conversation = { id: "c1", connector: "slack", sourceId: "default/C1", externalMessageId: "incoming",
  authorLabel: "依頼者", excerpt: "確認できますか？", occurredAt: "2026-09-06T00:00:00Z", sourceUrl: null, classification: "unprocessed" };
const context: ReplyContext = { ownName: "本人", explicitReplyId: null, messages: [
  { id: "old-reply", author: "本人", isOwn: true, text: "前の質問への回答", at: 1 },
  { id: "incoming", author: "依頼者", isOwn: false, text: "新しい質問", at: 2 },
  { id: "another-person", author: "他の人", isOwn: false, text: "確認しました", at: 3 },
  { id: "own-reply", author: "本人", isOwn: true, text: "新しい質問への回答", at: 4 },
] };
describe("返信済みの根拠", () => {
  it.each(["old-reply", "another-person", "invented", null])("不正な根拠 %s では返信済みとして隠さない", (replyEvidenceId) => {
    expect(validateReplyDecision({ status: "replied", body: "", reason: "回答済み", replyEvidenceId }, "incoming", context).ok).toBe(false);
  });
  it("対象より後の本人の送信履歴だけを根拠として受け付ける", () => {
    expect(validateReplyDecision({ status: "replied", body: "", reason: "回答済み", replyEvidenceId: "own-reply" }, "incoming", context).ok).toBe(true);
  });
  it("自分の発言が後にあっても、内容の照合を省略しない", async () => {
    const decision = { status: "needs_review", body: "", reason: "確認できる日程は未回答です。", replyEvidenceId: null };
    const execute = vi.fn<CommandRepository["execute"]>().mockResolvedValue(ok({ stdout: JSON.stringify({ is_error: false, structured_output: { ...decision, calendarSlotIds: [] } }), stderr: "" }));
    expect(await createReplyDraftGenerator({ execute }).generate(conversation, context, new AbortController().signal)).toEqual(ok(decision));
    const args = execute.mock.calls[0]![1];
    expect(args).toContain("--safe-mode");
    expect(args).toContain("--no-session-persistence");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(JSON.parse(args[args.indexOf("--json-schema") + 1]!) as unknown).toMatchObject({ $schema: "http://json-schema.org/draft-07/schema#" });
    expect(args).not.toContain("新しい質問");
    expect(execute.mock.calls[0]![2]?.stdin).toContain("新しい質問");
  });
  it("明示的な返信先が一致する場合はモデルを呼ばず除外する", async () => {
    const execute = vi.fn<CommandRepository["execute"]>();
    const result = await createReplyDraftGenerator({ execute }).generate(conversation, { ...context, explicitReplyId: "own-reply" }, new AbortController().signal);
    expect(result.ok && result.value.status).toBe("replied");
    expect(execute).not.toHaveBeenCalled();
  });
});

const calendar: ReplyCalendarContext = { account: "owner@example.com", checkedAt: "2026-09-06T00:00:00Z",
  request: { from: "2026-09-07", through: "2026-09-07", dayStart: "09:00", dayEnd: "18:00", durationMinutes: 30 },
  slots: [{ id: "0", start: "2026-09-07T00:00:00Z", end: "2026-09-07T00:30:00Z", label: "2026/9/7(月) 09:00〜09:30（日本時間）" }] };
describe("日程を使う下書き", () => {
  it("モデルが選んだ ID の日時をコードで挿入し、確認範囲を保存する", async () => {
    const execute = vi.fn<CommandRepository["execute"]>().mockResolvedValue(ok({ stdout: JSON.stringify({ is_error: false, structured_output: {
      status: "needs_review", body: "以下の日程はいかがでしょうか。\n{{calendar_slots}}", reason: "参加の判断は未確認です。", replyEvidenceId: null, calendarSlotIds: ["0"],
    } }), stderr: "" }));
    const result = await createReplyDraftGenerator({ execute }).generate(conversation, context, new AbortController().signal, calendar);
    expect(result.ok && result.value.body).toBe("以下の日程はいかがでしょうか。\n・2026/9/7(月) 09:00〜09:30（日本時間）");
    expect(result.ok && result.value.reason).toContain("owner@example.com のメインカレンダー");
    expect(result.ok && result.value.reason).toContain("予約はしていません");
    expect(execute.mock.calls[0]![2]?.stdin).toContain("calendar");
  });
  it.each([
    { calendarSlotIds: ["invented"], body: "{{calendar_slots}}", status: "needs_review" },
    { calendarSlotIds: ["0"], body: "明日は空いています", status: "needs_review" },
    { calendarSlotIds: ["0"], body: "{{calendar_slots}}", status: "ready" },
    { calendarSlotIds: ["0"], body: "{{calendar_slots}}\n{{calendar_slots}}", status: "needs_review" },
  ])("存在しない候補・候補の挿入漏れ・確約としての出力を拒否する", async (proposal) => {
    const execute = vi.fn<CommandRepository["execute"]>().mockResolvedValue(ok({ stdout: JSON.stringify({ is_error: false, structured_output: {
      ...proposal, reason: "確認", replyEvidenceId: null,
    } }), stderr: "" }));
    expect((await createReplyDraftGenerator({ execute }).generate(conversation, context, new AbortController().signal, calendar)).ok).toBe(false);
  });
});
