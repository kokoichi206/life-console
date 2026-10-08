import type { CalendarEvent } from "@life-console/contracts";
import { describe, expect, it } from "vitest";

import { upcomingCalendar } from "./upcoming-calendar";

const event = (id: string, date: string, dueAt: string | null = null): CalendarEvent => ({ id, date, title: id, source: "garbage", sourceKey: id, notes: "", status: "active", sourceUrl: "https://example.com", updatedAt: "2026-10-09T00:00:00Z", preparation: { id: `prep-${id}`, title: id, status: "todo", dueAt } });

describe("ホームの予定と準備", () => {
  it("日本時間の日付変更と月・年をまたぐ明日を扱う", () => {
    const result = upcomingCalendar([], new Date("2026-12-31T14:59:59Z"));
    expect([result.today, result.tomorrow]).toEqual(["2026-12-31", "2027-01-01"]);
    expect(upcomingCalendar([], new Date("2026-12-31T15:00:00Z")).today).toBe("2027-01-01");
  });
  it("本人が変更した準備期限を予定日と別に扱い、期限超過は今日に残す", () => {
    const result = upcomingCalendar([
      event("tomorrow", "2026-10-10", "2026-10-09T12:00:00Z"),
      event("future", "2026-10-20", "2026-10-08T23:00:00Z"),
      event("overdue", "2026-10-08"),
      event("tomorrow-prep", "2026-10-20", "2026-10-09T23:00:00Z"),
    ], new Date("2026-10-09T00:00:00Z"));
    expect(result.days[0]!.preparations.map((item) => item.id)).toEqual(["overdue", "future", "tomorrow"]);
    expect(result.days[0]!.events).toEqual([]);
    expect(result.days[1]!.events.map((item) => item.id)).toEqual(["tomorrow"]);
    expect(result.days[1]!.preparations.map((item) => item.id)).toEqual(["tomorrow-prep"]);
  });
  it("中止した予定、完了・中止した準備は準備一覧に含めない", () => {
    const base = event("collection", "2026-10-09");
    const result = upcomingCalendar([
      { ...base, id: "canceled", status: "canceled" },
      { ...base, id: "done", preparation: { ...base.preparation!, status: "done" } },
      { ...base, id: "prep-canceled", preparation: { ...base.preparation!, status: "canceled" } },
    ], new Date("2026-10-09T00:00:00Z"));
    expect(result.days[0]!.preparations).toEqual([]);
    expect(result.days[0]!.events.map((item) => item.id)).toEqual(["done", "prep-canceled"]);
  });
});
