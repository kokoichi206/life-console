import { weightGoalSchema } from "@life-console/contracts";

export type WeightRange = "d30" | "d90" | "all" | `year-${string}`;
export type HealthSearch = {
  readonly strava?: "connected" | "error" | undefined;
  readonly entry?: "weight" | "meal" | "goal" | "baseline" | undefined;
  readonly meal?: string | undefined;
  readonly range?: WeightRange | undefined;
  readonly overlay?: "running" | "body-fat" | "exercise-calories" | undefined;
  readonly calories?: "all" | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
};

export const parseHealthSearch = (search: Record<string, unknown>): HealthSearch => {
  const range = typeof search.range === "string" && /^(d30|d90|all|year-\d{4})$/.test(search.range) ? search.range as WeightRange : undefined;
  const from = weightGoalSchema.shape.targetDate.unwrap().safeParse(search.from);
  const to = weightGoalSchema.shape.targetDate.unwrap().safeParse(search.to);
  return {
    ...(search.strava === "connected" || search.strava === "error" ? { strava: search.strava } : {}),
    ...(search.entry === "weight" || search.entry === "meal" || search.entry === "goal" || search.entry === "baseline" ? { entry: search.entry } : {}),
    ...(typeof search.meal === "string" && search.meal.length > 0 ? { meal: search.meal } : {}),
    ...(search.overlay === "running" || search.overlay === "body-fat" || search.overlay === "exercise-calories"
      ? { overlay: search.overlay }
      : search.running === "show" ? { overlay: "running" as const } : {}),
    ...(search.calories === "all" ? { calories: search.calories } : {}),
    ...(range === undefined ? {} : { range }),
    ...(from.success && to.success && from.data < to.data ? { from: from.data, to: to.data } : {}),
  };
};

export const parseSharedHealthSearch = (search: Record<string, unknown>): HealthSearch => {
  const { entry: _entry, strava: _strava, ...display } = parseHealthSearch(search);
  return display;
};
