import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HealthPage } from "./HealthPage";
import { calorieBaselineQuery, mealsQuery, weightsQuery, weightGoalQuery } from "./queries";

describe("体重の記録頻度", () => {
  it("同じ日本時間の暦日の複数記録を 1 日として数える", () => {
    const client = new QueryClient();
    client.setQueryData(weightsQuery.queryKey, [
      { id: "previous", source: "csv", bodyFatPercent: null, weightKg: 100, occurredAt: "2026-08-31T00:00:00+09:00", recordedAt: "2026-09-07T00:00:00Z" },
      { id: "csv", source: "csv", bodyFatPercent: null, weightKg: 80, occurredAt: "2026-09-07T00:00:00+09:00", recordedAt: "2026-09-07T00:00:00Z" },
      { id: "manual", source: "manual", bodyFatPercent: null, weightKg: 82, occurredAt: "2026-09-06T23:00:00Z", recordedAt: "2026-09-07T00:00:00Z" },
    ]);
    client.setQueryData(mealsQuery.queryKey, []);
    client.setQueryData(weightGoalQuery.queryKey, null);
    client.setQueryData(calorieBaselineQuery.queryKey, null);
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client, children: createElement(HealthPage, { search: {}, onRangeChange: () => undefined, onOverlayChange: () => undefined, caloriesExpanded: false, onCaloriesExpandedChange: () => undefined, goalEntryOpen: false, onGoalEntryOpenChange: () => undefined, baselineEntryOpen: false, onBaselineEntryOpenChange: () => undefined, selectedMealId: undefined, onSelectMeal: () => undefined, mealEntryOpen: false, onMealEntryOpenChange: () => undefined, weightEntryOpen: false, onWeightEntryOpenChange: () => undefined }) }));
    expect(html.replace(/<[^>]*>/g, "").replace(/\s+/g, "")).toContain("記録頻度2/8日25%");
    client.clear();
  });

  it("最新の体重記録より後の日付を表示期間に含めない", () => {
    const client = new QueryClient();
    client.setQueryData(weightsQuery.queryKey, [
      { id: "latest", source: "manual", bodyFatPercent: null, weightKg: 80, occurredAt: "2026-09-07T00:00:00+09:00", recordedAt: "2026-09-07T00:00:00Z" },
    ]);
    client.setQueryData(mealsQuery.queryKey, []);
    client.setQueryData(weightGoalQuery.queryKey, null);
    client.setQueryData(calorieBaselineQuery.queryKey, null);
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client, children: createElement(HealthPage, { search: { from: "2026-08-01", to: "2026-12-31" }, onRangeChange: () => undefined, onOverlayChange: () => undefined, caloriesExpanded: false, onCaloriesExpandedChange: () => undefined, goalEntryOpen: false, onGoalEntryOpenChange: () => undefined, baselineEntryOpen: false, onBaselineEntryOpenChange: () => undefined, selectedMealId: undefined, onSelectMeal: () => undefined, mealEntryOpen: false, onMealEntryOpenChange: () => undefined, weightEntryOpen: false, onWeightEntryOpenChange: () => undefined }) }));
    expect(html).toMatch(/aria-label="表示終了日"[^>]*value="2026-09-07"/);
    client.clear();
  });
});
