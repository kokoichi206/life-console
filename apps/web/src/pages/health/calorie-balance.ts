import { weightCalendarDate, type MealNutrition } from "@life-console/contracts";

import type { ExerciseDayCalories } from "./exercise-calories";
import { summarizeDailyNutrition } from "./nutrition-summary";

const ONE_DAY_MILLISECONDS = 86_400_000;

export type ExerciseInput
  = | { readonly mode: "untracked" }
    | { readonly mode: "tracked"; readonly byDay: ReadonlyMap<string, ExerciseDayCalories> };

export type CalorieBalanceDay = {
  readonly date: string;
  readonly intakeKcal: number;
  readonly recordedMeals: number;
  readonly totalMeals: number;
  readonly exercise: ExerciseDayCalories | undefined;
  /** 基準消費量 + 運動 − 摂取。記録なし・基準未設定・運動の取得中と失敗では null。 */
  readonly balanceKcal: number | null;
  readonly signKnown: boolean;
  readonly amountKnown: boolean;
};

export type CalorieBalanceRow
  = | { readonly kind: "day"; readonly day: CalorieBalanceDay }
    | { readonly kind: "gap"; readonly from: string; readonly to: string; readonly days: number };

export const calorieBalanceRows = (
  from: string,
  to: string,
  nutrition: ReadonlyArray<MealNutrition>,
  exercise: ExerciseInput | undefined,
  baselineKcal: number | null,
): ReadonlyArray<CalorieBalanceRow> => {
  const withinPeriod = nutrition.filter((meal) => {
    const date = weightCalendarDate(meal.occurredAt);
    return date >= from && date <= to;
  });
  const mealsByDay = new Map(summarizeDailyNutrition(withinPeriod).map((day) => [day.date, day]));
  const rows: CalorieBalanceRow[] = [];
  let gap: { from: string; to: string; days: number } | null = null;
  const flushGap = () => {
    if (gap === null) return;
    if (gap.days === 1) rows.push({ kind: "day", day: emptyDay(gap.from) });
    else rows.push({ kind: "gap", from: gap.from, to: gap.to, days: gap.days });
    gap = null;
  };
  for (let timestamp = Date.parse(`${to}T00:00:00Z`); timestamp >= Date.parse(`${from}T00:00:00Z`); timestamp -= ONE_DAY_MILLISECONDS) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const meals = mealsByDay.get(date);
    const exerciseDay = exercise?.mode === "tracked" ? exercise.byDay.get(date) : undefined;
    if (meals === undefined && exerciseDay === undefined) {
      gap = gap === null ? { from: date, to: date, days: 1 } : { from: date, to: gap.to, days: gap.days + 1 };
      continue;
    }
    flushGap();
    const { caloriesKcal: intakeKcal, recordedMeals, totalMeals } = meals ?? { caloriesKcal: 0, recordedMeals: 0, totalMeals: 0 };
    const balanceKcal = baselineKcal === null || totalMeals === 0 || exercise === undefined
      ? null
      : baselineKcal + (exerciseDay?.kcal ?? 0) - intakeKcal;
    // 未記録の食事は摂取を増やす方向、取得待ちの運動は収支を上げる方向にしか動かないため、確定条件は上下で非対称になる。
    const allMealsRecorded = recordedMeals === totalMeals;
    const noPendingExercise = (exerciseDay?.pendingActivities ?? 0) === 0;
    rows.push({ kind: "day", day: {
      date, intakeKcal, recordedMeals, totalMeals, exercise: exerciseDay, balanceKcal,
      signKnown: balanceKcal !== null && (balanceKcal < 0 ? noPendingExercise : allMealsRecorded),
      amountKnown: balanceKcal !== null && allMealsRecorded && noPendingExercise,
    } });
  }
  flushGap();
  return rows;
};

const emptyDay = (date: string): CalorieBalanceDay => ({
  date, intakeKcal: 0, recordedMeals: 0, totalMeals: 0, exercise: undefined, balanceKcal: null, signKnown: false, amountKnown: false,
});
