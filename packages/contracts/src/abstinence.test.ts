import { describe, expect, it } from "vitest";

import { calculateAbstinenceStreaks, sumAbstinenceEventDurationMinutes } from "./abstinence";

const goal = { name: "夜更かし", startedAt: "2026-09-01T00:00:00+09:00", targetDays: 30, targetDate: null } as const;
const event = (id: string, occurredAt: string) => ({ id, occurredAt, durationMinutes: null, memo: "", recordedAt: occurredAt });

describe("calculateAbstinenceStreaks", () => {
  it("現在の継続期間と過去の最長期間を分けて計算する", () => {
    expect(calculateAbstinenceStreaks(goal, [event("one", "2026-09-04T23:00:00+09:00"), event("two", "2026-09-07T01:00:00+09:00")], "2026-09-10T00:00:00+09:00")).toEqual({ currentStreakDays: 3, longestStreakDays: 3 });
  });

  it("目標を設定し直す前のイベントを現在の目標へ混ぜない", () => {
    const restarted = { ...goal, startedAt: "2026-09-08T00:00:00+09:00" };
    expect(calculateAbstinenceStreaks(restarted, [event("old", "2026-09-04T00:00:00+09:00")], "2026-09-10T00:00:00+09:00")).toEqual({ currentStreakDays: 2, longestStreakDays: 2 });
  });
});

describe("sumAbstinenceEventDurationMinutes", () => {
  it("記録されたイベント時間だけを累計する", () => {
    expect(sumAbstinenceEventDurationMinutes([
      { ...event("one", "2026-09-04T23:00:00+09:00"), durationMinutes: 20 },
      { ...event("two", "2026-09-07T01:00:00+09:00"), durationMinutes: null },
      { ...event("three", "2026-09-08T01:00:00+09:00"), durationMinutes: 45 },
    ])).toBe(65);
  });
});
