import { replyCalendarRequestSchema, type ReplyCalendarRequest } from "@life-console/contracts";
import { err, ok } from "@life-console/core";
import { describe, expect, it, vi } from "vitest";

import { runnerError } from "../errors";

import type { CommandRepository } from "./command-repository";
import { availableReplySlots, createReplyCalendarRepository } from "./reply-calendar-repository";

const request: ReplyCalendarRequest = { from: "2026-09-07", through: "2026-09-07", dayStart: "09:00", dayEnd: "12:00", durationMinutes: 30 };
describe("返信用の空き時間", () => {
  it("重複する予定を除外し、終了直後の候補は残す", () => {
    const slots = availableReplySlots(request, [{ start: "2026-09-07T10:00:00+09:00", end: "2026-09-07T10:45:00+09:00" },
      { start: "2026-09-07T10:30:00+09:00", end: "2026-09-07T11:00:00+09:00" }], new Date("2026-09-06T00:00:00Z"));
    expect(slots.map((slot) => slot.start)).toEqual(["2026-09-07T00:00:00.000Z", "2026-09-07T00:30:00.000Z", "2026-09-07T02:00:00.000Z", "2026-09-07T02:30:00.000Z"]);
    expect(slots[0]!.label).toBe("2026/9/7(月) 09:00〜09:30（日本時間）");
  });
  it("過去・土日・終日予定・時間帯からはみ出す候補を除外する", () => {
    expect(availableReplySlots(request, [], new Date("2026-09-07T03:00:00Z"))).toEqual([]);
    expect(availableReplySlots({ ...request, from: "2026-09-12", through: "2026-09-13" }, [], new Date("2026-09-06T00:00:00Z"))).toEqual([]);
    expect(availableReplySlots(request, [{ start: "2026-09-06T15:00:00Z", end: "2026-09-07T15:00:00Z" }], new Date("2026-09-06T00:00:00Z"))).toEqual([]);
    expect(availableReplySlots({ ...request, durationMinutes: 60 }, [], new Date("2026-09-06T00:00:00Z")).at(-1)!.end).toBe("2026-09-07T03:00:00.000Z");
  });
  it("入力境界で逆転した期間・時間帯・長すぎる期間を拒否する", () => {
    expect(replyCalendarRequestSchema.safeParse(request).success).toBe(true);
    expect(replyCalendarRequestSchema.safeParse({ ...request, through: "2026-09-06" }).success).toBe(false);
    expect(replyCalendarRequestSchema.safeParse({ ...request, through: "2026-10-08" }).success).toBe(false);
    expect(replyCalendarRequestSchema.safeParse({ ...request, dayEnd: "08:00" }).success).toBe(false);
  });
  it("指定アカウントの freebusy だけを読み、終了日全体を含める", async () => {
    const execute = vi.fn<CommandRepository["execute"]>().mockResolvedValue(ok({ stdout: JSON.stringify({ calendars: { primary: { busy: [] } } }), stderr: "" }));
    const result = await createReplyCalendarRepository({ execute }, "owner@example.com").read(request, new AbortController().signal);
    expect(result.ok && result.value.account).toBe("owner@example.com");
    expect(execute.mock.calls[0]![1]).toEqual(["calendar", "freebusy", "primary", "--account", "owner@example.com", "--from", "2026-09-07T00:00:00+09:00", "--to", "2026-09-07T15:00:00.000Z", "--json", "--no-input", "--gmail-no-send", "--enable-commands-exact", "calendar.freebusy"]);
  });
  it.each([{ errors: [{ reason: "forbidden" }] }, { busy: [], errors: [{ reason: "notFound" }] }, {}])("カレンダー単位の失敗を空きとみなさない", async (primary) => {
    const execute = vi.fn<CommandRepository["execute"]>().mockResolvedValue(ok({ stdout: JSON.stringify({ calendars: { primary } }), stderr: "" }));
    expect((await createReplyCalendarRepository({ execute }, "owner@example.com").read(request, new AbortController().signal)).ok).toBe(false);
  });
  it("CLI の失敗を伝える", async () => {
    const execute = vi.fn<CommandRepository["execute"]>().mockResolvedValue(err(runnerError("command_failed", "認証失敗")));
    const result = await createReplyCalendarRepository({ execute }, "owner@example.com").read(request, new AbortController().signal);
    expect(!result.ok && result.error.code).toBe("calendar_read_failed");
  });
});
