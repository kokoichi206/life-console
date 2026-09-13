import type { StravaActivity, StravaActivityCalories } from "@life-console/contracts";
import { describe, expect, it } from "vitest";

import { exerciseCaloriesByDay } from "./exercise-calories";

const activity = (id: string, occurredAt: string): StravaActivity => ({
  id, occurredAt, sportType: "Run", name: "架空の運動", distanceMeters: 5000, movingSeconds: 1800, elapsedSeconds: 2000, averageHeartrate: null,
});
const measured = (activityId: string, caloriesKcal: number): StravaActivityCalories => ({ activityId, status: "measured", caloriesKcal });

describe("日別の運動消費カロリー", () => {
  it("日本時間の日付で実測値を合計し、同じ活動の重複を除く", () => {
    const morning = activity("morning", "2026-09-06T15:00:00Z");
    const byDay = exerciseCaloriesByDay(
      [morning, morning, activity("evening", "2026-09-07T12:00:00Z"), activity("previous", "2026-09-06T14:59:59Z")],
      [measured("morning", 320), measured("evening", 180), measured("previous", 410)],
    );
    expect([...byDay]).toEqual([
      ["2026-09-07", { kcal: 500, pendingActivities: 0, unavailableActivities: 0 }],
      ["2026-09-06", { kcal: 410, pendingActivities: 0, unavailableActivities: 0 }],
    ]);
  });
  it("保存行のない活動と pending を取得待ちに、unavailable を算入外に数え、どちらも合計に入れない", () => {
    const byDay = exerciseCaloriesByDay(
      [activity("stored", "2026-09-07T00:00:00Z"), activity("waiting", "2026-09-07T01:00:00Z"), activity("unregistered", "2026-09-07T02:00:00Z"), activity("manual", "2026-09-07T03:00:00Z")],
      [measured("stored", 320), { activityId: "waiting", status: "pending", caloriesKcal: null }, { activityId: "manual", status: "unavailable", caloriesKcal: null }],
    );
    expect(byDay.get("2026-09-07")).toEqual({ kcal: 320, pendingActivities: 2, unavailableActivities: 1 });
  });
});
