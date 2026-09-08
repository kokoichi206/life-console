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
  http.get("*/api/v1/strava/status", () => HttpResponse.json({ data: { configured: false, athleteId: null } })),
  http.get("*/api/v1/weight-goal", () => HttpResponse.json({ data: goal })),
  http.put("*/api/v1/weight-goal", async ({ request }) => {
    goal = await request.json() as WeightGoal | null;
    return HttpResponse.json({ data: null });
  }),
  http.get("*/api/v1/weights", () => HttpResponse.json({ data: entries })),
  http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: [] })),
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
      return createRouter({ routeTree: root.addChildren([health]), history: createMemoryHistory({ initialEntries: [context.parameters.initialUrl ?? (context.parameters.entry === undefined ? "/health" : `/health?entry=${context.parameters.entry}`)] }) });
    }, [context.parameters.entry, context.parameters.initialUrl, Story]);
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
    await fireEvent.pointerCancel(chart, { pointerId: 1 });
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

export const WeeklyExerciseAndMeals: Story = {
  name: "週を選んで体重・運動・食事を一緒に振り返る",
  parameters: { initialUrl: "/health?running=show&from=2026-08-31&to=2026-09-13", msw: { handlers: [
    http.get("*/api/v1/strava/status", () => HttpResponse.json({ data: { configured: true, athleteId: 42 } })),
    http.get("*/api/v1/strava/activities", ({ request }) => HttpResponse.json({ data: new URL(request.url).searchParams.get("page") === "1"
      ? {
          activities: [{ id: "123", name: "架空の朝ラン", sportType: "Run", occurredAt: "2026-09-07T00:00:00Z", distanceMeters: 15000, movingSeconds: 5400, elapsedSeconds: 5500, averageHeartrate: 145 }], nextPage: 2,
        }
      : { activities: [], nextPage: null } })),
    http.get("*/api/v1/meals", ({ request }) => {
      const from = new URL(request.url).searchParams.get("from")!;
      return HttpResponse.json({ data: [
        { id: "current-meal", photoId: null, memo: "架空の食事メモ・今週", mealKind: "lunch", tags: [], occurredAt: "2026-09-07T03:00:00Z", recordedAt: "2026-09-07T03:00:00Z" },
        { id: "previous-meal", photoId: null, memo: "架空の食事メモ・前週", mealKind: "lunch", tags: [], occurredAt: "2026-08-31T03:00:00Z", recordedAt: "2026-08-31T03:00:00Z" },
      ].filter((meal) => meal.occurredAt.slice(0, 10) >= from) });
    }),
    ...handlers(weights),
  ] } },
  play: async ({ canvas, userEvent }) => {
    const chart = await canvas.findByRole("img", { name: "体重と週ごとの走行距離の推移" });
    await expect(chart).toHaveTextContent("15.0 km ・ 1 回");
    await expect(canvas.getByText("架空の食事メモ・前週")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "この週のランと食事を見る" }));
    await waitFor(() => expect(canvas.queryByText("架空の食事メモ・前週")).not.toBeInTheDocument());
    await expect(await canvas.findByText("架空の食事メモ・今週")).toBeVisible();
    await expect(canvas.getByLabelText("表示開始日")).toHaveValue("2026-09-07");
    await expect(canvas.getByLabelText("表示終了日")).toHaveValue("2026-09-13");
    await expect(await canvas.findByText("架空の朝ラン")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "2026/9/7 12:00 の昼食を開く" }));
  },
};

