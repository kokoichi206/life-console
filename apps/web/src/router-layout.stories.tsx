import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { useMemo } from "react";
import { expect, fn } from "storybook/test";

import { router } from "./router";

const monitoringRequest = fn();
const SharedNotFound = ({ entry }: { readonly entry: string }) => {
  const queryClient = useQueryClient();
  const testRouter = useMemo(() => createRouter({ ...router.options, history: createMemoryHistory({ initialEntries: [entry] }), context: { queryClient } }), [entry, queryClient]);
  return <RouterProvider router={testRouter} />;
};
const meta = {
  title: "Pages/共有 URL の不一致",
  component: SharedNotFound,
  parameters: { layout: "fullscreen", hasMainLandmark: true, msw: { handlers: [http.get("*/api/v1/monitoring", () => {
    monitoringRequest();
    return HttpResponse.json({ error: { message: "本人用 API" } }, { status: 403 });
  })] } },
  beforeEach: () => { monitoringRequest.mockClear(); },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "ページが見つかりません。" })).toBeVisible();
    await expect(canvas.queryByRole("navigation", { name: "メインナビゲーション" })).not.toBeInTheDocument();
    await expect(monitoringRequest).not.toHaveBeenCalled();
  },
} satisfies Meta<typeof SharedNotFound>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MissingToken: Story = { args: { entry: "/share/health" } };
export const ExtraPath: Story = { args: { entry: "/share/health/invalid/extra" } };
