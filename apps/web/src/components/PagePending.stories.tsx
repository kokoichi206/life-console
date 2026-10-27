import type { Meta, StoryObj } from "@storybook/react-vite";

import { PagePending } from "./PagePending";

const meta = { title: "Components/PagePending", component: PagePending, args: { title: "ホーム" } } satisfies Meta<typeof PagePending>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {};
export const Health: Story = { args: { title: "体重・運動・食事" } };
export const SharedHealth: Story = { args: { title: "体重・運動・食事", shared: true } };
