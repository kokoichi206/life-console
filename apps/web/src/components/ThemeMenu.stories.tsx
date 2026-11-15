import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { ThemeMenu } from "./ThemeMenu";

const meta = { title: "Components/ThemeMenu", component: ThemeMenu, args: { alwaysVisible: true } } satisfies Meta<typeof ThemeMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Selection: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const root = canvasElement.ownerDocument.documentElement;
    await userEvent.click(canvas.getByRole("button", { name: "表示テーマ" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "ダーク" }));
    await expect(root).toHaveClass("dark");
    await waitFor(() => expect(canvas.getByRole("button", { name: "表示テーマ" })).toHaveAttribute("aria-expanded", "false"));
    await userEvent.click(canvas.getByRole("button", { name: "表示テーマ" }));
    await expect(await screen.findByRole("menuitemradio", { name: "ダーク" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "ライト" }));
    await expect(root).not.toHaveClass("dark");
    await waitFor(() => expect(canvas.getByRole("button", { name: "表示テーマ" })).toHaveAttribute("aria-expanded", "false"));
    await userEvent.click(canvas.getByRole("button", { name: "表示テーマ" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "端末に合わせる" }));
    await expect(localStorage.getItem("life-console-theme")).toBe("system");
  },
};
