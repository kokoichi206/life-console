export type HealthSearch = {
  readonly entry?: "weight" | "meal";
  readonly meal?: string;
};

export const parseHealthSearch = (search: Record<string, unknown>): HealthSearch => ({
  ...(search.entry === "weight" || search.entry === "meal" ? { entry: search.entry } : {}),
  ...(typeof search.meal === "string" && search.meal.length > 0 ? { meal: search.meal } : {}),
});
