import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { useMemo } from "react";
import { expect, within } from "storybook/test";

import { parseSharedHealthSearch } from "./health-search";
import { SharedHealthRoutePage } from "./SharedHealthRoutePage";

const token = "ab".repeat(32);
const prefix = `*/api/v1/share/${token}`;
const meal = { id: "shared-meal", photoId: "shared-photo", memo: "架空の食事", occurredAt: "2026-09-01T00:00:00Z", recordedAt: "2026-09-01T00:00:00Z", tags: [] };
const meta = {
  title: "Pages/健康の共有",
  component: SharedHealthRoutePage,
  parameters: { msw: { handlers: [
    http.get(`${prefix}/weights`, () => HttpResponse.json({ data: [{ id: "shared-weight", source: "manual", weightKg: 65, bodyFatPercent: null, occurredAt: "2026-09-01T00:00:00Z", recordedAt: "2026-09-01T00:00:00Z" }] })),
    http.get(`${prefix}/weight-goal`, () => HttpResponse.json({ data: null })),
    http.get(`${prefix}/calorie-baseline`, () => HttpResponse.json({ data: null })),
    http.get(`${prefix}/meal-day-counts`, () => HttpResponse.json({ data: [{ occurredAt: "2026-09-01", count: 1 }] })),
    http.get(`${prefix}/meal-gallery`, () => HttpResponse.json({ data: { meals: [meal], nextTo: null } })),
    http.get(`${prefix}/nutrition`, () => HttpResponse.json({ data: [{ mealId: meal.id, photoId: meal.photoId, occurredAt: meal.occurredAt, manualCaloriesKcal: 500, estimate: null, analysisStatus: null, analysisSummary: null }] })),
    http.get(`${prefix}/strava/status`, () => HttpResponse.json({ data: { configured: true, athleteId: 42 } })),
    http.get(`${prefix}/strava/activities`, () => HttpResponse.json({ data: { activities: [], nextPage: null } })),
    http.get(`${prefix}/strava/calories`, () => HttpResponse.json({ data: [] })),
    http.get(`${prefix}/strava/calories/sync-status`, () => HttpResponse.json({ data: { lastJob: null, backfill: null } })),
    http.get(`${prefix}/meal-photos/:id/content`, () => new HttpResponse("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\"><rect width=\"100\" height=\"100\" fill=\"#b0bea0\"/></svg>", { headers: { "Content-Type": "image/svg+xml" } })),
  ] } },
  decorators: [(Story) => {
    const router = useMemo(() => {
      const root = createRootRoute();
      const share = createRoute({ getParentRoute: () => root, path: "/share/health/$token", validateSearch: parseSharedHealthSearch, component: Story });
      return createRouter({ routeTree: root.addChildren([share]), search: { strict: true }, history: createMemoryHistory({ initialEntries: [`/share/health/${token}?from=2026-09-01&to=2026-09-18&entry=weight`] }) });
    }, [Story]);
    return <RouterProvider router={router} />;
  }],
} satisfies Meta<typeof SharedHealthRoutePage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnly: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findByText(/読み取り専用です/)).toBeVisible();
    for (const name of ["体重", "食事", "目標を設定", "運動を同期", "接続を解除", "未解析の食事をまとめて解析"]) {
      await expect(await canvas.findByRole("button", { name: new RegExp(`^${name}$`) })).toBeDisabled();
    }
    await expect(canvas.getByLabelText("CSV を取り込む")).toBeDisabled();
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "共有リンク" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "30 日" }));
    await expect(canvas.getByRole("button", { name: "30 日" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "表で見る" }));
    await expect(canvas.getByRole("table", { name: "体重の推移" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "全期間" }));
    await userEvent.click(await canvas.findByRole("button", { name: /の食事を開く/ }));
    const screen = within(canvasElement.ownerDocument.body);
    const dialog = within(await screen.findByRole("dialog", { name: "食事の記録" }));
    await expect(dialog.getByRole("button", { name: "カロリーを保存" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "栄養を解析" })).toBeDisabled();
    await expect(dialog.getByRole("img", { name: "食事の写真" })).toHaveAttribute("src", `/api/v1/share/${token}/meal-photos/shared-photo/content`);
    await userEvent.click(dialog.getByRole("button", { name: "食事の詳細を閉じる" }));
  },
};
export const Dark: Story = { globals: { theme: "dark" } };
export const Narrow: Story = { decorators: [(Story) => <div className="max-w-[375px]"><Story /></div>] };
