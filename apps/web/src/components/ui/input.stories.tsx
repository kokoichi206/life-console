import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "./input";

const meta = { title: "UI/Input", component: Input, args: { "aria-label": "体重", "placeholder": "体重を入力" } } satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => { await userEvent.type(canvas.getByRole("textbox", { name: "体重" }), "81.4"); },
};
export const Invalid: Story = { args: { "aria-invalid": true, "defaultValue": "入力内容を確認" } };
export const Disabled: Story = { args: { disabled: true } };
