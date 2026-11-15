import type { MealNutrition } from "@life-console/contracts";
import { describe, expect, it } from "vitest";

import { summarizeDailyNutrition, summarizeDailyPfc, pfcEnergyPercentages, pfcGoalExample, formatPfcGrams } from "./nutrition-summary";

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

describe("日別 PFC", () => {
  it("カロリーの手入力と PFC の解析件数を分け、推定 PFC を保持する", () => {
    const manual = { ...record("manual", "2026-10-08T12:00:00+09:00", 500), manualCaloriesKcal: 900 };
    const unanalyzed = { ...record("unanalyzed", "2026-10-08T19:00:00+09:00", null), manualCaloriesKcal: 700 };
    expect(summarizeDailyPfc([manual, unanalyzed])).toEqual([{ date: "2026-10-08", totalMeals: 2, analyzedMeals: 1, proteinGrams: 10, fatGrams: 10, carbohydrateGrams: 10 }]);
  });
  it("日本時間の日付で集計し、推定値 0 g を解析済みとして数える", () => {
    const zero = { ...record("zero", "2026-10-08T15:00:00Z", 0), estimate: { ...record("zero", "2026-10-08T15:00:00Z", 0).estimate!, proteinGrams: 0, fatGrams: 0, carbohydrateGrams: 0 } };
    expect(summarizeDailyPfc([record("before", "2026-10-08T14:59:00Z", 500), zero])).toEqual([
      { date: "2026-10-09", totalMeals: 1, analyzedMeals: 1, proteinGrams: 0, fatGrams: 0, carbohydrateGrams: 0 },
      { date: "2026-10-08", totalMeals: 1, analyzedMeals: 1, proteinGrams: 10, fatGrams: 10, carbohydrateGrams: 10 },
    ]);
  });
  it("PFC のエネルギーを分母にし、全て 0 のときは割合を出さない", () => {
    expect(pfcEnergyPercentages({ proteinGrams: 25, fatGrams: 100 / 9, carbohydrateGrams: 50 })).toEqual({ proteinPercent: 25, fatPercent: 25, carbohydratePercent: 50 });
    expect(pfcEnergyPercentages({ proteinGrams: 0, fatGrams: 0, carbohydrateGrams: 0 })).toBeUndefined();
    expect(pfcGoalExample(70, 2000)).toEqual({ proteinGrams: 140, fatGrams: 500 / 9, carbohydrateGrams: 235 });
  });
});

it("小数の合計は表示時に整形し、計算値の精度を変えない", () => {
  const meals = [12.3, 45.6].map((proteinGrams, index) => ({ ...record(`decimal-${index}`, "2026-10-09T12:00:00+09:00", 500), estimate: { ...record("decimal", "2026-10-09T12:00:00+09:00", 500).estimate!, proteinGrams } }));
  expect(formatPfcGrams(summarizeDailyPfc(meals)[0]!.proteinGrams)).toBe("57.9");
});
