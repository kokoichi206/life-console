import type { JobStatus, MealNutrition } from "@life-console/contracts";

const calendarDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });

const pfcGramsFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
export const formatPfcGrams = (grams: number): string => pfcGramsFormat.format(grams);

export type PfcGrams = { readonly proteinGrams: number; readonly fatGrams: number; readonly carbohydrateGrams: number };
export type DailyPfc = PfcGrams & { readonly date: string; readonly totalMeals: number; readonly analyzedMeals: number };

export const summarizeDailyPfc = (meals: ReadonlyArray<MealNutrition>): ReadonlyArray<DailyPfc> => {
  const days = new Map<string, DailyPfc>();
  for (const meal of meals) {
    const date = calendarDate.format(new Date(meal.occurredAt));
    const day = days.get(date) ?? { date, totalMeals: 0, analyzedMeals: 0, proteinGrams: 0, fatGrams: 0, carbohydrateGrams: 0 };
    days.set(date, {
      date, totalMeals: day.totalMeals + 1, analyzedMeals: day.analyzedMeals + (meal.estimate === null ? 0 : 1),
      proteinGrams: day.proteinGrams + (meal.estimate?.proteinGrams ?? 0),
      fatGrams: day.fatGrams + (meal.estimate?.fatGrams ?? 0),
      carbohydrateGrams: day.carbohydrateGrams + (meal.estimate?.carbohydrateGrams ?? 0),
    });
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
};

export type PfcEnergyPercentages = { readonly proteinPercent: number; readonly fatPercent: number; readonly carbohydratePercent: number };

export const pfcEnergyPercentages = (grams: PfcGrams): PfcEnergyPercentages | undefined => {
  const total = grams.proteinGrams * 4 + grams.fatGrams * 9 + grams.carbohydrateGrams * 4;
  if (total === 0) return undefined;
  return { proteinPercent: grams.proteinGrams * 4 / total * 100, fatPercent: grams.fatGrams * 9 / total * 100, carbohydratePercent: grams.carbohydrateGrams * 4 / total * 100 };
};

export const pfcGoalExample = (weightKg: number, intakeKcal: number): PfcGrams => ({
  proteinGrams: weightKg * 2,
  fatGrams: intakeKcal * 0.25 / 9,
  carbohydrateGrams: (intakeKcal * 0.75 - weightKg * 2 * 4) / 4,
});

export const summarizeDailyNutrition = (meals: ReadonlyArray<MealNutrition>) => {
  const days = new Map<string, { date: string; caloriesKcal: number; recordedMeals: number; totalMeals: number }>();
  for (const meal of meals) {
    const date = calendarDate.format(new Date(meal.occurredAt));
    const day = days.get(date) ?? { date, caloriesKcal: 0, recordedMeals: 0, totalMeals: 0 };
    day.totalMeals += 1;
    const caloriesKcal = meal.manualCaloriesKcal ?? meal.estimate?.caloriesKcal;
    if (caloriesKcal !== undefined) {
      day.recordedMeals += 1;
      day.caloriesKcal += caloriesKcal;
    }
    days.set(date, day);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
};

const pendingAnalysisStatuses = new Set<JobStatus>(["queued", "claimed", "running", "waiting_for_user"]);
export const nutritionIsPending = (status: JobStatus | null): boolean => status !== null && pendingAnalysisStatuses.has(status);
