import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "./label";

const meta = { title: "UI/Label", component: Label, args: { children: "メモ", htmlFor: "story-memo" } } satisfies Meta<typeof Label>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: (args) => (
  <div>
    <Label {...args} />
    <input id="story-memo" className="ml-3 rounded border p-2" />
  </div>
) };
