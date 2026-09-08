import { useNavigate, useSearch } from "@tanstack/react-router";

import { HealthPage } from "./HealthPage";

export const HealthRoutePage = () => {
  const search = useSearch({ from: "/health" });
  const navigate = useNavigate({ from: "/health" });
  return (
    <HealthPage
      selectedMealId={search.entry === undefined ? search.meal : undefined}
      onSelectMeal={(id) => {
        void navigate({ search: id === undefined ? {} : { meal: id }, replace: id === undefined, resetScroll: false });
      }}
      mealEntryOpen={search.entry === "meal"}
      onMealEntryOpenChange={(open) => {
        void navigate({ search: open ? { entry: "meal" } : {}, replace: !open, resetScroll: false });
      }}
      weightEntryOpen={search.entry === "weight"}
      onWeightEntryOpenChange={(open) => {
        void navigate({ search: open ? { entry: "weight" } : {}, replace: !open, resetScroll: false });
      }}
    />
  );
};
