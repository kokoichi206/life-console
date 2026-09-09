import type { MealNutrition, Meal } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { MealGallery } from "./MealGallery";

const meals: Meal[] = Array.from({ length: 9 }, (_, index) => ({
  id: `meal-${index}`, photoId: index === 1 ? null : `photo-${index}`, memo: index === 0 ? "ごはんと焼き魚\n味噌汁" : index === 1 ? "おにぎりとお茶" : "",
  mealKind: index % 2 === 0 ? "dinner" : "lunch", occurredAt: `2026-09-0${9 - index}T09:00:00Z`, recordedAt: "2026-09-09T09:00:00Z", tags: [],
}));
const nutrition: MealNutrition[] = meals.map((meal, index) => ({ mealId: meal.id, photoId: meal.photoId, occurredAt: meal.occurredAt,
  estimate: index === 0
    ? { caloriesKcal: 650, proteinGrams: 30, fatGrams: 20, carbohydrateGrams: 87.5,
        model: "test-model", analyzedAt: "2026-09-09T10:00:00Z", inputHash: "a".repeat(64) }
    : null,
  manualCaloriesKcal: null, analysisStatus: null, analysisSummary: null,
}));
const nutritionHandler = http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: nutrition }));
const photoHandler = http.get("*/api/v1/meal-photos/:id/content", () => new HttpResponse(
  "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"600\" height=\"480\" viewBox=\"0 0 600 480\"><rect width=\"600\" height=\"480\" fill=\"#c9aa85\"/><ellipse cx=\"300\" cy=\"240\" rx=\"205\" ry=\"170\" fill=\"#f7f3eb\"/><ellipse cx=\"300\" cy=\"240\" rx=\"170\" ry=\"138\" fill=\"#e7e0d1\"/><ellipse cx=\"240\" cy=\"240\" rx=\"85\" ry=\"90\" fill=\"#fffdf5\"/><path d=\"M320 150 Q480 190 400 300 L310 270Z\" fill=\"#bc784a\"/><circle cx=\"365\" cy=\"320\" r=\"30\" fill=\"#547752\"/><circle cx=\"320\" cy=\"325\" r=\"22\" fill=\"#6e9155\"/></svg>",
  { headers: { "Content-Type": "image/svg+xml" } },
));
const meta = {
  title: "Health/食事の一覧",
  component: MealGallery,
  args: { meals, selectedMealId: undefined, onSelectMeal: fn() },
  parameters: { msw: { handlers: [photoHandler, nutritionHandler] } },
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
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(mealButton).toHaveFocus());
    await userEvent.click(canvas.getByRole("button", { name: "2026/9/8 18:00 の昼食を開く" }));
    const memoDetail = within(await screen.findByRole("dialog", { name: "昼食" }));
    await expect(memoDetail.getByText("おにぎりとお茶")).toBeVisible();
    await expect(memoDetail.queryByRole("img")).not.toBeInTheDocument();
    await userEvent.click(memoDetail.getByRole("button", { name: "食事の詳細を閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
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

export const Estimated: Story = {
  name: "推定カロリーと日別合計", args: { selectedMealId: "meal-0" },
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByText("650 kcal", { selector: "td" })).toBeVisible();
    const detail = within(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "夕食" }));
    await expect(await detail.findByText("推定 約 650 kcal")).toBeVisible();
    await expect(detail.getByText(/炭水化物 87.5 g/)).toBeVisible();
  },
};
export const AnalysisPending: Story = {
  name: "runner の解析待ち", args: { selectedMealId: "meal-0" },
  parameters: { msw: { handlers: [photoHandler, http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: nutrition.map((entry) => ({ ...entry, analysisStatus: "queued" })) }))] } },
  play: async ({ canvasElement }) => {
    const detail = within(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "夕食" }));
    await expect(await detail.findByRole("button", { name: "解析待ち・解析中" })).toBeDisabled();
  },
};
export const AnalysisFailure: Story = {
  name: "解析失敗と再実行", args: { selectedMealId: "meal-0" },
  parameters: { msw: { handlers: [photoHandler, http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: nutrition.map((entry) => ({ ...entry, analysisStatus: "failed", analysisSummary: "写真から食品や分量を判断できませんでした。" })) })),
    http.post("*/api/v1/nutrition/analyze", () => HttpResponse.json({ error: { message: "解析を予約できませんでした。" } }, { status: 503 }))] } },
  play: async ({ canvasElement, userEvent }) => {
    const detail = within(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "夕食" }));
    await expect(await detail.findByText("写真から食品や分量を判断できませんでした。")).toBeVisible();
    await userEvent.click(await detail.findByRole("button", { name: "カロリーを再解析" }));
    await expect(await detail.findByText("解析を予約できませんでした。")).toBeVisible();
    await expect(detail.getByText("推定 約 650 kcal")).toBeVisible();
  },
};

