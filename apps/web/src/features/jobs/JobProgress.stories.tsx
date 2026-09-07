import type { Job } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { JobProgress } from "./JobProgress";

const job: Job = { id: "story-job", taskId: null, repositoryId: null, kind: "conversation_reply", status: "queued", payloadJson: "{}", leaseToken: null, cancelRequestedAt: null, provider: null, summary: "返信の送信を待っています。", errorCode: null, createdAt: "2026-09-08T00:00:00Z", updatedAt: "2026-09-08T00:00:00Z" };
const meta = { title: "Features/実行状況", component: JobProgress, args: { job } } satisfies Meta<typeof JobProgress>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Queued: Story = {};
export const Running: Story = { args: { job: { ...job, status: "running", summary: "返信を送信しています。" } } };
export const Canceled: Story = { args: { job: { ...job, status: "canceled", summary: "送信を中止しました。" } } };
export const Lost: Story = {
  args: { job: { ...job, status: "lost", errorCode: "lease_expired", summary: "送信結果を確認できません。" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("結果不明")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "中止" })).not.toBeInTheDocument();
  },
};
