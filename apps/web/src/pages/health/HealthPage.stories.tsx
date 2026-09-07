import type { WeightPoint } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { useMemo } from "react";
import { expect, waitFor, within } from "storybook/test";

import { parseHealthSearch } from "./health-search";
import { HealthRoutePage } from "./HealthRoutePage";

const weights: WeightPoint[] = [
  { id: "previous", source: "csv", weightKg: 84, occurredAt: "2026-08-31T00:00:00+09:00", recordedAt: "2026-09-07T00:00:00Z" },
  { id: "csv", source: "csv", weightKg: 80, occurredAt: "2026-09-07T00:00:00+09:00", recordedAt: "2026-09-07T00:00:00Z" },
  { id: "manual", source: "manual", weightKg: 81.4, occurredAt: "2026-09-06T23:00:00Z", recordedAt: "2026-09-07T00:00:00Z" },
];
const handlers = (entries: WeightPoint[]) => [
  http.get("*/api/v1/weights", () => HttpResponse.json({ data: entries })),
  http.get("*/api/v1/meals", () => HttpResponse.json({ data: [] })),
];
const meta = {
  title: "Pages/健康",
  component: HealthRoutePage,
  parameters: { msw: { handlers: handlers(weights) } },
  decorators: [(Story, context) => {
    const router = useMemo(() => {
      const root = createRootRoute();
      const health = createRoute({ getParentRoute: () => root, path: "/health", validateSearch: parseHealthSearch, component: Story });
      return createRouter({ routeTree: root.addChildren([health]), history: createMemoryHistory({ initialEntries: [context.parameters.entry === undefined ? "/health" : `/health?entry=${context.parameters.entry}`] }) });
    }, [context.parameters.entry]);
    return <RouterProvider router={router} />;
  }],
} satisfies Meta<typeof HealthRoutePage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Recorded: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByRole("button", { name: "体重を記録" })).toBeVisible();
    await expect(canvas.getByRole("group", { name: "表示期間" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "表で見る" }));
    await expect(canvas.getByRole("table")).toHaveTextContent("80.70");
    await expect(canvas.getByText("25%")).toBeVisible();
  },
};
export const Empty: Story = { parameters: { msw: { handlers: handlers([]) } } };
export const Dark: Story = { globals: { theme: "dark" } };
export const WeightEntryOpen: Story = { name: "URL から体重記録を開く", parameters: { entry: "weight" } };

export const MealEntryOpen: Story = {
  name: "URL から食事記録を開く",
  parameters: { entry: "meal" },
  play: async ({ canvasElement, userEvent }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await expect(await screen.findByRole("dialog", { name: "食事を記録" })).toBeVisible();
    await expect(screen.queryByRole("dialog", { name: "体重を記録" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "食事の記録を閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "体重を記録" }));
    await expect(await screen.findByRole("dialog", { name: "体重を記録" })).toBeVisible();
  },
};
