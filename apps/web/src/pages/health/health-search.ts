import { weightGoalSchema } from "@life-console/contracts";

export type WeightRange = "d30" | "d90" | "all" | `year-${string}`;
export type HealthSearch = {
  readonly entry?: "weight" | "meal" | "goal";
  readonly meal?: string;
  readonly range?: WeightRange;
  readonly from?: string;
  readonly to?: string;
};

export const parseHealthSearch = (search: Record<string, unknown>): HealthSearch => {
  const range = typeof search.range === "string" && /^(d30|d90|all|year-\d{4})$/.test(search.range) ? search.range as WeightRange : undefined;
  const from = weightGoalSchema.shape.targetDate.unwrap().safeParse(search.from);
  const to = weightGoalSchema.shape.targetDate.unwrap().safeParse(search.to);
  return {
    ...(search.entry === "weight" || search.entry === "meal" || search.entry === "goal" ? { entry: search.entry } : {}),
    ...(typeof search.meal === "string" && search.meal.length > 0 ? { meal: search.meal } : {}),
    ...(range === undefined ? {} : { range }),
    ...(from.success && to.success && from.data < to.data ? { from: from.data, to: to.data } : {}),
  };
};
