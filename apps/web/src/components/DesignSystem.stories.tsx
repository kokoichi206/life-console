import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Field, Panel, SectionHeading } from "./DesignSystem";
import { Button } from "./ui/Button";
import { Input } from "./ui/input";

const meta = {
  title: "Components/SectionLayout",
  component: Panel,
  render: () => (
    <div className="space-y-6">
      <Panel mobileLayout="section" className="px-5" aria-label="記録セクション">
        <SectionHeading className="px-0" eyebrow="RECORD" title="記録" action={<Button variant="outline">設定</Button>} />
        <Field label="メモ"><Input /></Field>
      </Panel>
      <Panel className="px-5" aria-label="送信確認">
        <p>送信する内容を確認してください。</p>
        <Button>確認して送信</Button>
      </Panel>
    </div>
  ),
} satisfies Meta<typeof Panel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const panel = canvasElement.querySelector("[aria-label=\"記録セクション\"]")!;
    await expect(getComputedStyle(panel).paddingLeft).toBe("20px");
    await expect(getComputedStyle(panel).borderRadius).not.toBe("0px");
  },
};
export const Mobile: Story = {
  parameters: { viewport: { options: { narrow: { name: "幅 320 px", styles: { width: "320px", height: "840px" } } } } },
  globals: { viewport: { value: "narrow", isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const panel = canvasElement.querySelector("[aria-label=\"記録セクション\"]")!;
    await expect(getComputedStyle(panel).paddingLeft).toBe("0px");
    await expect(getComputedStyle(panel).overflow).toBe("visible");
    await expect(getComputedStyle(panel).borderRadius).toBe("0px");
    const confirmation = canvasElement.querySelector("[aria-label=\"送信確認\"]")!;
    await expect(getComputedStyle(confirmation).borderRadius).not.toBe("0px");
    await userEvent.click(canvas.getByRole("button", { name: "設定" }));
    await userEvent.tab();
    await expect(canvas.getByLabelText("メモ")).toHaveFocus();
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
export const MobileDark: Story = { ...Mobile, globals: { ...Mobile.globals, theme: "dark" } };
