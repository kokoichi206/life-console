import type { ShoppingList, Task } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { delay, http, HttpResponse } from "msw";
import { useMemo } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { router as appRouter } from "../../router";

import { parseTodoSearch } from "./todo-search";
import { TodosPage } from "./TodosPage";

const initialShopping = (): ShoppingList => ({ places: [{ id: "super", name: "スーパー" }, { id: "drug", name: "薬局" }], items: [{ id: "soap", name: "石けん", purchasedAt: null, placeIds: ["super", "drug"] }] });
const initialTasks = (): Task[] => [{ id: "work-task", title: "サイトの更新を公開する", description: "公開後の表示も確認する", area: "work", status: "todo", dueAt: null, scheduledAt: "2026-09-20T09:00:00Z", sourceUrl: "https://example.com/request", completedAt: null, conversationId: null, repositoryId: null, repositoryName: null, createdAt: "2026-09-11T00:00:00Z", updatedAt: "2026-09-11T00:00:00Z" }];
let shopping = initialShopping();
let tasks = initialTasks();
const handlers = [
  http.get("*/api/v1/shopping", () => HttpResponse.json({ data: shopping })),
  http.get("*/api/v1/tasks", () => HttpResponse.json({ data: tasks })),
  http.post("*/api/v1/shopping/places/:id/items", async ({ params, request }) => {
    const input = await request.json() as { name: string };
    shopping = { ...shopping, items: [...shopping.items, { id: "added-item", name: input.name, purchasedAt: null, placeIds: [String(params.id)] }] };
    return HttpResponse.json({ data: null });
  }),
  http.patch("*/api/v1/shopping/items/:id", async ({ params, request }) => {
    const input = await request.json() as { purchased?: boolean; name?: string };
    shopping = { ...shopping, items: shopping.items.map((item) => item.id !== params.id ? item : { ...item, name: input.name ?? item.name, purchasedAt: input.purchased === undefined ? item.purchasedAt : input.purchased ? "2026-09-11T01:00:00Z" : null }) };
    return HttpResponse.json({ data: null });
  }),
  http.put("*/api/v1/shopping/items/:id/places/:placeId", async ({ params, request }) => {
    const input = await request.json() as { linked: boolean };
    shopping = { ...shopping, items: shopping.items.map((item) => item.id !== params.id ? item : { ...item, placeIds: input.linked ? [...item.placeIds, String(params.placeId)] : item.placeIds.filter((id) => id !== params.placeId) }) };
    return HttpResponse.json({ data: null });
  }),
  http.post("*/api/v1/shopping/places", async ({ request }) => {
    const input = await request.json() as { name: string };
    shopping = { ...shopping, places: [...shopping.places, { id: "new-place", name: input.name }] };
    return HttpResponse.json({ data: null });
  }),
  http.post("*/api/v1/tasks", async ({ request }) => {
    const input = await request.json() as Partial<Task>;
    const task = { ...initialTasks()[0]!, ...input, id: "personal-task", status: "todo" as const };
    tasks = [...tasks, task];
    return HttpResponse.json({ data: task });
  }),
  http.patch("*/api/v1/tasks/:id", async ({ params, request }) => {
    const input = await request.json() as Partial<Task>;
    tasks = tasks.map((task) => task.id === params.id ? { ...task, ...input } : task);
    return HttpResponse.json({ data: tasks.find((task) => task.id === params.id) });
  }),
];

