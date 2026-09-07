export type HealthSearch = {
  readonly entry?: "weight" | "meal";
};

export const parseHealthSearch = (search: Record<string, unknown>): HealthSearch => ({
  ...(search.entry === "weight" || search.entry === "meal" ? { entry: search.entry } : {}),
});
