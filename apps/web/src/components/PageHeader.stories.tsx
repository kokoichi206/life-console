import type { Meta, StoryObj } from "@storybook/react-vite";

import { CountBadge, Field } from "./DesignSystem";
import { PageHeader } from "./PageHeader";
import { Input } from "./ui/input";

const meta = { title: "Components/PageHeader", component: PageHeader, args: { title: "体重と食事" } } satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Health: Story = {};
export const Home: Story = { args: { title: "ホーム", actions: <CountBadge>2026 年 9 月 8 日</CountBadge> } };
export const Finance: Story = {
  args: {
    title: "収支と資産",
    actions: <Field label="集計月" className="min-w-36"><Input type="month" defaultValue="2026-09" /></Field>,
  },
};
export const Operations: Story = { args: { title: "同期・実行状況" } };
