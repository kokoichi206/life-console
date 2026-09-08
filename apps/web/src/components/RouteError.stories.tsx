import type { Meta, StoryObj } from "@storybook/react-vite";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { useMemo } from "react";
import { expect } from "storybook/test";

import { RouteError } from "./RouteError";

const retryQuery = queryOptions({
  queryKey: ["route-retry-story"],
  queryFn: async () => {
    const response = await fetch("/api/route-retry-story");
    if (!response.ok) throw new Error("通信を確認して、もう一度お試しください。");
    return response.text();
  },
});

const RetryPage = () => {
  const { data } = useSuspenseQuery(retryQuery);
  return <p>{data}</p>;
};

const RetryRouter = () => {
  const router = useMemo(() => {
    const root = createRootRoute({ errorComponent: RouteError });
    const page = createRoute({ getParentRoute: () => root, path: "/", component: RetryPage });
    return createRouter({ routeTree: root.addChildren([page]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  }, []);
  return <RouterProvider router={router} />;
};

const meta = {
  title: "Components/RouteError",
  component: RetryRouter,
} satisfies Meta<typeof RetryRouter>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Retry: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/route-retry-story", () => HttpResponse.text("取得失敗", { status: 503 }), { once: true }),
        http.get("*/api/route-retry-story", () => HttpResponse.text("読み込みが完了しました。")),
      ],
    },
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByRole("heading", { name: "データを読み込めませんでした。" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "再読み込み" }));
    await expect(await canvas.findByText("読み込みが完了しました。")).toBeVisible();
  },
};
