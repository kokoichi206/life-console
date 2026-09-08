import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { MonitoringStatusView } from "./MonitoringPanel";

const meta = {
  title: "Pages/同期・実行状況/死活監視",
  component: MonitoringStatusView,
  args: { loading: false, error: null, summary: { lastMaintenanceAt: new Date().toISOString(), pendingNotifications: 0, failedNotifications: 0, targets: [
    { id: "runner", runnerId: "mac-test", service: "runner", account: "process", registeredAt: new Date().toISOString(), receivedAt: new Date().toISOString(), outcome: "healthy", failures: 0, revision: 1 },
    { id: "slack", runnerId: "mac-test", service: "slack", account: "work", registeredAt: new Date().toISOString(), receivedAt: new Date().toISOString(), outcome: "auth_required", failures: 1, revision: 1 },
  ] } },
} satisfies Meta<typeof MonitoringStatusView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AuthenticationFailure: Story = {
  play: async ({ canvas }) => { await expect(canvas.getByText(/再ログインが必要/u)).toBeVisible(); },
};
export const Empty: Story = { args: { summary: { lastMaintenanceAt: null, targets: [], pendingNotifications: 0, failedNotifications: 0 } } };
export const Loading: Story = { args: { summary: undefined, loading: true } };
export const Failed: Story = { args: { summary: undefined, error: "監視状態を取得できません。" } };
export const RetryPending: Story = { args: { summary: { ...meta.args.summary, pendingNotifications: 2, failedNotifications: 1 } } };
export const Dark: Story = { globals: { theme: "dark" } };
