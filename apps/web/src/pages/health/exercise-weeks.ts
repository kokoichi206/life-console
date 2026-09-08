import { weightCalendarDate, type Meal, type StravaActivity, type WeightPoint } from "@life-console/contracts";

const DAY = 86_400_000;
const dayString = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
export const isRunning = (sportType: string): boolean => ["Run", "TrailRun", "VirtualRun"].includes(sportType);
export const sportLabel = (sportType: string): string => ({ Run: "ランニング", TrailRun: "トレイルラン", VirtualRun: "バーチャルラン", Walk: "ウォーキング", Hike: "ハイキング", WeightTraining: "筋トレ" }[sportType] ?? sportType);
export const runningPace = (distanceMeters: number, movingSeconds: number): string => {
  if (distanceMeters === 0 || movingSeconds === 0) return "—";
  const seconds = Math.round(movingSeconds / (distanceMeters / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} /km`;
};
export const exerciseWeeks = (from: string, to: string, activities: ReadonlyArray<StravaActivity>, weights: ReadonlyArray<WeightPoint>, meals: ReadonlyArray<Meal>) => {
  const start = Date.parse(from);
  const monday = start - (new Date(start).getUTCDay() + 6) % 7 * DAY;
  const uniqueActivities = [...new Map(activities.map((activity) => [activity.id, activity])).values()];
  const weeks = [];
  for (let timestamp = monday; timestamp <= Date.parse(to); timestamp += 7 * DAY) {
    const weekFrom = dayString(timestamp);
    const weekTo = dayString(timestamp + 6 * DAY);
    const visibleFrom = weekFrom < from ? from : weekFrom;
    const visibleTo = weekTo > to ? to : weekTo;
    const within = (occurredAt: string) => {
      const day = weightCalendarDate(occurredAt);
      return day >= visibleFrom && day <= visibleTo;
    };
    const weekActivities = uniqueActivities.filter((activity) => within(activity.occurredAt));
    const runs = weekActivities.filter((activity) => isRunning(activity.sportType));
    const weekWeights = weights.filter((weight) => within(weight.occurredAt));
    weeks.push({
      from: weekFrom, to: weekTo, visibleFrom, visibleTo, partial: visibleFrom !== weekFrom || visibleTo !== weekTo,
      runCount: runs.length, distanceMeters: runs.reduce((sum, run) => sum + run.distanceMeters, 0), movingSeconds: runs.reduce((sum, run) => sum + run.movingSeconds, 0),
      otherCount: weekActivities.length - runs.length,
      averageWeight: weekWeights.length === 0 ? null : weekWeights.reduce((sum, weight) => sum + weight.weightKg, 0) / weekWeights.length,
      mealCount: meals.filter((meal) => within(meal.occurredAt)).length,
    });
  }
  return weeks.reverse();
};
