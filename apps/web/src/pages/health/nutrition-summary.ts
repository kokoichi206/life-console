import type { JobStatus, MealNutrition } from "@life-console/contracts";

const calendarDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });

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
