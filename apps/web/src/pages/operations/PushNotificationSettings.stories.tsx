import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { PushSettingsView } from "./PushNotificationSettings";

const meta = {
  title: "Pages/同期・実行状況/通知設定",
  component: PushSettingsView,
  args: {
    state: { supported: true, permission: "default", subscribed: false, registered: false },
    configured: true, loading: false, pending: false, error: null, testAccepted: false,
    onEnable: fn(), onDisable: fn(), onTest: fn(),
  },
} satisfies Meta<typeof PushSettingsView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Disabled: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "この端末で通知を有効にする" }));
    await expect(args.onEnable).toHaveBeenCalled();
  },
};
export const Enabled: Story = {
  args: { state: { supported: true, permission: "granted", subscribed: true, registered: true } },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "テスト通知を送る" }));
    await expect(args.onTest).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "この端末の通知を無効にする" }));
    await expect(args.onDisable).toHaveBeenCalled();
  },
};
export const Denied: Story = { args: { state: { supported: true, permission: "denied", subscribed: false, registered: false } } };
export const Unsupported: Story = { args: { state: { supported: false, permission: "default", subscribed: false, registered: false } } };
export const Unconfigured: Story = { args: { configured: false } };
export const Loading: Story = { args: { loading: true, state: undefined } };
export const Saving: Story = { args: { pending: true } };
export const Failure: Story = { args: { error: "通知の登録を保存できませんでした。" } };
export const Accepted: Story = { args: { ...Enabled.args, testAccepted: true } };
export const Dark: Story = { args: { ...Enabled.args }, globals: { theme: "dark" } };
