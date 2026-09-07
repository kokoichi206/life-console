import type { Meta, StoryObj } from "@storybook/react-vite";

import { Card } from "./card";

const meta = { title: "UI/Card", component: Card, args: { children: (
  <div className="px-4">
    <h2 className="font-semibold">今日のタスク</h2>
    <p className="text-muted-foreground">確認待ちの連絡があります。</p>
  </div>
) } } satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: "sm" } };
