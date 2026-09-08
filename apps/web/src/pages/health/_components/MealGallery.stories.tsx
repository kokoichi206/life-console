import type { Meal } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { expect, fn, within } from "storybook/test";

import { MealGallery } from "./MealGallery";

const meals: Meal[] = Array.from({ length: 9 }, (_, index) => ({
  id: `meal-${index}`, photoId: index === 1 ? null : `photo-${index}`, memo: index === 0 ? "ごはんと焼き魚\n味噌汁" : index === 1 ? "おにぎりとお茶" : "",
  mealKind: index % 2 === 0 ? "dinner" : "lunch", occurredAt: `2026-09-0${9 - index}T09:00:00Z`, recordedAt: "2026-09-09T09:00:00Z", tags: [],
}));
const photoHandler = http.get("*/api/v1/meal-photos/:id/content", () => new HttpResponse(
  "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"600\" height=\"480\" viewBox=\"0 0 600 480\"><rect width=\"600\" height=\"480\" fill=\"#c9aa85\"/><ellipse cx=\"300\" cy=\"240\" rx=\"205\" ry=\"170\" fill=\"#f7f3eb\"/><ellipse cx=\"300\" cy=\"240\" rx=\"170\" ry=\"138\" fill=\"#e7e0d1\"/><ellipse cx=\"240\" cy=\"240\" rx=\"85\" ry=\"90\" fill=\"#fffdf5\"/><path d=\"M320 150 Q480 190 400 300 L310 270Z\" fill=\"#bc784a\"/><circle cx=\"365\" cy=\"320\" r=\"30\" fill=\"#547752\"/><circle cx=\"320\" cy=\"325\" r=\"22\" fill=\"#6e9155\"/></svg>",
  { headers: { "Content-Type": "image/svg+xml" } },
));
const meta = {
  title: "Health/食事の一覧",
  component: MealGallery,
  args: { meals, selectedMealId: undefined, onSelectMeal: fn() },
  parameters: { msw: { handlers: [photoHandler] } },
  render: function GalleryPreview(args) {
    const [selectedMealId, setSelectedMealId] = useState(args.selectedMealId);
    return (
      <MealGallery
        {...args}
        selectedMealId={selectedMealId}
        onSelectMeal={(id) => {
          args.onSelectMeal(id);
          setSelectedMealId(id);
        }}
      />
    );
  },
} satisfies Meta<typeof MealGallery>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Photos: Story = {
  name: "写真とメモの一覧",
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(canvas.getAllByRole("button", { name: /を開く$/ })).toHaveLength(9);
    await expect(canvas.getByText("メモのみ")).toBeVisible();
    const screen = within(canvasElement.ownerDocument.body);
    const mealButton = canvas.getByRole("button", { name: "2026/9/9 18:00 の夕食を開く" });
    await userEvent.click(mealButton);
    const detail = within(await screen.findByRole("dialog", { name: "夕食" }));
    await expect(detail.getByText(/ごはんと焼き魚/)).toHaveTextContent("味噌汁");
    await expect(detail.getByRole("img", { name: "夕食の写真" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(mealButton).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "2026/9/8 18:00 の昼食を開く" }));
    const memoDetail = within(await screen.findByRole("dialog", { name: "昼食" }));
    await expect(memoDetail.getByText("おにぎりとお茶")).toBeVisible();
    await expect(memoDetail.queryByRole("img")).not.toBeInTheDocument();
    await userEvent.click(memoDetail.getByRole("button", { name: "食事の詳細を閉じる" }));
  },
};
export const Dark: Story = { name: "ダーク", globals: { theme: "dark" } };
export const Mobile: Story = { name: "モバイル", decorators: [(Story) => <div className="max-w-[360px]"><Story /></div>] };
export const Empty: Story = { name: "記録なし", args: { meals: [] } };
export const PhotoFailure: Story = {
  name: "写真の取得失敗",
  args: { meals: meals.slice(0, 1).map((meal) => ({ ...meal, photoId: "unavailable-photo" })) },
  parameters: { msw: { handlers: [http.get("*/api/v1/meal-photos/:id/content", () => new HttpResponse(null, { status: 503 }))] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("写真を読み込めませんでした。")).toBeVisible();
    await expect(canvas.getByText(/ごはんと焼き魚/)).toBeVisible();
  },
};
