import type { StravaActivity, StravaActivityCalories } from "@life-console/contracts";
import { describe, expect, it } from "vitest";

import { exerciseCaloriesByDay } from "./exercise-calories";
import { exerciseChartWeeks } from "./exercise-chart-weeks";
import { exerciseWeeks } from "./exercise-weeks";

const activity = (id: string, occurredAt: string, sportType = "Run"): StravaActivity => ({ id, occurredAt, sportType, name: "架空の運動", distanceMeters: 5000, movingSeconds: 1800, elapsedSeconds: 1800, averageHeartrate: null });
const calories = (entry: StravaActivity, caloriesKcal: number | null, status: StravaActivityCalories["status"] = "measured"): StravaActivityCalories => ({ activityId: entry.id, occurredAt: entry.occurredAt, caloriesKcal, status });

describe("体重グラフの週別運動消費", () => {
  it("日本時間の月曜で全種目を集計し、重複と期間外を含めない", () => {
    const sunday = activity("sunday", "2026-09-06T14:59:59Z");
    const monday = activity("monday", "2026-09-06T15:00:00Z");
    const walk = activity("walk", "2026-09-08T01:00:00Z", "Walk");
    const outside = activity("outside", "2026-09-09T01:00:00Z");
    const activities = [sunday, monday, monday, walk, outside];
    const weeks = exerciseChartWeeks(exerciseWeeks("2026-09-06", "2026-09-08", activities, [], []), { kind: "calories", byDay: exerciseCaloriesByDay(activities, [calories(sunday, 200), calories(monday, 500), calories(walk, 150), calories(outside, 900)]) }, "2026-09-19");
    expect(weeks.map((week) => [week.value, week.summary, week.periodLabel])).toEqual([[650, "650 kcal", "（一部・2 日分）"], [200, "200 kcal", "（一部・1 日分）"]]);
  });

  it("取得済み分と未取得・取得不可を区別し、全件不明をゼロにしない", () => {
    const measured = activity("measured", "2026-09-07T00:00:00Z");
    const pending = activity("pending", "2026-09-08T00:00:00Z");
    const unavailable = activity("unavailable", "2026-09-09T00:00:00Z", "WeightTraining");
    const missing = activity("missing", "2026-09-14T00:00:00Z");
    const activities = [measured, pending, unavailable, missing];
    const weeks = exerciseChartWeeks(exerciseWeeks("2026-09-07", "2026-09-20", activities, [], []), { kind: "calories", byDay: exerciseCaloriesByDay(activities, [calories(measured, 500), calories(pending, null, "pending"), calories(unavailable, null, "unavailable")]) }, "2026-09-20");
    expect(weeks[0]).toMatchObject({ value: null, summary: "カロリー未取得 ・ 未取得 1 件", incomplete: true, periodLabel: "（途中・7 日分）" });
    expect(weeks[1]).toMatchObject({ value: 500, summary: "500 kcal（取得済み分） ・ 未取得 1 件 ・ 取得不可 1 件", incomplete: true });
  });

  it("取得済みのゼロと運動記録なしを区別する", () => {
    const zero = activity("zero", "2026-09-07T00:00:00Z");
    const weeks = exerciseChartWeeks(exerciseWeeks("2026-09-07", "2026-09-20", [zero], [], []), { kind: "calories", byDay: exerciseCaloriesByDay([zero], [calories(zero, 0)]) }, "2026-09-21");
    expect(weeks.map((week) => [week.value, week.summary])).toEqual([[0, "記録された運動なし"], [0, "0 kcal"]]);
  });
});
