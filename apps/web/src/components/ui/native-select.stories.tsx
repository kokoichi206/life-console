import type { Meta, StoryObj } from "@storybook/react-vite";

import { NativeSelect } from "./native-select";

const meta = {
  title: "UI/NativeSelect",
  component: NativeSelect,
  args: {
    "aria-label": "サービス",
    "children": (
      <>
        <option value="all">すべて</option>
        <option value="slack">Slack</option>
        <option value="chatwork">Chatwork</option>
      </>
    ),
  },
} satisfies Meta<typeof NativeSelect>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => { await userEvent.selectOptions(canvas.getByRole("combobox", { name: "サービス" }), "chatwork"); },
};
export const Disabled: Story = { args: { disabled: true } };
