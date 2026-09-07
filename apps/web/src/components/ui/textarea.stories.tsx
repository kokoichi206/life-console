import type { Meta, StoryObj } from "@storybook/react-vite";

import { Textarea } from "./textarea";

const meta = { title: "UI/Textarea", component: Textarea, args: { "aria-label": "返信の下書き", "placeholder": "返信を入力" } } satisfies Meta<typeof Textarea>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Draft: Story = { args: { defaultValue: "ご連絡ありがとうございます。\n内容を確認してご連絡します。" } };
export const Disabled: Story = { args: { disabled: true } };
