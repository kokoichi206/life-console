import type { AbstinenceOverview } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, within } from "storybook/test";

import { AbstinencePanel } from "./AbstinencePanel";

const overview: AbstinenceOverview = {
  goal: { name: "夜更かし", startedAt: "2026-09-01T00:00:00+09:00", targetDays: 30, targetDate: "2026-09-30" },
  events: [{ id: "event-1", occurredAt: "2026-09-04T23:00:00+09:00", durationMinutes: null, memo: "予定が遅くなった", recordedAt: "2026-09-04T23:00:00+09:00" }],
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
    await expect(await canvas.findByText("5", { exact: true })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "イベントを記録" }));
    await expect(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "中断イベントを記録" })).toBeVisible();
  },
};

export const Empty: Story = {
  name: "目標未設定",
  parameters: { msw: { handlers: [http.get("*/api/v1/abstinence", () => HttpResponse.json({ data: { goal: null, events: [], totalEventDurationMinutes: 0, currentStreakDays: 0, longestStreakDays: 0 } }))] } },
};
