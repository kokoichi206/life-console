import type { MealNutrition } from "@life-console/contracts";
import { describe, expect, it } from "vitest";

import { summarizeDailyNutrition } from "./nutrition-summary";

const record = (mealId: string, occurredAt: string, caloriesKcal: number | null): MealNutrition => ({
  mealId, photoId: "photo", manualCaloriesKcal: null, occurredAt, analysisStatus: null, analysisSummary: null,
  estimate: caloriesKcal === null
    ? null
    : { caloriesKcal, proteinGrams: 10, fatGrams: 10, carbohydrateGrams: 10,
        model: "test", analyzedAt: occurredAt, inputHash: "a".repeat(64) },
});
describe("日本時間の日別カロリー", () => {
  it("手入力を推定より優先し、0 kcal も記録済みに含める", () => {
    expect(summarizeDailyNutrition([
      { ...record("manual", "2026-09-09T00:00:00Z", 900), manualCaloriesKcal: 500 },
      { ...record("zero", "2026-09-09T00:00:00Z", null), manualCaloriesKcal: 0 },
      record("estimated", "2026-09-09T00:00:00Z", 300),
    ])).toEqual([{ date: "2026-09-09", caloriesKcal: 800, recordedMeals: 3, totalMeals: 3 }]);
  });
  it("日本時間の午前 0 時で日を分け、未解析を 0 kcal と表示しない", () => {
    expect(summarizeDailyNutrition([
      record("a", "2026-09-08T14:59:00Z", 600), record("b", "2026-09-08T15:00:00Z", 700),
      record("c", "2026-09-09T05:00:00Z", 300), record("d", "2026-09-09T06:00:00Z", null),
      record("e", "2026-09-09T15:00:00Z", null),
    ])).toEqual([
      { date: "2026-09-10", caloriesKcal: 0, recordedMeals: 0, totalMeals: 1 },
      { date: "2026-09-09", caloriesKcal: 1000, recordedMeals: 2, totalMeals: 3 },
      { date: "2026-09-08", caloriesKcal: 600, recordedMeals: 1, totalMeals: 1 },
    ]);
  });
});
