import type { Meta, StoryObj } from "@storybook/react-vite";

import { Separator } from "./separator";

const meta = { title: "UI/Separator", component: Separator, args: { orientation: "horizontal" } } satisfies Meta<typeof Separator>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: (args) => (
  <div className="w-64">
    <p>タスク</p>
    <Separator {...args} className="my-4" />
    <p>実行状況</p>
  </div>
) };