export const NutritionForSelectedPeriod: Story = {
  name: "日別カロリーを表示中の食事の期間に合わせる",
  args: { meals: meals.slice(0, 1), periodLabel: "2026-09-09 〜 2026-09-09・新しい順" },
  play: async ({ canvas }) => {
    const summary = within(await canvas.findByRole("table"));
    await expect(summary.getByText("2026-09-09")).toBeVisible();
    await expect(summary.getByText("650 kcal")).toBeVisible();
    await expect(summary.queryByText("2026-09-08")).not.toBeInTheDocument();
    await expect(summary.getAllByRole("row")).toHaveLength(2);
  },
};

export const EditCalories: Story = {
  name: "写真を開いてカロリーを変更",
  parameters: { msw: { handlers: [photoHandler,
    http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: nutrition })),
    http.put("*/api/v1/nutrition/:id/calories", async ({ request, params }) => {
      const input = await request.json() as { caloriesKcal: number };
      const entry = nutrition.find((meal) => meal.mealId === params.id)!;
      nutrition.splice(nutrition.indexOf(entry), 1, { ...entry, manualCaloriesKcal: input.caloriesKcal });
      return HttpResponse.json({ data: null });
    }),
  ] } },
  beforeEach: () => {
    const original = nutrition[0]!;
    nutrition[0] = { ...original, manualCaloriesKcal: null };
    return () => {
      nutrition[0] = original;
    };
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "2026/9/9 18:00 の夕食を開く" }));
    const detail = within(await screen.findByRole("dialog"));
    const input = await detail.findByLabelText("カロリー（kcal）");
    await expect(input).toHaveValue(650);
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    await userEvent.click(detail.getByRole("button", { name: "カロリーを保存" }));
    await expect(await detail.findByText("0 kcal（手入力）")).toBeVisible();
    await expect(detail.queryByRole("button", { name: "カロリーを再解析" })).not.toBeInTheDocument();
    await userEvent.click(detail.getByRole("button", { name: "食事の詳細を閉じる" }));
    await expect(await canvas.findByText("0 kcal", { selector: "td" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "2026/9/9 18:00 の夕食を開く" }));
    await expect(await within(await screen.findByRole("dialog")).findByLabelText("カロリー（kcal）")).toHaveValue(0);
  },
};
export const SaveCaloriesFailure: Story = {
  name: "カロリーの保存失敗と入力保持", args: { selectedMealId: "meal-0" },
  parameters: { msw: { handlers: [photoHandler, nutritionHandler,
    http.put("*/api/v1/nutrition/:id/calories", () => HttpResponse.json({ error: { message: "保存できませんでした。" } }, { status: 503 })),
  ] } },
  play: async ({ canvasElement, userEvent }) => {
    const detail = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
    const input = await detail.findByLabelText("カロリー（kcal）");
    await userEvent.clear(input);
    await userEvent.type(input, "520");
    await userEvent.click(detail.getByRole("button", { name: "カロリーを保存" }));
    await expect(await detail.findByRole("alert")).toHaveTextContent("保存できませんでした。");
    await expect(input).toHaveValue(520);
  },
};

export const ManualCaloriesCancelingAnalysis: Story = {
  name: "手入力後の解析中止待ち", args: { selectedMealId: "meal-0" },
  parameters: { msw: { handlers: [photoHandler, http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: nutrition.map((entry, index) => index === 0 ? { ...entry, manualCaloriesKcal: 520, analysisStatus: "running" } : entry) }))] } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const detail = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
    await expect(await detail.findByText("画像解析の中止を待っています。")).toBeVisible();
    await expect(detail.getByText("520 kcal（手入力）")).toBeVisible();
    await expect(detail.queryByRole("button", { name: "カロリーを再解析" })).not.toBeInTheDocument();
    await userEvent.click(detail.getByRole("button", { name: "食事の詳細を閉じる" }));
    await expect(await canvas.findByRole("button", { name: "未解析の食事をまとめて解析" })).toBeDisabled();
  },
};
