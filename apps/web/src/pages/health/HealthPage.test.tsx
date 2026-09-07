import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HealthPage } from "./HealthPage";
import { mealsQuery, weightsQuery } from "./queries";

describe("体重の記録頻度", () => {
  it("同じ日本時間の暦日の複数記録を 1 日として数える", () => {
    const client = new QueryClient();
    client.setQueryData(weightsQuery.queryKey, [
      { id: "previous", source: "csv", weightKg: 100, occurredAt: "2026-08-31T00:00:00+09:00", recordedAt: "2026-09-07T00:00:00Z" },
      { id: "csv", source: "csv", weightKg: 80, occurredAt: "2026-09-07T00:00:00+09:00", recordedAt: "2026-09-07T00:00:00Z" },
      { id: "manual", source: "manual", weightKg: 82, occurredAt: "2026-09-06T23:00:00Z", recordedAt: "2026-09-07T00:00:00Z" },
    ]);
    client.setQueryData(mealsQuery.queryKey, []);
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client, children: createElement(HealthPage, { mealEntryOpen: false, onMealEntryOpenChange: () => undefined, weightEntryOpen: false, onWeightEntryOpenChange: () => undefined }) }));
    expect(html.replace(/<[^>]*>/g, "").replace(/\s+/g, "")).toContain("記録頻度2/8日25%");
    client.clear();
  });
});
