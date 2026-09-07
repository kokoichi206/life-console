import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./Button";

const meta = { title: "UI/Button", component: Button, args: { children: "保存する" } } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => { await userEvent.click(canvas.getByRole("button", { name: "保存する" })); },
};
export const Disabled: Story = { args: { disabled: true } };
export const Destructive: Story = { args: { variant: "destructive", children: "削除する" } };
export const Variants: Story = { render: () => <div className="flex gap-3">{(["default", "secondary", "outline", "ghost"] as const).map((variant) => <Button key={variant} variant={variant}>{variant}</Button>)}</div> };
