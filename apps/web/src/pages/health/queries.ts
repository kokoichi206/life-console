import { queryOptions } from "@tanstack/react-query";

import { api } from "../../api";

export const mealsQuery = queryOptions({ queryKey: ["meals"], queryFn: api.meals });
export const weightsQuery = queryOptions({ queryKey: ["weights"], queryFn: api.weights });

export const weightGoalQuery = queryOptions({ queryKey: ["weight-goal"], queryFn: api.weightGoal });

export const stravaStatusQuery = queryOptions({ queryKey: ["strava-status"], queryFn: api.stravaStatus, retry: false });
export const mealsForPeriodQuery = (from: string, to: string) => queryOptions({ queryKey: ["meals", from, to], queryFn: () => api.mealsForPeriod(from, to) });
export const nutritionQuery = queryOptions({ queryKey: ["nutrition"], queryFn: api.nutrition, refetchInterval: 5_000 });

/** 取得待ちの活動がある間だけ D1 を読み直す。Strava は呼ばないのでレート制限の予算を使わない。 */
const STRAVA_CALORIES_POLL_INTERVAL_MS = 30_000;

export const stravaCaloriesSyncStatusQuery = (enabled: boolean) => queryOptions({
  queryKey: ["strava-calories-sync-status"],
  queryFn: api.stravaCaloriesSyncStatus,
  enabled,
  retry: false,
  // 「いま動いているか」を見る行なので、開いたままでも同期の進みに追随させる。D1 だけを読む。
  refetchInterval: STRAVA_CALORIES_POLL_INTERVAL_MS,
});

export const calorieBaselineQuery = queryOptions({ queryKey: ["calorie-baseline"], queryFn: api.calorieBaseline });

export const stravaCaloriesQuery = (from: string, to: string, enabled: boolean) => queryOptions({
  queryKey: ["strava-calories", from, to],
  queryFn: () => api.stravaCalories(from, to),
  enabled,
  retry: false,
  refetchInterval: (query) => query.state.data?.some((entry) => entry.status === "pending") === true ? STRAVA_CALORIES_POLL_INTERVAL_MS : false,
});
