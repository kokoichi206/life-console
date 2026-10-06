import type { AbstinenceOverview } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, waitFor, within } from "storybook/test";

import { AbstinencePanel } from "./AbstinencePanel";

const overview: AbstinenceOverview = {
  goal: { name: "夜更かし", startedAt: "2026-09-01T00:00:00+09:00", targetDays: 30, targetDate: "2026-09-30" },
  events: [
    { id: "event-5", occurredAt: "2026-09-10T01:30:00+09:00", durationMinutes: null, memo: "翌日の予定を確認していた", recordedAt: "2026-09-10T01:30:00+09:00" },
    { id: "event-4", occurredAt: "2026-09-08T23:00:00+09:00", durationMinutes: null, memo: "", recordedAt: "2026-09-08T23:00:00+09:00" },
    { id: "event-3", occurredAt: "2026-09-06T23:00:00+09:00", durationMinutes: null, memo: "動画を見ていた", recordedAt: "2026-09-06T23:00:00+09:00" },
    { id: "event-2", occurredAt: "2026-09-04T23:00:00+09:00", durationMinutes: 20, memo: "予定が遅くなった\n次は早めに切り上げる", recordedAt: "2026-09-04T23:00:00+09:00" },
    { id: "event-1", occurredAt: "2026-08-31T23:00:00+09:00", durationMinutes: null, memo: "開始日時より前の記録", recordedAt: "2026-08-31T23:00:00+09:00" },
  ],
  totalEventDurationMinutes: 20,
  currentStreakDays: 5,
  longestStreakDays: 3,
};

const meta = {
  title: "Health/禁欲の継続",
  component: AbstinencePanel,
  parameters: { msw: { handlers: [
    http.get("*/api/v1/abstinence", () => HttpResponse.json({ data: overview })),
    http.post("*/api/v1/abstinence/events", () => HttpResponse.json({ data: null })),
    http.put("*/api/v1/abstinence/goal", () => HttpResponse.json({ data: null })),
  ] } },
} satisfies Meta<typeof AbstinencePanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  name: "継続中と中断履歴",
  play: async ({ canvas, canvasElement, userEvent }) => {
    const timer = await canvas.findByRole("timer", { name: "禁欲の経過時間" });
    await expect(timer).toHaveTextContent(/\d+ 日\s*\d+ 時間\s*\d+ 分\s*\d+ 秒/);
    const initialElapsed = timer.textContent;
    await waitFor(() => expect(timer.textContent).not.toBe(initialElapsed), { timeout: 2_500 });
    await expect(canvas.getByText("1 日 2 時間 30 分 0 秒 継続")).toBeVisible();
    const latestMemo = canvas.getByText("翌日の予定を確認していた");
    await expect(latestMemo).not.toBeVisible();
    await userEvent.click(canvas.getAllByText("メモ", { selector: "summary" })[0]!);
    await expect(latestMemo).toBeVisible();
    await userEvent.click(canvas.getAllByText("メモ", { selector: "summary" })[0]!);
    await expect(latestMemo).not.toBeVisible();
    const historyToggle = canvas.getByText("過去の中断を表示（2 件）");
    const firstStreak = canvas.getByText("3 日 23 時間 0 分 0 秒 継続");
    await expect(firstStreak).not.toBeVisible();
    await userEvent.click(historyToggle);
    await expect(firstStreak).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /さらに表示/ })).not.toBeInTheDocument();
    await expect(canvas.getByText("現在の開始日時より前")).toBeVisible();
    await userEvent.click(canvas.getAllByText("メモ", { selector: "summary" })[2]!);
    await expect(canvas.getByText(/予定が遅くなった/)).toBeVisible();
    await userEvent.click(historyToggle);
    await expect(firstStreak).not.toBeVisible();
    await userEvent.click(historyToggle);
    await expect(firstStreak).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "イベントを記録" }));
    await expect(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "中断イベントを記録" })).toBeVisible();
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole("button", { name: "中断イベントの記録を閉じる" }));
  },
};

export const Empty: Story = {
  name: "目標未設定",
  parameters: { msw: { handlers: [http.get("*/api/v1/abstinence", () => HttpResponse.json({ data: { goal: null, events: [], totalEventDurationMinutes: 0, currentStreakDays: 0, longestStreakDays: 0 } }))] } },
};

export const WithoutMemo: Story = {
  name: "メモなしの中断履歴",
  parameters: { msw: { handlers: [http.get("*/api/v1/abstinence", () => HttpResponse.json({ data: {
    ...overview,
    events: overview.events.map((event) => ({ ...event, memo: "" })),
  } }))] } },
};

export const LongHistory: Story = {
  name: "200 件の中断履歴",
  parameters: { msw: { handlers: [http.get("*/api/v1/abstinence", () => HttpResponse.json({ data: {
    ...overview,
    events: Array.from({ length: 200 }, (_, index) => {
      const occurredAt = new Date(Date.parse("2026-09-30T23:00:00+09:00") - index * 3_600_000).toISOString();
      return { id: `event-${index}`, occurredAt, durationMinutes: null, memo: `中断 ${index + 1} のメモ`, recordedAt: occurredAt };
    }),
  } }))] } },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("timer", { name: "禁欲の経過時間" });
    const historyToggle = canvas.getByText("過去の中断を表示（197 件）");
    await expect(canvas.getAllByRole("listitem")).toHaveLength(23);
    await expect(canvas.getAllByRole("listitem")[3]!).not.toBeVisible();
    await expect(canvas.queryByText("中断 24 のメモ")).not.toBeInTheDocument();
    await userEvent.click(historyToggle);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(23);
    await expect(canvas.getAllByRole("listitem")[3]!).toBeVisible();
    await expect(within(canvas.getAllByRole("listitem")[22]!).getByText("0 日 1 時間 0 分 0 秒 継続")).toBeVisible();
    await expect(canvas.getByText("中断 23 のメモ")).toBeInTheDocument();
    await expect(canvas.queryByText("中断 24 のメモ")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "さらに表示（次の 20 件）" }));
    await expect(canvas.getAllByRole("listitem")).toHaveLength(43);
    await expect(canvas.queryByText("中断 44 のメモ")).not.toBeInTheDocument();
    await userEvent.click(historyToggle);
    await waitFor(() => expect(canvas.queryByText("中断 24 のメモ")).not.toBeInTheDocument());
    await userEvent.click(historyToggle);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(23);
    for (let page = 0; page < 8; page += 1) {
      await userEvent.click(canvas.getByRole("button", { name: "さらに表示（次の 20 件）" }));
      await expect(canvas.getAllByRole("listitem")).toHaveLength(23 + (page + 1) * 20);
    }
    await userEvent.click(canvas.getByRole("button", { name: "さらに表示（次の 17 件）" }));
    await expect(canvas.getAllByRole("listitem")).toHaveLength(200);
    await expect(canvas.queryByRole("button", { name: /さらに表示/ })).not.toBeInTheDocument();
    await userEvent.click(historyToggle);
    await waitFor(() => expect(canvas.getAllByRole("listitem")).toHaveLength(23));
    await expect(canvas.getAllByRole("listitem")[3]!).not.toBeVisible();
  },
};
