import type { Conversation, Task } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { delay, http, HttpResponse } from "msw";
import { useMemo } from "react";
import { expect, within } from "storybook/test";

import { router as appRouter } from "../../router";

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
  decorators: [(Story, context) => {
    const router = useMemo(() => {
      const root = createRootRoute();
      const tasks = createRoute({ getParentRoute: () => root, path: "/tasks", validateSearch: parseWorkSearch, component: Story });
      return createRouter({
        search: { ...appRouter.options.search },
        routeTree: root.addChildren([tasks]),
        history: createMemoryHistory({ initialEntries: [context.parameters.initialEntry ?? "/tasks"] }),
      });
    }, [context.parameters.initialEntry, Story]);
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
export const InvalidInitialSearch: Story = {
  parameters: { initialEntry: "/tasks?service=%5B%22gmail%22%5D&period=invalid&unexpected=keep" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("combobox", { name: /サービス/ })).toHaveValue("all");
    await expect(canvas.getByRole("combobox", { name: /期間/ })).toHaveValue("7d");
    await expect(await canvas.findByRole("heading", { name: "テストの依頼者" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "タスク" })).not.toHaveAttribute("href", expect.stringContaining("unexpected"));
  },
};
export const DraftFailure: Story = {
  parameters: { msw: { handlers: handlers(conversations, true) } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "テストの依頼者" })).toBeVisible();
    await expect(await canvas.findByText("下書きの取得に失敗しました。返信状況は未確認です。")).toBeVisible();
  },
};

export const NarrowInbox: Story = {
  parameters: { viewport: { options: { mobile: { name: "幅 320 px", styles: { width: "320px", height: "840px" } } } } },
  globals: { viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const reply = await canvas.findByRole("button", { name: "手動で返信" });
    await userEvent.click(reply);
    await userEvent.tab();
    await userEvent.tab({ shift: true });
    await expect(reply).toHaveFocus();
    const scroller = canvas.getByRole("region", { name: "会話の詳細と同期結果" });
    await expect(reply.getBoundingClientRect().left - 3).toBeGreaterThanOrEqual(scroller.getBoundingClientRect().left);
    await userEvent.click(canvas.getByRole("button", { name: "やめる" }));
    const inbox = canvas.getByRole("region", { name: "受信した会話" });
    inbox.focus();
    await expect(inbox).toHaveFocus();
    await expect(getComputedStyle(inbox).outlineOffset).toBe("-2px");
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    await expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth);
  },
};
export const NarrowInboxDark: Story = { ...NarrowInbox, globals: { ...NarrowInbox.globals, theme: "dark" } };

const mobileTasks: Task[] = Array.from({ length: 3 }, (_, index) => ({
  id: `mobile-task-${index}`, title: `表示を確認するタスク ${index + 1}`, description: "狭い画面で一覧と編集フォームが重ならないことを確認します。", area: "work", status: "todo", dueAt: null, scheduledAt: null, sourceUrl: null, completedAt: null, conversationId: null, repositoryId: null, repositoryName: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
}));
export const NarrowTaskBoard: Story = {
  parameters: { ...NarrowInbox.parameters, initialEntry: "/tasks?view=tasks", msw: { handlers: [http.get("*/api/v1/tasks", () => HttpResponse.json({ data: mobileTasks })), ...handlers([])] } },
  globals: { viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const edit = (await canvas.findAllByRole("button", { name: "編集" }))[0]!;
    await userEvent.click(edit);
    const editor = canvas.getByRole("complementary", { name: "タスクの編集と起動設定" });
    const list = canvas.getByRole("region", { name: "タスク一覧" });
    await expect(editor.getBoundingClientRect().top).toBeGreaterThanOrEqual(list.getBoundingClientRect().bottom);
    await expect(canvas.getByLabelText("タイトル")).toHaveValue(mobileTasks[0]!.title);
    await userEvent.click(canvas.getByRole("button", { name: "編集をやめる" }));
    await expect(canvas.getByLabelText("タイトル")).toHaveValue("");
  },
};

const classificationEntries: Conversation[] = Array.from({ length: 3 }, (_, index) => ({
  ...conversations[0]!, id: `classification-${index}`, authorLabel: `分類テスト ${index + 1}`,
}));
const classificationStory = (failure = false): Story => {
  let entries = classificationEntries;
  let classified = false;
  return {
    beforeEach: () => {
      entries = classificationEntries;
      classified = false;
    },
    parameters: {
      initialEntry: "/tasks?conversationId=classification-1",
      msw: { handlers: [
        http.get("*/api/v1/conversations", async () => {
          if (classified) await delay(1_000);
          return HttpResponse.json({ data: entries });
        }),
        http.post("*/api/v1/conversations/:id/classification", async ({ params, request }) => {
          if (failure) return HttpResponse.json({ error: { message: "分類の保存に失敗しました。" } }, { status: 503 });
          const { classification } = await request.json() as { classification: Conversation["classification"] };
          entries = entries.map((entry) => entry.id === params.id ? { ...entry, classification } : entry);
          classified = true;
          return HttpResponse.json({ data: null });
        }),
        ...handlers(classificationEntries),
      ] },
    },
    play: async ({ canvas, userEvent }) => {
      await expect(await canvas.findByRole("heading", { name: "分類テスト 2" })).toBeVisible();
      const inbox = within(canvas.getByRole("region", { name: "受信した会話" }));
      await userEvent.click(canvas.getByRole("button", { name: "対応不要にする" }));
      if (failure) {
        await expect(await canvas.findByText("分類の保存に失敗しました。")).toBeVisible();
        await expect(canvas.getByRole("heading", { name: "分類テスト 2" })).toBeVisible();
        await expect(inbox.getByRole("button", { name: /分類テスト 2/ })).toHaveAttribute("aria-pressed", "true");
        return;
      }
      await expect(await canvas.findByRole("heading", { name: "分類テスト 3" }, { timeout: 500 })).toBeVisible();
      await expect(inbox.queryByRole("button", { name: /分類テスト 2/ })).not.toBeInTheDocument();
      await expect(inbox.getByRole("button", { name: /分類テスト 3/ })).toHaveAttribute("aria-pressed", "true");
      await expect(canvas.getByRole("link", { name: "タスク" })).toHaveAttribute("href", expect.stringContaining("conversationId=classification-2"));
      await userEvent.click(canvas.getByRole("button", { name: "対応不要にする" }));
      await expect(await canvas.findByRole("heading", { name: "分類テスト 1" }, { timeout: 500 })).toBeVisible();
      await userEvent.click(canvas.getByRole("button", { name: "対応不要にする" }));
      await expect(await canvas.findByText("会話を選ぶと、本文・返信案・関連タスクをここで確認できます。", {}, { timeout: 500 })).toBeVisible();
      await expect(inbox.queryAllByRole("button")).toHaveLength(0);
      await expect(canvas.getByRole("link", { name: "タスク" })).not.toHaveAttribute("href", expect.stringContaining("conversationId="));
      await userEvent.click(canvas.getByRole("button", { name: /すべて 3/ }));
      await expect(await inbox.findAllByRole("button")).toHaveLength(3);
      await expect(await inbox.findAllByText("対応不要")).toHaveLength(3);
    },
  };
};
export const ClassifyAndSelectNext: Story = classificationStory();
export const ClassificationFailure: Story = classificationStory(true);
