import { queryOptions } from "@tanstack/react-query";
import { createContext, useContext } from "react";

import { api, type createHealthReadApi } from "../../api";
import { activeJobStatuses } from "../../features/jobs/JobProgress";

/** 取得待ちの活動がある間だけ D1 を読み直す。Strava は呼ばないのでレート制限の予算を使わない。 */
const STRAVA_CALORIES_POLL_INTERVAL_MS = 30_000;

export const createHealthQueries = (read: ReturnType<typeof createHealthReadApi>, scope: ReadonlyArray<string>, readOnly = false) => ({
  readOnly,
  read,
  mealsQuery: queryOptions({ queryKey: [...scope, "meals"], queryFn: read.meals }),
  weightsQuery: queryOptions({ queryKey: [...scope, "weights"], queryFn: read.weights }),
  weightGoalQuery: queryOptions({ queryKey: [...scope, "weight-goal"], queryFn: read.weightGoal }),
  calorieBaselineQuery: queryOptions({ queryKey: [...scope, "calorie-baseline"], queryFn: read.calorieBaseline }),
  stravaStatusQuery: queryOptions({ queryKey: [...scope, "strava-status"], queryFn: read.stravaStatus, retry: false }),
  mealsForPeriodQuery: (from: string, to: string) => queryOptions({ queryKey: [...scope, "meals", from, to], queryFn: () => read.mealsForPeriod(from, to) }),
  nutritionQuery: queryOptions({
    queryKey: [...scope, "nutrition"], queryFn: read.nutrition,
    refetchInterval: (query) => query.state.data?.some((meal) => meal.analysisStatus !== null && activeJobStatuses.has(meal.analysisStatus)) === true ? 5_000 : 60_000,
  }),
  stravaCaloriesSyncStatusQuery: (enabled: boolean) => queryOptions({
    queryKey: [...scope, "strava-calories-sync-status"], queryFn: read.stravaCaloriesSyncStatus, enabled, retry: false,
    // 「いま動いているか」を見る行なので、開いたままでも同期の進みに追随させる。D1 だけを読む。
    refetchInterval: STRAVA_CALORIES_POLL_INTERVAL_MS,
  }),
  stravaCaloriesQuery: (from: string, to: string, enabled: boolean) => queryOptions({
    queryKey: [...scope, "strava-calories", from, to], queryFn: () => read.stravaCalories(from, to), enabled, retry: false,
    refetchInterval: (query) => query.state.data?.some((entry) => entry.status === "pending") === true ? STRAVA_CALORIES_POLL_INTERVAL_MS : 60_000,
  }),
  stravaActivitiesKey: (athleteId: number | null | undefined, from: string, to: string) => [...scope, "strava-activities", athleteId, from, to],
});

const ownerHealthQueries = createHealthQueries(api, []);
export const { mealsQuery, weightsQuery, weightGoalQuery, calorieBaselineQuery, stravaStatusQuery, mealsForPeriodQuery, nutritionQuery, stravaCaloriesSyncStatusQuery, stravaCaloriesQuery } = ownerHealthQueries;
export const HealthQueriesContext = createContext(ownerHealthQueries);
export const useHealthQueries = () => useContext(HealthQueriesContext);
