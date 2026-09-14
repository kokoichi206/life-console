import { weightCalendarDate, type StravaActivity, type StravaActivityCalories } from "@life-console/contracts";

export type ExerciseDayCalories = {
  /** 実測できた活動の合計。取得待ち・算入外は加えない。 */
  readonly kcal: number;
  readonly pendingActivities: number;
  readonly unavailableActivities: number;
};

export const exerciseCaloriesByDay = (
  activities: ReadonlyArray<Pick<StravaActivity, "id" | "occurredAt">>,
  calories: ReadonlyArray<StravaActivityCalories>,
): ReadonlyMap<string, ExerciseDayCalories> => {
  const storedByActivity = new Map(calories.map((entry) => [entry.activityId, entry]));
  const days = new Map<string, { kcal: number; pendingActivities: number; unavailableActivities: number }>();
  for (const activity of new Map(activities.map((entry) => [entry.id, entry])).values()) {
    const date = weightCalendarDate(activity.occurredAt);
    const day = days.get(date) ?? { kcal: 0, pendingActivities: 0, unavailableActivities: 0 };
    const stored = storedByActivity.get(activity.id);
    // 登録直後は保存行がないため、値を持たない活動はすべて取得待ちとして数える。
    if (stored?.status === "unavailable") day.unavailableActivities += 1;
    else if (stored?.caloriesKcal == null) day.pendingActivities += 1;
    else day.kcal += stored.caloriesKcal;
    days.set(date, day);
  }
  return days;
};
