import type { WorkConfirmation } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { delay, http, HttpResponse } from "msw";
import { useMemo } from "react";
import { expect, within } from "storybook/test";

import { parseWorkSearch } from "../work-search";

import { WorkConfirmations } from "./WorkConfirmations";

const request: WorkConfirmation = {
  id: "confirmation-1", sourceId: "example-patrol", sourceLabel: "テスト用の dev 巡回", externalId: "review-1",
  repositoryName: "example/project", sourceUrl: "https://github.com/example/project/pull/123",
  kind: "review", title: "修正 PR の差分をレビューする", summary: "修正と検証が済み、本人へのレビュー依頼が届いています。",
  environment: "dev", question: "この変更で問題ないか、差分をレビューしてください。",
  reason: "agent の修正・検証は完了しています。あなた宛てのレビュー依頼があり、最終確認が必要です。",
  recommendation: "修正箇所と回帰テストを確認し、問題がなければ GitHub でレビューを返す。",
  evidence: [
    { state: "confirmed", title: "変更箇所と回帰テストの差分を確認", detail: "架空の結果です。詳細は元の PR から確認できます。", url: "https://github.com/example/project/pull/123/files" },
    { state: "unconfirmed", title: "dev への配置後の動作", detail: "この PR はまだマージしていない想定です。", url: null },
  ],
  requestedAt: "2026-10-02T02:40:00Z", checkedAt: "2026-10-02T03:00:00Z", status: "pending", completedAt: null, completedBy: null,
};
const decision: WorkConfirmation = {
  ...request, id: "confirmation-2", externalId: "decision-1", kind: "decision", sourceUrl: "https://github.com/example/project/issues/456",
  title: "認証エラーへの対応方針を決める", summary: "再認証を先に進めるか判断が必要です。", question: "本人による再認証を先に進めてよいですか？",
  reason: "本人の認証操作が必要なため、判断を求めています。", recommendation: "接続状態を確認し、再認証後に巡回で解消を確かめる。",
};
const response = (confirmations: WorkConfirmation[]) => ({
  confirmations, sources: [{ id: request.sourceId, label: request.sourceLabel, lastSuccessAt: request.checkedAt }],
  notifications: { pending: 0, failed: 0 },
});
const read = (confirmations: WorkConfirmation[]) => http.get("*/api/v1/work-confirmations", () => HttpResponse.json({ data: response(confirmations) }));
const meta = {
  title: "Pages/仕事/自分の確認待ち",
  component: WorkConfirmations,
  parameters: { msw: { handlers: [read([request, decision])] } },
  decorators: [(Story, context) => {
    const router = useMemo(() => {
      const root = createRootRoute();
      const tasks = createRoute({ getParentRoute: () => root, path: "/tasks", validateSearch: parseWorkSearch, component: Story });
      return createRouter({ routeTree: root.addChildren([tasks]), history: createMemoryHistory({
        initialEntries: [context.parameters.initialEntry ?? "/tasks?view=confirmations"],
      }) });
    }, [Story, context.parameters.initialEntry]);
    return <div className="flex h-[850px] flex-col"><RouterProvider router={router} /></div>;
  }],
} satisfies Meta<typeof WorkConfirmations>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  play: async ({ canvas, userEvent }) => {
    const detail = await canvas.findByRole("region", { name: "確認依頼の詳細" });
    await expect(await within(detail).findByRole("heading", { name: request.title })).toBeVisible();
    await userEvent.click(canvas.getByRole("link", { name: new RegExp(decision.title) }));
    await expect(await within(detail).findByRole("heading", { name: decision.title })).toBeVisible();
    await expect(within(detail).getByRole("link", { name: "GitHub で確認" })).toHaveAttribute("href", decision.sourceUrl);
  },
};
export const Dark: Story = { globals: { theme: "dark" } };
export const MergeDecision: Story = {
  parameters: { msw: { handlers: [read([{ ...request, kind: "merge", title: "修正 PR をマージしてよいか判断する", recommendation: "", evidence: [] }])] } },
};
export const Empty: Story = { parameters: { msw: { handlers: [read([])] } } };
export const Loading: Story = { parameters: { msw: { handlers: [http.get("*/api/v1/work-confirmations", async () => {
  await delay("infinite");
  return HttpResponse.json({ data: response([]) });
})] } } };
export const Failure: Story = { parameters: { msw: { handlers: [http.get("*/api/v1/work-confirmations", () => HttpResponse.json({ error: { message: "確認依頼を取得できませんでした。" } }, { status: 503 }))] } } };
export const DeliveryFailure: Story = { parameters: { msw: { handlers: [http.get("*/api/v1/work-confirmations", () => HttpResponse.json({ data: { ...response([request]), notifications: { pending: 1, failed: 1 } } }))] } } };
export const Completed: Story = {
  parameters: { initialEntry: "/tasks?view=confirmations&confirmationStatus=done", msw: { handlers: [read([{ ...request, status: "done", completedAt: request.checkedAt, completedBy: "source" }])] } },
};
export const MissingSelection: Story = { parameters: { initialEntry: "/tasks?view=confirmations&confirmationId=missing" } };
export const Narrow: Story = {
  parameters: { viewport: { options: { mobile: { name: "幅 390 px", styles: { width: "390px", height: "844px" } } } } },
  globals: { viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("region", { name: "確認依頼の一覧" });
    await userEvent.click(await within(list).findByRole("link", { name: new RegExp(request.title) }));
    await expect(await canvas.findByRole("heading", { name: request.title })).toBeVisible();
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    await userEvent.click(canvas.getByRole("link", { name: "一覧に戻る" }));
    await expect(list).toBeVisible();
  },
};
export const NarrowDark: Story = { ...Narrow, globals: { ...Narrow.globals, theme: "dark" } };

let completionRecorded = false;
export const RecordCompletion: Story = {
  beforeEach: () => { completionRecorded = false; },
  parameters: { msw: { handlers: [
    http.get("*/api/v1/work-confirmations", () => HttpResponse.json({ data: response([{ ...request,
      status: completionRecorded ? "done" : "pending", completedAt: completionRecorded ? request.checkedAt : null, completedBy: completionRecorded ? "user" : null,
    }]) })),
    http.post("*/api/v1/work-confirmations/:id/complete", () => {
      completionRecorded = true;
      return HttpResponse.json({ data: null });
    }),
  ] } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "対応済みとして記録" }));
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole("button", { name: "記録する" }));
    await expect(await canvas.findByText(/本人の記録/)).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "対応済みとして記録" })).toBeNull();
  },
};
export const CompletionFailure: Story = {
  parameters: { msw: { handlers: [
    read([request]),
    http.post("*/api/v1/work-confirmations/:id/complete", () => HttpResponse.json({ error: { message: "記録を保存できませんでした。" } }, { status: 500 })),
  ] } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "対応済みとして記録" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("button", { name: "記録する" }));
    await expect(await body.findByText("記録を保存できませんでした。")).toBeVisible();
    await userEvent.click(body.getByRole("button", { name: "戻る" }));
    await expect(canvas.getByRole("button", { name: "対応済みとして記録" })).toBeVisible();
    await expect(canvas.queryByText(/本人の記録/)).toBeNull();
  },
};