const combinedTrendHandlers = [
  http.get("*/api/v1/strava/status", () => HttpResponse.json({ data: { configured: true, athleteId: 42 } })),
  http.get("*/api/v1/strava/activities", ({ request }) => HttpResponse.json({ data: {
    activities: new URL(request.url).searchParams.get("page") === "1"
      ? Array.from({ length: 12 }, (_, index) => ({
          id: `synthetic-${index}`, name: "架空のランニング", sportType: "Run", occurredAt: new Date(Date.UTC(2026, 5, 15 + index * 7)).toISOString(),
          distanceMeters: [10000, 18000, 0, 22000, 15000, 0, 9000, 19000, 25000, 8000, 16000, 23000][index]!, movingSeconds: 3600, elapsedSeconds: 3700, averageHeartrate: 145,
        })).filter((run) => run.distanceMeters > 0)
      : [], nextPage: new URL(request.url).searchParams.get("page") === "1" ? 2 : null,
  } })),
  ...handlers(trendWeights),
];
export const CombinedTrendOverview: Story = {
  name: "体重の線と週の走行距離を重ねる",
  parameters: { initialUrl: "/health?running=show&from=2026-06-12&to=2026-09-09", msw: { handlers: combinedTrendHandlers } },
  play: async ({ canvas, userEvent }) => {
    const chart = await canvas.findByRole("img", { name: "体重と週ごとの走行距離の推移" });
    await expect(canvas.getByText("この週の体重記録はありません")).toBeVisible();
    chart.scrollIntoView({ block: "center" });
    const bounds = chart.getBoundingClientRect();
    await userEvent.pointer({ target: chart, keys: "[MouseLeft]", coords: { clientX: bounds.left + bounds.width * 0.65, clientY: bounds.top + 180 } });
    await expect(canvas.getByRole("tooltip")).toBeVisible();
    await userEvent.unhover(chart);
    await expect(canvas.getByRole("button", { name: "この週のランと食事を見る" })).toBeVisible();
  },
};
export const CombinedTrendDark: Story = { ...CombinedTrendOverview, globals: { theme: "dark" } };
export const CombinedTrendMobile: Story = { ...CombinedTrendOverview, parameters: { ...CombinedTrendOverview.parameters, viewport: MobileWeightOverview.parameters?.viewport }, globals: { viewport: { value: "weightMobile", isRotated: false } } };
export const CombinedTrendMobileDark: Story = { ...CombinedTrendMobile, globals: { ...CombinedTrendMobile.globals, theme: "dark" } };
export const ExerciseFetchFailure: Story = {
  name: "運動の取得が途中で失敗したら棒グラフを出さない",
  parameters: { initialUrl: "/health?running=show", msw: { handlers: [
    http.get("*/api/v1/strava/status", () => HttpResponse.json({ data: { configured: true, athleteId: 42 } })),
    http.get("*/api/v1/strava/activities", ({ request }) => new URL(request.url).searchParams.get("page") === "1"
      ? HttpResponse.json({ data: { activities: [{ id: "synthetic-run", name: "架空のラン", sportType: "Run", occurredAt: "2026-09-07T00:00:00Z", distanceMeters: 15000, movingSeconds: 5400, elapsedSeconds: 5500, averageHeartrate: null }], nextPage: 2 } })
      : HttpResponse.json({ error: { message: "Strava の取得に失敗しました。" } }, { status: 502 })),
    ...handlers(weights),
  ] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/期間全体を取得できていないため/)).toBeVisible();
    await expect(canvas.queryByRole("img", { name: "体重と週ごとの走行距離の推移" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("img", { name: "体重の実測値と 7 日移動平均の推移" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "この週のランと食事を見る" })).not.toBeInTheDocument();
  },
};

export const RunningWithoutWeight: Story = {
  name: "体重未記録でも走行距離を表示する",
  parameters: { initialUrl: "/health?running=show&from=2026-06-12&to=2026-09-09", msw: { handlers: [
    http.get("*/api/v1/weights", () => HttpResponse.json({ data: [] })), ...combinedTrendHandlers,
  ] } },
  play: async ({ canvas }) => {
    const chart = await canvas.findByRole("img", { name: "体重と週ごとの走行距離の推移" });
    await expect(chart).toBeVisible();
    await expect(chart).toHaveTextContent("25.0 km ・ 1 回");
    await expect(canvas.getByText("この週の体重記録はありません")).toBeVisible();
    await expect(canvas.queryByText("表示できる体重記録がありません。")).not.toBeInTheDocument();
  },
};

export const OptionalRunningOverlay: Story = {
  name: "必要なときだけ走行距離を重ねる",
  parameters: { initialUrl: "/health?from=2026-06-12&to=2026-09-09", msw: { handlers: combinedTrendHandlers } },
  play: async ({ canvas, userEvent }) => {
    const toggle = await canvas.findByRole("button", { name: "走行距離を重ねる" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(canvas.getByRole("img", { name: "体重の実測値と 7 日移動平均の推移" })).toBeVisible();
    await userEvent.click(toggle);
    await expect(await canvas.findByRole("img", { name: "体重と週ごとの走行距離の推移" })).toBeVisible();
    await expect(canvas.getByLabelText("表示開始日")).toHaveValue("2026-06-12");
    await expect(canvas.getByLabelText("表示終了日")).toHaveValue("2026-09-09");
    await userEvent.click(canvas.getByRole("button", { name: "30 日" }));
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(await canvas.findByRole("img", { name: "体重と週ごとの走行距離の推移" })).toBeVisible();
    const start = (canvas.getByLabelText("表示開始日") as HTMLInputElement).value;
    const end = (canvas.getByLabelText("表示終了日") as HTMLInputElement).value;
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(canvas.getByRole("img", { name: "体重の実測値と 7 日移動平均の推移" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "この週のランと食事を見る" })).not.toBeInTheDocument();
    await expect(canvas.getByLabelText("表示開始日")).toHaveValue(start);
    await expect(canvas.getByLabelText("表示終了日")).toHaveValue(end);
  },
};
