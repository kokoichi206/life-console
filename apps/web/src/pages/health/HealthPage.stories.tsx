import type { WeightPoint } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect } from "storybook/test";

import { HealthPage } from "./HealthPage";

const weights: WeightPoint[] = [
  { id: "previous", source: "csv", weightKg: 84, occurredAt: "2026-08-31T00:00:00+09:00", recordedAt: "2026-09-07T00:00:00Z" },
  { id: "csv", source: "csv", weightKg: 80, occurredAt: "2026-09-07T00:00:00+09:00", recordedAt: "2026-09-07T00:00:00Z" },
  { id: "manual", source: "manual", weightKg: 82, occurredAt: "2026-09-06T23:00:00Z", recordedAt: "2026-09-07T00:00:00Z" },
];
const handlers = (entries: WeightPoint[]) => [
  http.get("*/api/v1/weights", () => HttpResponse.json({ data: entries })),
  http.get("*/api/v1/meals", () => HttpResponse.json({ data: [] })),
];
const meta = { title: "Pages/健康", component: HealthPage, parameters: { msw: { handlers: handlers(weights) } } } satisfies Meta<typeof HealthPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Recorded: Story = {
  play: async ({ canvas, userEvent }) => {
    const field = await canvas.findByRole("spinbutton", { name: "体重 (kg)" });
    await expect(field).toHaveValue(82);
    await expect(canvas.getByRole("group", { name: "表示期間" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "表で見る" }));
    await expect(canvas.getByRole("table")).toHaveTextContent("81.00");
    await expect(canvas.getByText("25%")).toBeVisible();
  },
};
export const Empty: Story = { parameters: { msw: { handlers: handlers([]) } } };
export const Dark: Story = { globals: { theme: "dark" } };
