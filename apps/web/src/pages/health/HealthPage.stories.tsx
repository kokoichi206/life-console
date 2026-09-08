import type { WeightPoint, WeightGoal } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { useMemo } from "react";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import { parseHealthSearch } from "./health-search";
import { HealthRoutePage } from "./HealthRoutePage";

const weights: WeightPoint[] = [
  { id: "previous", source: "csv", weightKg: 84, occurredAt: "2026-08-31T00:00:00+09:00", recordedAt: "2026-09-07T00:00:00Z" },
  { id: "csv", source: "csv", weightKg: 80, occurredAt: "2026-09-07T00:00:00+09:00", recordedAt: "2026-09-07T00:00:00Z" },
  { id: "manual", source: "manual", weightKg: 81.4, occurredAt: "2026-09-06T23:00:00Z", recordedAt: "2026-09-07T00:00:00Z" },
];
const handlers = (entries: WeightPoint[], goal: WeightGoal | null = null) => [
  http.get("*/api/v1/weight-goal", () => HttpResponse.json({ data: goal })),
  http.put("*/api/v1/weight-goal", async ({ request }) => {
    goal = await request.json() as WeightGoal | null;
    return HttpResponse.json({ data: null });
  }),
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
export const ChartTooltipMobile: Story = {
  name: "狭い画面でも体重の詳細が切れない",
  parameters: { msw: { handlers: handlers(weights.map((point) => point.id === "csv" ? { ...point, occurredAt: "2026-09-05T00:00:00+09:00" } : point)) } },
  decorators: [(Story) => <div style={{ maxWidth: 360 }}><Story /></div>],
  play: async ({ canvas, userEvent }) => {
    const chart = await canvas.findByRole("img", { name: "体重の実測値と 7 日移動平均の推移" });
    chart.scrollIntoView({ block: "center" });
    const chartBounds = chart.getBoundingClientRect();
    for (const ratio of [0.06, 0.65, 0.98]) {
      await userEvent.pointer({ target: chart, coords: { clientX: chartBounds.left + chartBounds.width * ratio, clientY: chartBounds.top + 20 } });
      const tooltip = await canvas.findByRole("tooltip");
      const bounds = tooltip.getBoundingClientRect();
      await expect(bounds.left).toBeGreaterThanOrEqual(chartBounds.left);
      await expect(bounds.right).toBeLessThanOrEqual(chartBounds.right);
      // 通常はポインター判定の対象外なので、前面表示の検証中だけヒットテストを有効にする。
      tooltip.style.pointerEvents = "auto";
      try {
        for (const line of tooltip.children) {
          const lineBounds = line.getBoundingClientRect();
          const paintedElement = tooltip.ownerDocument.elementFromPoint(lineBounds.left + 2, lineBounds.top + lineBounds.height / 2);
          await expect(tooltip.contains(paintedElement)).toBe(true);
        }
      } finally {
        tooltip.style.pointerEvents = "";
      }
    }
    await userEvent.unhover(chart);
    await expect(canvas.queryByRole("tooltip")).not.toBeInTheDocument();
  },
};
export const ChartTooltipMobileDark: Story = { ...ChartTooltipMobile, globals: { theme: "dark" } };
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

export const Goal: Story = {
  parameters: { msw: { handlers: handlers(weights, { startWeightKg: 90, targetWeightKg: 80, targetDate: "2026-12-31" }) } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "目標を編集" }));
    const dialog = await screen.findByRole("dialog", { name: "体重の目標を設定" });
    await userEvent.clear(within(dialog).getByLabelText("目標体重 (kg)"));
    await userEvent.type(within(dialog).getByLabelText("目標体重 (kg)"), "79");
    await userEvent.click(within(dialog).getByRole("button", { name: "目標を保存" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(canvas.getByText("目標 79.0 kg")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "目標を編集" }));
    await expect(await screen.findByLabelText("目標体重 (kg)")).toHaveValue(79);
    await userEvent.click(screen.getByRole("button", { name: "目標を解除" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "目標を設定" })).toBeVisible());
  },
};
export const GoalSaveError: Story = {
  parameters: { entry: "goal", msw: { handlers: [http.put("*/api/v1/weight-goal", () => HttpResponse.json({ error: { message: "目標を保存できませんでした。" } }, { status: 500 })), ...handlers(weights)] } },
  play: async ({ canvasElement, userEvent }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.type(await screen.findByLabelText("目標体重 (kg)"), "79");
    await userEvent.click(screen.getByRole("button", { name: "目標を保存" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent("目標を保存できませんでした。");
    await expect(screen.getByLabelText("目標体重 (kg)")).toHaveValue(79);
  },
};
export const RangeControls: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "全期間" }));
    const start = canvas.getByLabelText("表示開始日");
    await expect(start).toHaveValue("2026-08-31");
    await userEvent.click(canvas.getByRole("button", { name: "表示期間を狭める" }));
    await expect(start).not.toHaveValue("2026-08-31");
    await userEvent.click(canvas.getByRole("button", { name: "体重を記録" }));
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(await screen.findByRole("button", { name: "体重の記録を閉じる" }));
    await expect(start).not.toHaveValue("2026-08-31");
  },
};

