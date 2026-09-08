import type { MealNutrition } from "@life-console/contracts";

const calendarDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });

export const summarizeDailyNutrition = (meals: ReadonlyArray<MealNutrition>) => {
  const days = new Map<string, { date: string; caloriesKcal: number; estimatedMeals: number; totalMeals: number }>();
  for (const meal of meals) {
    const date = calendarDate.format(new Date(meal.occurredAt));
    const day = days.get(date) ?? { date, caloriesKcal: 0, estimatedMeals: 0, totalMeals: 0 };
    day.totalMeals += 1;
    if (meal.estimate !== null) {
      day.estimatedMeals += 1;
      day.caloriesKcal += meal.estimate.caloriesKcal;
    }
    days.set(date, day);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
};

export const nutritionIsPending = (status: string | null) => status !== null && ["queued", "claimed", "running", "waiting_for_user"].includes(status);
