import { useNavigate, useSearch } from "@tanstack/react-router";

import { HealthPage } from "./HealthPage";

export const HealthRoutePage = () => {
  const search = useSearch({ from: "/health" });
  const navigate = useNavigate({ from: "/health" });
  return (
    <HealthPage
      weightEntryOpen={search.entry === "weight"}
      onWeightEntryOpenChange={(open) => {
        void navigate({ search: open ? { entry: "weight" } : {}, replace: !open, resetScroll: false });
      }}
    />
  );
};
