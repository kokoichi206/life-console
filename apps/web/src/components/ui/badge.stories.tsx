import type { Meta, StoryObj } from "@storybook/react-vite";

import { Badge } from "./badge";

const meta = { title: "UI/Badge", component: Badge, args: { children: "実行待ち" } } satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Error: Story = { args: { variant: "destructive", children: "結果不明" } };
export const Outline: Story = { args: { variant: "outline", children: "確認待ち" } };
