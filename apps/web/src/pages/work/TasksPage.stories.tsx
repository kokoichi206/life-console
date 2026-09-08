import type { Conversation } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { useMemo } from "react";
import { expect } from "storybook/test";

import { TasksPage } from "./TasksPage";
import { parseWorkSearch } from "./work-search";

const conversations: Conversation[] = [{ id: "story-conversation", connector: "slack", sourceId: "example/C1", externalMessageId: "100", authorLabel: "テストの依頼者", excerpt: "来週の打ち合わせ候補を確認できますか。", occurredAt: "2026-09-08T00:00:00Z", sourceUrl: null, classification: "unprocessed" }];
const handlers = (entries: Conversation[], draftFailure = false) => [
  http.get("*/api/v1/conversations", () => HttpResponse.json({ data: entries })),
  http.get("*/api/v1/reply-drafts", () => draftFailure ? HttpResponse.json({ error: { message: "下書きの取得に失敗しました。" } }, { status: 503 }) : HttpResponse.json({ data: [] })),
  ...["tasks", "repositories", "jobs", "source-repository-mappings"].map((resource) => http.get(`*/api/v1/${resource}`, () => HttpResponse.json({ data: [] }))),
];

const meta = {
  title: "Pages/仕事",
  component: TasksPage,
  parameters: { msw: { handlers: handlers(conversations) } },
  decorators: [(Story) => {
    const router = useMemo(() => {
      const root = createRootRoute();
      const tasks = createRoute({ getParentRoute: () => root, path: "/tasks", validateSearch: parseWorkSearch, component: Story });
      return createRouter({ routeTree: root.addChildren([tasks]), history: createMemoryHistory({ initialEntries: ["/tasks"] }) });
    }, [Story]);
    return <div className="flex h-[900px] flex-col"><RouterProvider router={router} /></div>;
  }],
} satisfies Meta<typeof TasksPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Inbox: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "テストの依頼者" })).toBeVisible();
  },
};
export const Empty: Story = { parameters: { msw: { handlers: handlers([]) } } };
export const DraftFailure: Story = {
  parameters: { msw: { handlers: handlers(conversations, true) } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "テストの依頼者" })).toBeVisible();
    await expect(await canvas.findByText("下書きの取得に失敗しました。返信状況は未確認です。")).toBeVisible();
  },
};
