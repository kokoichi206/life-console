import type { CollectionCalendar, CollectionSettings, UpdateCalendarEvent } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { delay, http, HttpResponse } from "msw";
import { useMemo } from "react";
import { expect, userEvent } from "storybook/test";

import { CollectionCalendarPanel } from "./CollectionCalendarPanel";
import { parseTodoSearch } from "./todo-search";

const initialCalendar = (): CollectionCalendar => ({ settings: { district: "D", previousDayTime: "21:00", sameDayTime: null, notificationsEnabled: false },
  events: [{ id: "collection-1", source: "garbage", sourceKey: "collection-1", title: "燃やすしかないごみ", date: "2026-10-09", status: "active", notes: "午前 8 時 30 分までに出してください。", sourceUrl: "https://example.com/calendar", updatedAt: "2026-10-08T00:00:00.000Z", preparation: null }],
  validFrom: "2026-04-01", validThrough: "2027-03-31", sourceUrl: "https://example.com/calendar",
});
let calendar = initialCalendar();
const handlers = [
  http.get("*/api/v1/calendar", () => HttpResponse.json({ data: calendar })),
  http.get("*/api/v1/push/configuration", () => HttpResponse.json({ data: { publicKey: null } })),
  http.put("*/api/v1/calendar/settings", async ({ request }) => {
    const settings = await request.json() as CollectionSettings;
    calendar = { ...initialCalendar(), settings };
    return HttpResponse.json({ data: null });
  }),
  http.patch("*/api/v1/calendar/events/:id", async ({ request }) => {
    const input = await request.json() as UpdateCalendarEvent;
    calendar = { ...calendar, events: calendar.events.map((event) => ({ ...event, ...input, updatedAt: "2026-10-08T00:01:00.000Z" })) };
    return HttpResponse.json({ data: null });
  }),
  http.post("*/api/v1/calendar/events/:id/preparation", () => {
    calendar = { ...calendar, events: calendar.events.map((event) => ({ ...event, preparation: { id: "prep-1", title: "ごみを準備する", status: "todo", dueAt: "2026-10-08T23:30:00.000Z" } })) };
    return HttpResponse.json({ data: null });
  }),
  http.patch("*/api/v1/tasks/:id", () => {
    calendar = { ...calendar, events: calendar.events.map((event) => ({ ...event, preparation: { ...event.preparation!, status: "done" } })) };
    return HttpResponse.json({ data: null });
  }),
];
const meta = {
  title: "Pages/収集カレンダー", component: CollectionCalendarPanel,
  beforeEach: () => {
    calendar = initialCalendar();
  },
  parameters: { msw: { handlers } },
  decorators: [(Story) => {
    const router = useMemo(() => {
      const root = createRootRoute();
      const todos = createRoute({ getParentRoute: () => root, path: "/todos", validateSearch: parseTodoSearch, component: Story });
      return createRouter({ routeTree: root.addChildren([todos]), history: createMemoryHistory({ initialEntries: ["/todos?view=calendar&month=2026-10"] }) });
    }, [Story]);
    return <RouterProvider router={router} />;
  }],
} satisfies Meta<typeof CollectionCalendarPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Calendar: Story = {};
export const ManagePreparation: Story = { play: async ({ canvas }) => {
  await userEvent.click(await canvas.findByRole("link", { name: "10 月 9 日（金） 燃やすしかないごみ" }));
  await userEvent.click(await canvas.findByRole("button", { name: "この回の準備を追加" }));
  await userEvent.click(await canvas.findByRole("button", { name: "準備を完了する" }));
  await expect(await canvas.findByRole("button", { name: "準備を未完了に戻す" })).toBeVisible();
  const date = canvas.getByLabelText("収集日");
  await userEvent.clear(date);
  await userEvent.type(date, "2026-10-10");
  await userEvent.click(canvas.getByRole("button", { name: "収集日の変更を保存" }));
  await expect(await canvas.findByRole("heading", { name: "10 月 10 日（土）の燃やすしかないごみ" })).toBeVisible();
} };
export const Unconfigured: Story = { beforeEach: () => {
  calendar = { ...initialCalendar(), settings: null, events: [] };
}, play: async ({ canvas }) => {
  await userEvent.selectOptions(await canvas.findByLabelText("収集地区"), "D");
  await userEvent.click(canvas.getByRole("button", { name: "収集地区と通知を保存" }));
  await expect(await canvas.findByRole("table", { name: "2026-10 の収集カレンダー" })).toBeVisible();
} };
export const Loading: Story = { parameters: { msw: { handlers: [http.get("*/api/v1/calendar", async () => {
  await delay("infinite");
}), ...handlers.slice(1)] } } };
export const Failure: Story = { parameters: { msw: { handlers: [http.get("*/api/v1/calendar", () => HttpResponse.json({ error: { message: "収集日を取得できませんでした。" } }, { status: 500 })), ...handlers.slice(1)] } } };
export const Saving: Story = { parameters: { msw: { handlers: [http.put("*/api/v1/calendar/settings", async () => {
  await delay("infinite");
}), ...handlers.filter((_, index) => index !== 2)] } }, play: async ({ canvas }) => {
  await userEvent.click(await canvas.findByRole("button", { name: "収集地区と通知を保存" }));
  await expect(await canvas.findByRole("button", { name: "保存中" })).toBeDisabled();
} };
export const NarrowDark: Story = { parameters: { viewport: { options: { mobile: { name: "幅 390 px", styles: { width: "390px", height: "844px" } } } } }, globals: { viewport: { value: "mobile", isRotated: false }, theme: "dark" }, play: async ({ canvasElement }) => {
  const root = canvasElement.ownerDocument.documentElement;
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
} };
