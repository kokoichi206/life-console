import type { CreateMealInput, Meal } from "@life-console/contracts";

export type MealKind = CreateMealInput["mealKind"];

const mealKindTimeZone = "Asia/Tokyo";
const mealKindDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: mealKindTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

const mealDateTimeParts = (occurredAt: string): { readonly date: string; readonly hour: number } => {
  const parts = Object.fromEntries(mealKindDateTimeFormatter.formatToParts(new Date(occurredAt)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};

const mealKindForHour = (hour: number): MealKind => {
  if (hour < 5 || hour >= 22) return "snack";
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  return "dinner";
};

export const defaultMealKindFor = (occurredAt: string, meals: ReadonlyArray<Meal>): MealKind => {
  const target = mealDateTimeParts(occurredAt);
  const mealKind = mealKindForHour(target.hour);
  if (mealKind === "snack") return mealKind;
  const hasDefaultMeal = meals.some((meal) => {
    if (meal.mealKind !== mealKind) return false;
    const recorded = mealDateTimeParts(meal.occurredAt);
    return recorded.date === target.date && mealKindForHour(recorded.hour) === mealKind;
  });
  return hasDefaultMeal ? "snack" : mealKind;
};
