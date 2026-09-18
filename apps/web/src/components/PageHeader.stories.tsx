import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

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

export const NarrowFinance: Story = {
  ...Finance,
  parameters: { viewport: { options: { mobile: { name: "幅 320 px", styles: { width: "320px", height: "840px" } } } } },
  globals: { viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const heading = canvas.getByRole("heading", { name: "収支と資産" });
    await expect(heading.getBoundingClientRect().height).toBeLessThan(50);
    await expect(canvas.getByLabelText("集計月").getBoundingClientRect().top).toBeGreaterThanOrEqual(heading.getBoundingClientRect().bottom);
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