const trendWeights: WeightPoint[] = Array.from({ length: 120 }, (_, index) => ({
  id: `trend-${index}`, source: "manual", weightKg: Math.round((90 - index * 0.08 + Math.sin(index * 0.7) * 0.5) * 10) / 10,
  occurredAt: new Date(Date.UTC(2026, 4, 1 + index)).toISOString(), recordedAt: "2026-09-01T00:00:00Z",
}));
export const GoalOverview: Story = {
  parameters: { msw: { handlers: handlers(trendWeights, { startWeightKg: 90, targetWeightKg: 80, targetDate: "2026-09-30" }) } },
};

export const MobileWeightOverview: Story = {
  name: "体重・目標・グラフ（スマホ）",
  parameters: {
    ...GoalOverview.parameters,
    viewport: {
      options: {
        weightMobile: { name: "体重グラフ · 412 × 840", styles: { width: "412px", height: "840px" }, type: "mobile" },
      },
    },
  },
  globals: { viewport: { value: "weightMobile", isRotated: false } },
};

export const DragWeightPeriod: Story = {
  name: "グラフを直接動かし、最新の期間へ戻る",
  parameters: { ...GoalOverview.parameters },
  decorators: [(Story) => <div style={{ maxWidth: 390 }}><Story /></div>],
  play: async ({ canvas, canvasElement, userEvent }) => {
    const chart = await canvas.findByRole("img", { name: "体重の実測値と 7 日移動平均の推移" });
    chart.scrollIntoView({ block: "center" });
    const start = canvas.getByLabelText("表示開始日");
    const end = canvas.getByLabelText("表示終了日");
    const initialStart = (start as HTMLInputElement).value;
    const initialEnd = (end as HTMLInputElement).value;
    const bounds = chart.getBoundingClientRect();
    const origin = { clientX: bounds.left + bounds.width * 0.3, clientY: bounds.top + 150 };
    await userEvent.pointer({ target: chart, keys: "[MouseLeft>]", coords: origin });
    await userEvent.pointer({ target: chart, coords: { ...origin, clientX: origin.clientX + 45 } });
    await expect(start).toHaveValue(initialStart);
    await expect(canvas.queryByRole("tooltip")).not.toBeInTheDocument();
    await userEvent.pointer({ target: chart, keys: "[/MouseLeft]" });
    await waitFor(() => expect(start).not.toHaveValue(initialStart));
    const shiftedStart = (start as HTMLInputElement).value;
    const shiftedEnd = (end as HTMLInputElement).value;
    await expect(Date.parse(shiftedEnd) - Date.parse(shiftedStart)).toBe(Date.parse(initialEnd) - Date.parse(initialStart));
    await userEvent.click(canvas.getByRole("button", { name: "体重を記録" }));
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(await screen.findByRole("button", { name: "体重の記録を閉じる" }));
    await expect(start).toHaveValue(shiftedStart);
    await userEvent.click(canvas.getByRole("button", { name: "最新へ" }));
    await waitFor(() => expect(start).toHaveValue(initialStart));
    await expect(end).toHaveValue(initialEnd);
    chart.scrollIntoView({ block: "center" });
    const restoredBounds = chart.getBoundingClientRect();
    const restoredOrigin = { clientX: restoredBounds.left + restoredBounds.width * 0.3, clientY: restoredBounds.top + 150 };
    await userEvent.pointer({ target: chart, keys: "[MouseLeft>]", coords: restoredOrigin });
    await userEvent.pointer({ target: chart, coords: { ...restoredOrigin, clientX: restoredOrigin.clientX + 45 } });
    fireEvent.pointerCancel(chart, { pointerId: 1 });
    await userEvent.pointer({ target: chart, keys: "[/MouseLeft]" });
    await expect(start).toHaveValue(initialStart);
    await expect(end).toHaveValue(initialEnd);
  },
};

export const TapWeightDetails: Story = {
  name: "タップした体重を指を離してから読める",
  parameters: { ...GoalOverview.parameters },
  play: async ({ canvas, userEvent }) => {
    const chart = await canvas.findByRole("img", { name: "体重の実測値と 7 日移動平均の推移" });
    chart.scrollIntoView({ block: "center" });
    const bounds = chart.getBoundingClientRect();
    await userEvent.pointer({ target: chart, keys: "[MouseLeft]", coords: { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + 150 } });
    await expect(await canvas.findByRole("tooltip")).toHaveTextContent("実測");
    await userEvent.unhover(chart);
    await expect(canvas.getByRole("tooltip")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "表示期間を狭める" }));
    await expect(canvas.queryByRole("tooltip")).not.toBeInTheDocument();
  },
};
