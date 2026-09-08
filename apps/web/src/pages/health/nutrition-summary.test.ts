import type { MealNutrition } from "@life-console/contracts";
import { describe, expect, it } from "vitest";

import { summarizeDailyNutrition } from "./nutrition-summary";

const record = (mealId: string, occurredAt: string, caloriesKcal: number | null): MealNutrition => ({
  mealId, photoId: "photo", occurredAt, analysisStatus: null, analysisSummary: null,
  estimate: caloriesKcal === null
    ? null
    : { caloriesKcal, proteinGrams: 10, fatGrams: 10, carbohydrateGrams: 10,
        model: "test", analyzedAt: occurredAt, inputHash: "a".repeat(64) },
});
describe("日本時間の日別カロリー", () => {
  it("日本時間の午前 0 時で日を分け、未解析を 0 kcal と表示しない", () => {
    expect(summarizeDailyNutrition([
      record("a", "2026-09-08T14:59:00Z", 600), record("b", "2026-09-08T15:00:00Z", 700),
      record("c", "2026-09-09T05:00:00Z", 300), record("d", "2026-09-09T06:00:00Z", null),
      record("e", "2026-09-09T15:00:00Z", null),
    ])).toEqual([
      { date: "2026-09-10", caloriesKcal: 0, estimatedMeals: 0, totalMeals: 1 },
      { date: "2026-09-09", caloriesKcal: 1000, estimatedMeals: 2, totalMeals: 3 },
      { date: "2026-09-08", caloriesKcal: 600, estimatedMeals: 1, totalMeals: 1 },
    ]);
  });
});
