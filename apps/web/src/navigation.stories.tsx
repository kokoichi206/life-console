import type { Dashboard } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { useMemo } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { router } from "./router";

const dashboard: Dashboard = {
  todayTasks: [], conversations: [], runners: [], connectors: [], recentJobs: [], delayedJobCount: 0, weights: [],
  finance: { incomeYen: 0, expenseYen: 0, netCashflowYen: 0, netWorthYen: 0, byCategory: [], byPaymentMethod: [], assetAllocation: [], transactions: [], adjustments: [], assetHistory: [] },
};
const abstinence = { goal: null, events: [], totalEventDurationMinutes: 0, currentStreakDays: 0, longestStreakDays: 0 };
const createResponseGate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
};
let dashboardResponse = createResponseGate();
let abstinenceResponse = createResponseGate();
const dashboardRequest = fn();
let navigationClient: QueryClient;

const NavigationPreview = () => {
  const queryClient = useQueryClient();
  const testRouter = useMemo(() => {
    navigationClient = queryClient;
    return createRouter({ ...router.options, history: createMemoryHistory({ initialEntries: ["/health"] }), context: { queryClient } });
  }, [queryClient]);
  return <RouterProvider router={testRouter} />;
};

const meta = {
  title: "Pages/タブの切り替え",
  component: NavigationPreview,
  parameters: { layout: "fullscreen", hasMainLandmark: true, msw: { handlers: [
    http.get("*/api/v1/dashboard", async () => {
      dashboardRequest();
      await dashboardResponse.promise;
      return HttpResponse.json({ data: dashboard });
    }),
    http.get("*/api/v1/abstinence", async () => {
      await abstinenceResponse.promise;
      return HttpResponse.json({ data: abstinence });
    }),
    http.get("*/api/v1/monitoring", () => HttpResponse.json({ data: { targets: [], lastMaintenanceAt: null } })),
    http.get("*/api/v1/calendar", () => HttpResponse.json({ data: { settings: null, events: [] } })),
    http.get("*/api/v1/strava/status", () => HttpResponse.json({ data: { configured: false, athleteId: null } })),
    http.get("*/api/v1/meal-gallery", () => HttpResponse.json({ data: { meals: [], nextTo: null } })),
    ...["weight-goal", "calorie-baseline", "health-share"].map((resource) => http.get(`*/api/v1/${resource}`, () => HttpResponse.json({ data: null }))),
    ...["weights", "meals", "meal-day-counts", "nutrition", "agent-questions"].map((resource) => http.get(`*/api/v1/${resource}`, () => HttpResponse.json({ data: [] }))),
  ] } },
  beforeEach: () => {
    dashboardResponse = createResponseGate();
    abstinenceResponse = createResponseGate();
    dashboardRequest.mockClear();
    return () => {
      dashboardResponse.resolve();
      abstinenceResponse.resolve();
    };
  },
} satisfies Meta<typeof NavigationPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SlowHome: Story = {
  name: "健康からホーム・部分読み込み・空状態・キャッシュ再訪",
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("heading", { name: "体重・運動・食事" });
    const navigation = within(canvas.getByRole("navigation", { name: "メインナビゲーション" }));
    await userEvent.click(navigation.getByRole("link", { name: "ホーム" }));
    await expect(await canvas.findByRole("heading", { name: "ホーム" })).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("ホームを読み込んでいます。");
    await expect(canvas.queryByRole("heading", { name: "体重・運動・食事" })).not.toBeInTheDocument();
    await expect(navigation.getByRole("link", { name: "ホーム" })).toHaveClass("bg-sidebar-primary");

    dashboardResponse.resolve();
    await expect(await canvas.findByText("未完了のタスク", { exact: true })).toBeVisible();
    await expect(canvas.getByText("禁欲記録を読み込んでいます。")).toBeVisible();
    abstinenceResponse.resolve();
    await expect(await canvas.findByRole("button", { name: "禁欲目標を設定" })).toBeVisible();
    await expect(canvas.getByText("未完了のタスクはありません。")).toBeVisible();

    await userEvent.click(navigation.getByRole("link", { name: "健康" }));
    await expect(await canvas.findByText("表示できる体重記録がありません。")).toBeVisible();
    await navigationClient.invalidateQueries({ queryKey: ["dashboard"], refetchType: "none" });
    dashboardResponse = createResponseGate();
    abstinenceResponse = createResponseGate();
    dashboardRequest.mockClear();
    await userEvent.click(navigation.getByRole("link", { name: "ホーム" }));
    await expect(await canvas.findByText("未完了のタスクはありません。")).toBeVisible();
    await waitFor(() => expect(dashboardRequest).toHaveBeenCalled());
    await expect(canvas.queryByText("ホームを読み込んでいます。")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "禁欲目標を設定" })).toBeVisible();
    dashboardResponse.resolve();
    abstinenceResponse.resolve();
  },
};

export const InterruptedNavigation: Story = {
  name: "読み込み中に健康へ戻り、古い応答でホームへ戻されない",
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("heading", { name: "体重・運動・食事" });
    const navigation = within(canvas.getByRole("navigation", { name: "メインナビゲーション" }));
    await userEvent.click(navigation.getByRole("link", { name: "ホーム" }));
    await canvas.findByText("ホームを読み込んでいます。");
    await userEvent.click(navigation.getByRole("link", { name: "健康" }));
    await expect(await canvas.findByRole("heading", { name: "体重・運動・食事" })).toBeVisible();
    dashboardResponse.resolve();
    abstinenceResponse.resolve();
    await expect(await canvas.findByText("表示できる体重記録がありません。")).toBeVisible();
    await expect(navigation.getByRole("link", { name: "健康" })).toHaveClass("bg-sidebar-primary");
    await expect(canvas.queryByRole("heading", { name: "ホーム" })).not.toBeInTheDocument();
  },
};

export const NarrowHome: Story = {
  ...SlowHome,
  name: "狭い画面のタブ切り替え",
  parameters: { viewport: { options: { mobile: { name: "幅 320 px", styles: { width: "320px", height: "840px" } } } } },
  globals: { viewport: { value: "mobile", isRotated: false } },
};
export const NarrowHomeDark: Story = { ...NarrowHome, globals: { ...NarrowHome.globals, theme: "dark" } };

export const HomeFailure: Story = {
  name: "取得失敗から再読み込みで復帰",
  parameters: { msw: { handlers: [http.get("*/api/v1/dashboard", () => {
    dashboardRequest();
    return dashboardRequest.mock.calls.length === 1
      ? HttpResponse.json({ error: { message: "ホームの取得に失敗しました。" } }, { status: 503 })
      : HttpResponse.json({ data: dashboard });
  })] } },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("heading", { name: "体重・運動・食事" });
    const navigation = within(canvas.getByRole("navigation", { name: "メインナビゲーション" }));
    await userEvent.click(navigation.getByRole("link", { name: "ホーム" }));
    await expect(await canvas.findByRole("heading", { name: "データを読み込めませんでした。" })).toBeVisible();
    abstinenceResponse.resolve();
    await userEvent.click(canvas.getByRole("button", { name: "再読み込み" }));
    await expect(await canvas.findByText("未完了のタスクはありません。")).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "ホーム" })).toBeVisible();
  },
};
