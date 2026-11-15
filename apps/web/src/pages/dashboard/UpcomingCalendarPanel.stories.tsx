import type { CalendarEvent, CollectionCalendar } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { delay, http, HttpResponse } from "msw";
import { useMemo } from "react";
import { expect, userEvent } from "storybook/test";

import { japanDate } from "../../features/calendar/upcoming-calendar";
import { parseTodoSearch } from "../todos/todo-search";

import { UpcomingCalendarPanel } from "./UpcomingCalendarPanel";

const initialCalendar = (): CollectionCalendar => {
  const today = japanDate();
  const tomorrow = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
  const event = (id: string, date: string, title: string): CalendarEvent => ({ id, date, title, source: "garbage", sourceKey: id, status: "active", notes: "", sourceUrl: "https://example.com/calendar", updatedAt: "2026-10-09T00:00:00Z", preparation: null });
  return { settings: { district: "D", previousDayTime: null, sameDayTime: null, notificationsEnabled: false }, validFrom: today, validThrough: tomorrow, sourceUrl: "https://example.com/calendar",
    events: [{ ...event("today", today, "燃やすしかないごみ"), preparation: { id: "prep-today", title: "ごみをまとめる", status: "todo", dueAt: `${today}T08:30:00+09:00` } }, event("tomorrow", tomorrow, "ペットボトル")],
  };
};
let calendar = initialCalendar();
const handlers = [
  http.get("*/api/v1/calendar", () => HttpResponse.json({ data: calendar })),
  http.patch("*/api/v1/tasks/:id", () => {
    calendar = { ...calendar, events: calendar.events.map((event) => event.preparation === null ? event : { ...event, preparation: { ...event.preparation, status: "done" } }) };
    return HttpResponse.json({ data: null });
  }),
];
const meta = {
  title: "Pages/ホームの予定と準備", component: UpcomingCalendarPanel,
  beforeEach: () => { calendar = initialCalendar(); },
  parameters: { msw: { handlers } },
  decorators: [(Story) => {
    const router = useMemo(() => {
      const root = createRootRoute();
      const home = createRoute({ getParentRoute: () => root, path: "/", component: Story });
      const todos = createRoute({ getParentRoute: () => root, path: "/todos", validateSearch: parseTodoSearch, component: () => <p>カレンダー詳細</p> });
      return createRouter({ routeTree: root.addChildren([home, todos]), history: createMemoryHistory({ initialEntries: ["/"] }) });
    }, [Story]);
    return <RouterProvider router={router} />;
  }],
} satisfies Meta<typeof UpcomingCalendarPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TodayAndTomorrow: Story = { play: async ({ canvas }) => {
  await expect(await canvas.findByRole("link", { name: "ごみをまとめる" })).toBeVisible();
  await expect(await canvas.findByRole("link", { name: "ペットボトル" })).toBeVisible();
} };
export const CompletePreparation: Story = { play: async ({ canvas }) => {
  await userEvent.click(await canvas.findByRole("button", { name: "ごみをまとめるを完了する" }));
  await expect(await canvas.findByText("準備完了")).toBeVisible();
  await expect(canvas.queryByRole("button", { name: "ごみをまとめるを完了する" })).not.toBeInTheDocument();
  await userEvent.click(canvas.getByRole("link", { name: "燃やすしかないごみ" }));
  await expect(await canvas.findByText("カレンダー詳細")).toBeVisible();
} };
export const Empty: Story = { beforeEach: () => {
  calendar = { ...initialCalendar(), events: [] };
} };
export const Unconfigured: Story = { beforeEach: () => {
  calendar = { ...initialCalendar(), settings: null, events: [] };
} };
export const OutsidePeriod: Story = { beforeEach: () => {
  calendar = { ...initialCalendar(), validThrough: "2020-03-31", events: [] };
} };
export const LastCollectionDay: Story = { beforeEach: () => {
  const initial = initialCalendar();
  calendar = { ...initial, validThrough: initial.validFrom };
}, play: async ({ canvas }) => {
  await expect(await canvas.findByRole("link", { name: "燃やすしかないごみ" })).toBeVisible();
  await expect(await canvas.findByText("この日の収集日程は未登録です。公式の日程を確認してください。")).toBeVisible();
} };
export const Loading: Story = { parameters: { msw: { handlers: [http.get("*/api/v1/calendar", async () => {
  await delay("infinite");
})] } } };
export const Failure: Story = { parameters: { msw: { handlers: [http.get("*/api/v1/calendar", () => HttpResponse.json({ error: { message: "予定の取得に失敗しました。" } }, { status: 500 }))] } } };
export const Saving: Story = { parameters: { msw: { handlers: [handlers[0]!, http.patch("*/api/v1/tasks/:id", async () => {
  await delay("infinite");
})] } }, play: async ({ canvas }) => {
  await userEvent.click(await canvas.findByRole("button", { name: "ごみをまとめるを完了する" }));
  await expect(await canvas.findByRole("button", { name: "ごみをまとめるを完了する" })).toBeDisabled();
  await expect(canvas.getByText("保存中")).toBeVisible();
} };
export const NarrowDark: Story = { parameters: { viewport: { options: { mobile: { name: "幅 390 px", styles: { width: "390px", height: "844px" } } } } }, globals: { viewport: { value: "mobile", isRotated: false }, theme: "dark" }, play: async ({ canvas, canvasElement }) => {
  await canvas.findByRole("link", { name: "燃やすしかないごみ" });
  const root = canvasElement.ownerDocument.documentElement;
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
} };