const meta = {
  title: "Pages/やること", component: TodosPage,
  beforeEach: () => {
    shopping = initialShopping();
    tasks = initialTasks();
  },
  parameters: { msw: { handlers } },
  decorators: [(Story, context) => {
    const router = useMemo(() => {
      const root = createRootRoute();
      const todos = createRoute({ getParentRoute: () => root, path: "/todos", validateSearch: parseTodoSearch, component: Story });
      const work = createRoute({ getParentRoute: () => root, path: "/tasks", component: () => <p>仕事の詳細</p> });
      return createRouter({ search: { ...appRouter.options.search }, routeTree: root.addChildren([todos, work]), history: createMemoryHistory({ initialEntries: [context.parameters.initialEntry ?? "/todos"] }) });
    }, [Story, context.parameters.initialEntry]);
    return <RouterProvider router={router} />;
  }],
} satisfies Meta<typeof TodosPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const Shopping: Story = {
  parameters: { initialEntry: "/todos?view=shopping" },
  play: async ({ canvas }) => {
    const supermarket = within(await canvas.findByRole("region", { name: "スーパー" }));
    await expect(canvas.queryByRole("combobox")).not.toBeInTheDocument();
    await userEvent.type(supermarket.getByLabelText("スーパーで買うもの"), "牛乳");
    await userEvent.click(supermarket.getByRole("button", { name: "追加" }));
    await expect(await supermarket.findByRole("checkbox", { name: "牛乳" })).toBeVisible();
    await expect(supermarket.getByLabelText("スーパーで買うもの")).toHaveValue("");
    const drugstore = within(canvas.getByRole("region", { name: "薬局" }));
    await userEvent.click(drugstore.getByRole("button", { name: "登録済みの品をここにも追加" }));
    await userEvent.click(drugstore.getByRole("button", { name: "牛乳" }));
    await expect(await drugstore.findByRole("checkbox", { name: "牛乳" })).toBeVisible();
    await userEvent.click(supermarket.getByRole("checkbox", { name: "牛乳" }));
    await waitFor(() => expect(supermarket.queryByRole("checkbox", { name: "牛乳" })).not.toBeInTheDocument());
    await waitFor(() => expect(drugstore.queryByRole("checkbox", { name: "牛乳" })).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole("link", { name: "完了済みを見る" }));
    await expect(await supermarket.findByRole("checkbox", { name: "牛乳" })).toBeChecked();
    await userEvent.click(supermarket.getByRole("checkbox", { name: "牛乳" }));
    await userEvent.click(canvas.getByRole("link", { name: "未完了を見る" }));
    await expect(await drugstore.findByRole("checkbox", { name: "牛乳" })).not.toBeChecked();
  },
};
export const TaskWithoutDates: Story = {
  parameters: { initialEntry: "/todos?view=personal" },
  play: async ({ canvas }) => {
    await userEvent.type(await canvas.findByLabelText("やること"), "本を返す");
    await userEvent.click(canvas.getByRole("button", { name: "タスクを追加" }));
    await expect(await canvas.findByRole("heading", { name: "本を返す" })).toBeVisible();
    await expect(canvas.getByLabelText("実施日時（任意）")).toHaveValue("");
    await expect(canvas.getByLabelText("期日（任意）")).toHaveValue("");
  },
};
export const Empty: Story = { beforeEach: () => {
  shopping = { places: [], items: [] };
  tasks = [];
} };
export const Loading: Story = { parameters: { msw: { handlers: [http.get("*/api/v1/shopping", async () => {
  await delay("infinite");
}), ...handlers.filter((_, index) => index !== 0)] } } };
export const Failure: Story = { parameters: { msw: { handlers: [http.get("*/api/v1/shopping", () => HttpResponse.json({ error: { message: "買い物を取得できませんでした。" } }, { status: 503 })), ...handlers.filter((_, index) => index !== 0)] } } };
export const SaveFailure: Story = {
  parameters: { initialEntry: "/todos?view=shopping", msw: { handlers: [http.post("*/api/v1/shopping/places/:id/items", () => HttpResponse.json({ error: { message: "保存に失敗しました。" } }, { status: 500 })), ...handlers.filter((_, index) => index !== 2)] } },
  play: async ({ canvas }) => {
    await userEvent.type(await canvas.findByLabelText("スーパーで買うもの"), "牛乳");
    const supermarket = within(canvas.getByRole("region", { name: "スーパー" }));
    await userEvent.click(supermarket.getByRole("button", { name: "追加" }));
    await expect(await supermarket.findByRole("alert")).toHaveTextContent("保存に失敗しました。");
    await expect(supermarket.getByLabelText("スーパーで買うもの")).toHaveValue("牛乳");
  },
};
export const Saving: Story = {
  parameters: { initialEntry: "/todos?view=shopping", msw: { handlers: [http.post("*/api/v1/shopping/places/:id/items", async () => {
    await delay("infinite");
  }), ...handlers.filter((_, index) => index !== 2)] } },
  play: async ({ canvas }) => {
    await userEvent.type(await canvas.findByLabelText("スーパーで買うもの"), "牛乳");
    const supermarket = within(canvas.getByRole("region", { name: "スーパー" }));
    await userEvent.click(supermarket.getByRole("button", { name: "追加" }));
    await expect(await supermarket.findByRole("button", { name: "追加中…" })).toBeDisabled();
    await expect(supermarket.getByLabelText("スーパーで買うもの")).toBeDisabled();
  },
};
export const Mobile: Story = { parameters: { initialEntry: "/todos?view=shopping" }, decorators: [(Story) => <div style={{ maxWidth: 350 }}><Story /></div>] };
export const Dark: Story = { globals: { theme: "dark" }, parameters: { initialEntry: "/todos?view=shopping" } };

