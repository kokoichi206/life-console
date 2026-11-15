import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import { ConnectorSchedulesView } from "./ConnectorSchedules";

const meta = {
  title: "Pages/同期・実行状況/定期実行",
  component: ConnectorSchedulesView,
  args: { loading: false, error: null, notice: null, pending: false, onReload: fn(), onCreate: fn(), onUpdate: fn(), onSync: fn(), statuses: [
    { connector: "gmail", schedules: [], active: false, latestJob: null },
    { connector: "slack", schedules: [{ id: "s1", interval: "hourly", enabled: true, nextRunAt: "2026-09-12T01:00:00Z", updatedAt: "2026-09-11T01:00:00Z" }], active: false, latestJob: { status: "failed", errorCode: "invalid_api_error", summary: "取り込みに失敗しました。", createdAt: "2026-09-11T01:00:00Z" } },
    { connector: "chatwork", schedules: [{ id: "s2", interval: "daily", enabled: false, nextRunAt: "2026-09-12T01:00:00Z", updatedAt: "2026-09-11T01:00:00Z" }], active: false, latestJob: { status: "succeeded", errorCode: null, summary: "3 件を同期しました。", createdAt: "2026-09-11T01:00:00Z" } },
    { connector: "talknote", schedules: [], active: true, latestJob: { status: "queued", errorCode: null, summary: null, createdAt: "2026-09-11T01:00:00Z" } },
  ] },
} satisfies Meta<typeof ConnectorSchedulesView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Management: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const gmail = within(canvas.getByRole("region", { name: "Gmail の定期実行" }));
    await expect(gmail.getByText("未設定")).toBeVisible();
    await userEvent.selectOptions(gmail.getByRole("combobox"), "daily");
    await userEvent.click(gmail.getByRole("checkbox"));
    await userEvent.click(gmail.getByRole("button", { name: "定期実行を登録" }));
    await expect(args.onCreate).toHaveBeenCalledWith({ connector: "gmail", interval: "daily", runImmediately: true });
    const slack = within(canvas.getByRole("region", { name: "Slack の定期実行" }));
    await userEvent.click(slack.getByRole("button", { name: "一時停止" }));
    await expect(args.onUpdate).toHaveBeenCalledWith("s1", { interval: "hourly", enabled: false, updatedAt: "2026-09-11T01:00:00Z" });
    await userEvent.click(slack.getByRole("button", { name: "今すぐ同期" }));
    await expect(args.onSync).toHaveBeenCalledWith("slack");
    await expect(within(canvas.getByRole("region", { name: "Talknote の定期実行" })).getByRole("button", { name: "同期を待機・実行中" })).toBeDisabled();
  },
};
export const Loading: Story = { args: { statuses: undefined, loading: true } };
export const Failed: Story = { args: { statuses: undefined, error: "定期実行を取得できませんでした。" } };
export const Saving: Story = { args: { pending: true } };
export const Dark: Story = { globals: { theme: "dark" } };
