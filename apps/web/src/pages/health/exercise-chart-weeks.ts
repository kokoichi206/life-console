import type { ExerciseDayCalories } from "./exercise-calories";
import type { ExerciseWeek } from "./exercise-weeks";

export type ExerciseChartWeek = ExerciseWeek & {
  readonly value: number | null;
  readonly summary: string;
  readonly incomplete: boolean;
  readonly periodLabel: string;
};

const kcalFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

export const exerciseChartWeeks = (
  weeks: ReadonlyArray<ExerciseWeek>,
  metric: { readonly kind: "running" } | { readonly kind: "calories"; readonly byDay: ReadonlyMap<string, ExerciseDayCalories> },
  today: string,
): ReadonlyArray<ExerciseChartWeek> => weeks.map((week) => {
  const days = Math.round((Date.parse(week.visibleTo) - Date.parse(week.visibleFrom)) / 86_400_000) + 1;
  const periodLabel = week.visibleTo === today ? `（途中・${days} 日分）` : week.partial ? `（一部・${days} 日分）` : "";
  if (metric.kind === "running") return {
    ...week, value: week.distanceMeters / 1000, summary: `${(week.distanceMeters / 1000).toFixed(1)} km ・ ${week.runCount} 回`, incomplete: week.partial, periodLabel,
  };
  const dailyCalories = [...metric.byDay].filter(([date]) => date >= week.visibleFrom && date <= week.visibleTo).map(([, day]) => day);
  const kcal = dailyCalories.reduce((sum, day) => sum + day.kcal, 0);
  const pending = dailyCalories.reduce((sum, day) => sum + day.pendingActivities, 0);
  const unavailable = dailyCalories.reduce((sum, day) => sum + day.unavailableActivities, 0);
  const activityCount = week.runCount + week.otherCount;
  const measuredCount = activityCount - pending - unavailable;
  const missing = pending + unavailable > 0;
  const summary = activityCount === 0 ? "記録された運動なし" : measuredCount === 0 ? "カロリー未取得" : `${kcalFormat.format(kcal)} kcal${missing ? "（取得済み分）" : ""}`;
  return {
    ...week,
    value: activityCount > 0 && measuredCount === 0 ? null : kcal,
    summary: [summary, ...(pending > 0 ? [`未取得 ${pending} 件`] : []), ...(unavailable > 0 ? [`取得不可 ${unavailable} 件`] : [])].join(" ・ "),
    incomplete: week.partial || week.visibleTo === today || missing,
    periodLabel,
  };
});
