import { queryOptions } from "@tanstack/react-query";

import { api } from "../../api";

export const mealsQuery = queryOptions({ queryKey: ["meals"], queryFn: api.meals });
export const weightsQuery = queryOptions({ queryKey: ["weights"], queryFn: api.weights });

export const weightGoalQuery = queryOptions({ queryKey: ["weight-goal"], queryFn: api.weightGoal });

export const stravaStatusQuery = queryOptions({ queryKey: ["strava-status"], queryFn: api.stravaStatus, retry: false });
export const mealsForPeriodQuery = (from: string, to: string) => queryOptions({ queryKey: ["meals", from, to], queryFn: () => api.mealsForPeriod(from, to) });
