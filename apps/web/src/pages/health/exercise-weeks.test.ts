import type { Meal, StravaActivity, WeightPoint } from "@life-console/contracts";
import { describe, expect, it } from "vitest";

import { exerciseWeeks, runningPace } from "./exercise-weeks";

const run = (id: string, occurredAt: string, sportType = "Run"): StravaActivity => ({ id, occurredAt, sportType, name: "架空の運動", distanceMeters: 5000, movingSeconds: 1800, elapsedSeconds: 2000, averageHeartrate: null });
describe("週の健康記録", () => {
  it("日本時間の月曜で区切り、重複を除き、走っていない週と他の運動を分ける", () => {
    const lastSunday = run("sunday", "2026-09-06T14:59:59Z");
    const monday = run("monday", "2026-09-06T15:00:00Z", "TrailRun");
    const weeks = exerciseWeeks("2026-08-31", "2026-09-20", [lastSunday, monday, monday, run("walk", "2026-09-07T00:00:00Z", "Walk"), run("strength", "2026-09-08T00:00:00Z", "WeightTraining")], [], []);
    expect(weeks.map((week) => [week.from, week.runCount, week.distanceMeters, week.otherCount])).toEqual([
      ["2026-09-14", 0, 0, 0], ["2026-09-07", 1, 5000, 2], ["2026-08-31", 1, 5000, 0],
    ]);
  });
  it("期間の端は一部と示し、同じ期間の実測値と食事だけを含める", () => {
    const weights = [{ id: "w1", weightKg: 80, occurredAt: "2026-09-09T00:00:00Z" }, { id: "w2", weightKg: 82, occurredAt: "2026-09-10T00:00:00Z" }, { id: "w3", weightKg: 90, occurredAt: "2026-09-08T00:00:00Z" }] as WeightPoint[];
    const meals = [{ occurredAt: "2026-09-09T00:00:00Z" }, { occurredAt: "2026-09-11T00:00:00Z" }] as Meal[];
    expect(exerciseWeeks("2026-09-09", "2026-09-10", [run("outside", "2026-09-07T00:00:00Z")], weights, meals)[0]).toMatchObject({ partial: true, runCount: 0, averageWeight: 81, mealCount: 1 });
  });
  it("ペースは端数を繰り上げ、距離や移動時間がなければ補わない", () => {
    expect(runningPace(1000, 359.8)).toBe("6:00 /km");
    expect(runningPace(0, 10)).toBe("—");
    expect(runningPace(1000, 0)).toBe("—");
  });
});
