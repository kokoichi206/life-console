import { useNavigate, useSearch } from "@tanstack/react-router";

import { HealthPage } from "./HealthPage";

export const HealthRoutePage = () => {
  const search = useSearch({ from: "/health" });
  const navigate = useNavigate({ from: "/health" });
  return (
    <HealthPage
      search={search}
      onRangeChange={(range) => {
        void navigate({ search: { ...search, range: undefined, from: undefined, to: undefined, ...range }, replace: true, resetScroll: false });
      }}
      onRunningVisibilityChange={(show) => {
        void navigate({ search: { ...search, running: show ? "show" : undefined }, replace: true, resetScroll: false });
      }}
      goalEntryOpen={search.entry === "goal"}
      onGoalEntryOpenChange={(open) => {
        void navigate({ search: { ...search, entry: open ? "goal" : undefined, meal: undefined }, replace: !open, resetScroll: false });
      }}
      selectedMealId={search.entry === undefined ? search.meal : undefined}
      onSelectMeal={(id) => {
        void navigate({ search: { ...search, meal: id, entry: undefined }, replace: id === undefined, resetScroll: false });
      }}
      mealEntryOpen={search.entry === "meal"}
      onMealEntryOpenChange={(open) => {
        void navigate({ search: { ...search, entry: open ? "meal" : undefined, meal: undefined }, replace: !open, resetScroll: false });
      }}
      weightEntryOpen={search.entry === "weight"}
      onWeightEntryOpenChange={(open) => {
        void navigate({ search: { ...search, entry: open ? "weight" : undefined, meal: undefined }, replace: !open, resetScroll: false });
      }}
    />
  );
};