let taskReadCount = 0;
export const TaskRefreshFailure: Story = {
  beforeEach: () => { taskReadCount = 0; },
  parameters: { initialEntry: "/todos?view=tasks", msw: { handlers: [
    http.get("*/api/v1/tasks", () => {
      taskReadCount += 1;
      return taskReadCount === 2 ? HttpResponse.json({ error: { message: "再取得に失敗しました。" } }, { status: 503 }) : HttpResponse.json({ data: tasks });
    }), ...handlers.filter((_, index) => index !== 1),
  ] } },
  play: async ({ canvas }) => {
    await userEvent.type(await canvas.findByLabelText("やること"), "入力途中のタスク");
    await userEvent.click(canvas.getByRole("checkbox", { name: "サイトの更新を公開するを完了" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("一覧の更新に失敗しました。");
    await expect(canvas.getByLabelText("やること")).toHaveValue("入力途中のタスク");
    await userEvent.click(canvas.getByRole("button", { name: "再読み込み" }));
    await waitFor(() => expect(canvas.queryByRole("alert")).not.toBeInTheDocument());
    await expect(canvas.getByLabelText("やること")).toHaveValue("入力途中のタスク");
  },
};
let shoppingReadCount = 0;
export const ShoppingRefreshFailure: Story = {
  beforeEach: () => { shoppingReadCount = 0; },
  parameters: { initialEntry: "/todos?view=shopping", msw: { handlers: [
    http.get("*/api/v1/shopping", () => {
      shoppingReadCount += 1;
      return shoppingReadCount === 2 ? HttpResponse.json({ error: { message: "再取得に失敗しました。" } }, { status: 503 }) : HttpResponse.json({ data: shopping });
    }), ...handlers.filter((_, index) => index !== 0),
  ] } },
  play: async ({ canvas }) => {
    const supermarket = within(await canvas.findByRole("region", { name: "スーパー" }));
    await userEvent.type(supermarket.getByLabelText("スーパーで買うもの"), "入力途中の品");
    await userEvent.click(supermarket.getByRole("checkbox", { name: "石けん" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("一覧の更新に失敗しました。");
    await expect(supermarket.getByLabelText("スーパーで買うもの")).toHaveValue("入力途中の品");
    await userEvent.click(canvas.getByRole("button", { name: "再読み込み" }));
    await waitFor(() => expect(canvas.queryByRole("alert")).not.toBeInTheDocument());
    await expect(supermarket.getByLabelText("スーパーで買うもの")).toHaveValue("入力途中の品");
  },
};

export const CanceledTask: Story = {
  beforeEach: () => { tasks = [{ ...initialTasks()[0]!, status: "canceled" }]; },
  parameters: { initialEntry: "/todos?view=work&completed=true" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "サイトの更新を公開する" })).toBeVisible();
    await expect(canvas.queryByRole("checkbox", { name: "サイトの更新を公開するを完了" })).not.toBeInTheDocument();
    await expect(canvas.getByText("仕事 · 中止")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "仕事で開く" })).toBeVisible();
  },
};
export const SharedItemEditor: Story = {
  parameters: { initialEntry: "/todos?view=shopping" },
  play: async ({ canvas }) => {
    const supermarket = within(await canvas.findByRole("region", { name: "スーパー" }));
    const drugstore = within(canvas.getByRole("region", { name: "薬局" }));
    await userEvent.click(supermarket.getByRole("button", { name: "石けんの編集" }));
    await userEvent.clear(canvas.getByLabelText("品名を変更"));
    await userEvent.type(canvas.getByLabelText("品名を変更"), "ハンドソープ");
    await userEvent.click(drugstore.getByRole("button", { name: "石けんの編集" }));
    await expect(canvas.getAllByLabelText("品名を変更")).toHaveLength(1);
    await expect(canvas.getByLabelText("品名を変更")).toHaveValue("ハンドソープ");
    await userEvent.click(canvas.getByRole("button", { name: "品名を保存" }));
    await expect(await supermarket.findByRole("checkbox", { name: "ハンドソープ" })).toBeVisible();
    await expect(await drugstore.findByRole("checkbox", { name: "ハンドソープ" })).toBeVisible();
    await userEvent.click(drugstore.getByRole("button", { name: "ハンドソープの編集" }));
    await expect(canvas.getByLabelText("品名を変更")).toHaveValue("ハンドソープ");
    await userEvent.type(canvas.getByLabelText("品名を変更"), "の詰め替え");
    const editor = within(canvas.getByRole("region", { name: "買うものを編集" }));
    await userEvent.click(editor.getByRole("button", { name: "薬局" }));
    await waitFor(() => expect(drugstore.queryByRole("checkbox", { name: "ハンドソープ" })).not.toBeInTheDocument());
    await expect(canvas.getByLabelText("品名を変更")).toHaveValue("ハンドソープの詰め替え");
  },
};
