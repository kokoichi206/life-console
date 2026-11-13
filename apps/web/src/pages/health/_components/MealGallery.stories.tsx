import type { MealNutrition, Meal } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQuery } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { useState } from "react";
import { expect, fn, spyOn, waitFor, within } from "storybook/test";

import type { MealGalleryLayout } from "../health-search";
import { mealsQuery } from "../queries";

import { MealGallery } from "./MealGallery";

const meals: Meal[] = Array.from({ length: 9 }, (_, index) => ({
  id: `meal-${index}`, photoId: index === 1 ? null : `photo-${index}`, additionalPhotoIds: [], memo: index === 0 ? "ごはんと焼き魚\n味噌汁" : index === 1 ? "おにぎりとお茶" : "",
  occurredAt: `2026-09-0${9 - index}T09:00:00Z`, recordedAt: "2026-09-09T09:00:00Z", tags: [],
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
  args: { meals, layout: "horizontal", onLayoutChange: fn(), selectedMealId: undefined, onSelectMeal: fn() },
  parameters: { msw: { handlers: [photoHandler, nutritionHandler] } },
  render: function GalleryPreview(args) {
    const [selectedMealId, setSelectedMealId] = useState(args.selectedMealId);
    const [layout, setLayout] = useState(args.layout);
    return (
      <MealGallery
        {...args}
        layout={layout}
        onLayoutChange={(next) => {
          args.onLayoutChange(next);
          setLayout(next);
        }}
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
    const mealButton = canvas.getByRole("button", { name: "2026/9/9 18:00 の食事を開く" });
    await userEvent.click(mealButton);
    const detail = within(await screen.findByRole("dialog", { name: "食事の記録" }));
    await expect(detail.getByText(/ごはんと焼き魚/)).toHaveTextContent("味噌汁");
    await expect(detail.getByRole("img", { name: "食事の写真 1" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(mealButton).toHaveFocus());
    await userEvent.click(canvas.getByRole("button", { name: "2026/9/8 18:00 の食事を開く" }));
    const memoDetail = within(await screen.findByRole("dialog", { name: "食事の記録" }));
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
    await expect(await canvas.findByLabelText("2026-09-09 の記録済みカロリー")).toBeVisible();
    const detail = within(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "食事の記録" }));
    await expect(await detail.findByText("推定 約 650 kcal")).toBeVisible();
    await expect(detail.getByText("C 炭水化物").parentElement).toHaveTextContent("87.5 g");
  },
};
export const AnalysisPending: Story = {
  name: "runner の解析待ち", args: { selectedMealId: "meal-0" },
  parameters: { msw: { handlers: [photoHandler, http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: nutrition.map((entry) => ({ ...entry, analysisStatus: "queued" })) }))] } },
  play: async ({ canvasElement }) => {
    const detail = within(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "食事の記録" }));
    await expect(await detail.findByRole("button", { name: "解析待ち・解析中" })).toBeDisabled();
  },
};
export const AnalysisFailure: Story = {
  name: "解析失敗と再実行", args: { selectedMealId: "meal-0" },
  parameters: { msw: { handlers: [photoHandler, http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: nutrition.map((entry) => ({ ...entry, analysisStatus: "failed", analysisSummary: "写真から解析を予約できませんでした。" })) })),
    http.post("*/api/v1/nutrition/analyze", () => HttpResponse.json({ error: { message: "解析を予約できませんでした。" } }, { status: 503 }))] } },
  play: async ({ canvasElement, userEvent }) => {
    const detail = within(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "食事の記録" }));
    await expect(await detail.findByText("写真から解析を予約できませんでした。")).toBeVisible();
    await userEvent.click(await detail.findByRole("button", { name: "栄養を再解析" }));
    await expect(await detail.findByText("解析を予約できませんでした。")).toBeVisible();
    await expect(detail.getByText("推定 約 650 kcal")).toBeVisible();
  },
};

export const NutritionForSelectedPeriod: Story = {
  name: "日別カロリーを表示中の食事の期間に合わせる",
  args: { meals: meals.slice(0, 1), periodLabel: "2026-09-09 〜 2026-09-09・新しい順" },
  play: async ({ canvas }) => {
    const day = within(await canvas.findByRole("region", { name: "2026-09-09 の食事" }));
    await expect(day.getByText("2026-09-09")).toBeVisible();
    await expect(await day.findByLabelText("2026-09-09 の記録済みカロリー")).toHaveTextContent("650 kcal");
    await expect(canvas.queryByRole("region", { name: "2026-09-08 の食事" })).not.toBeInTheDocument();
  },
};

export const EditCalories: Story = {
  name: "写真を開いてカロリーを変更",
  parameters: { msw: { handlers: [photoHandler,
    http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: nutrition })),
    http.post("*/api/v1/nutrition/analyze", async ({ request }) => {
      const { mealId } = await request.json() as { mealId: string };
      const entry = nutrition.find((meal) => meal.mealId === mealId)!;
      nutrition.splice(nutrition.indexOf(entry), 1, { ...entry, estimate: { ...entry.estimate!, proteinGrams: 35 }, analysisStatus: "succeeded" });
      return HttpResponse.json({ data: { id: "reanalysis" } });
    }),
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
    await userEvent.click(canvas.getByRole("button", { name: "2026/9/9 18:00 の食事を開く" }));
    const detail = within(await screen.findByRole("dialog"));
    const input = await detail.findByLabelText("カロリー（kcal）");
    await expect(input).toHaveValue(650);
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    await userEvent.click(detail.getByRole("button", { name: "カロリーを保存" }));
    await expect(await detail.findByText("0 kcal（手入力）")).toBeVisible();
    await expect(detail.getByText("C 炭水化物").parentElement).toHaveTextContent("87.5 g");
    await expect(detail.getByRole("button", { name: "栄養を再解析" })).toBeEnabled();
    await userEvent.click(detail.getByRole("button", { name: "栄養を再解析" }));
    await waitFor(() => expect(detail.getByText("P たんぱく質").parentElement).toHaveTextContent("35 g"));
    await expect(detail.getByText("0 kcal（手入力）")).toBeVisible();
    await userEvent.click(detail.getByRole("button", { name: "食事の詳細を閉じる" }));
    await waitFor(() => expect(canvas.getByLabelText("2026-09-09 の記録済みカロリー")).toHaveTextContent(/^0 kcal/));
    await userEvent.click(canvas.getByRole("button", { name: "2026/9/9 18:00 の食事を開く" }));
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

export const ManualCaloriesDuringAnalysis: Story = {
  name: "手入力後も解析を継続", args: { selectedMealId: "meal-0" },
  parameters: { msw: { handlers: [photoHandler, http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: nutrition.map((entry, index) => index === 0 ? { ...entry, manualCaloriesKcal: 520, analysisStatus: "running" } : entry) }))] } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const detail = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
    await expect(await detail.findByText("Mac の runner で順番に解析します。「栄養の結果を更新」で結果を確認できます。")).toBeVisible();
    await expect(detail.getByText("520 kcal（手入力）")).toBeVisible();
    await expect(detail.getByRole("button", { name: "解析待ち・解析中" })).toBeDisabled();
    await userEvent.click(detail.getByRole("button", { name: "食事の詳細を閉じる" }));
    await expect(await canvas.findByRole("button", { name: "未解析の食事をまとめて解析" })).toBeDisabled();
  },
};

export const AnalyzeMemo: Story = {
  name: "メモだけの手入力記録の解析予約と失敗表示", args: { selectedMealId: "meal-1" },
  parameters: { msw: { handlers: [photoHandler,
    http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: nutrition.map((entry) => entry.mealId === "meal-1" ? { ...entry, manualCaloriesKcal: 200 } : entry) })),
    http.post("*/api/v1/nutrition/analyze", async ({ request }) => {
      await expect(await request.json()).toEqual({ mealId: "meal-1" });
      return HttpResponse.json({ error: { message: "解析を予約できませんでした。" } }, { status: 503 });
    }),
  ] } },
  play: async ({ canvasElement, userEvent }) => {
    const detail = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
    const analyzeButton = await detail.findByRole("button", { name: "栄養を解析" });
    await waitFor(() => expect(analyzeButton).toBeEnabled());
    await userEvent.click(analyzeButton);
    await expect(await detail.findByText("解析を予約できませんでした。")).toBeVisible();
    await expect(detail.getByText("200 kcal（手入力）")).toBeVisible();
  },
};

export const AnalyzeMemoInBulk: Story = {
  name: "未解析のメモだけでも一括解析できる",
  args: { meals: [meals[1]!] },
  parameters: { msw: { handlers: [
    http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: [nutrition[1]!] })),
    http.post("*/api/v1/nutrition/analyze", async ({ request }) => {
      await expect(await request.json()).toEqual({});
      return HttpResponse.json({ error: { message: "解析を予約できませんでした。" } }, { status: 503 });
    }),
  ] } },
  play: async ({ canvas, userEvent }) => {
    const analyzeButton = canvas.getByRole("button", { name: "未解析の食事をまとめて解析" });
    await waitFor(() => expect(analyzeButton).toBeEnabled());
    await userEvent.click(analyzeButton);
    await expect(await canvas.findByText("解析を予約できませんでした。")).toBeVisible();
  },
};

const refreshedNutrition = fn();
const nutritionIntervals = { delays: (): Array<number | undefined> => [] };
export const RefreshAnalysisResult: Story = {
  name: "解析結果を手動で更新",
  args: { selectedMealId: "meal-0" },
  beforeEach: () => {
    refreshedNutrition.mockReset();
    const intervalSpy = spyOn(window, "setInterval");
    nutritionIntervals.delays = () => intervalSpy.mock.calls.map((call) => call[1]);
    return () => {
      intervalSpy.mockRestore();
    };
  },
  parameters: { msw: { handlers: [photoHandler,
    http.get("*/api/v1/nutrition", () => {
      refreshedNutrition();
      return HttpResponse.json({ data: nutrition.map((entry, index) => index === 0
        ? { ...entry, analysisStatus: refreshedNutrition.mock.calls.length === 1 ? "running" : "succeeded" }
        : entry) });
    }),
  ] } },
  play: async ({ canvasElement, userEvent }) => {
    const detail = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
    await expect(await detail.findByRole("button", { name: "解析待ち・解析中" })).toBeDisabled();
    const input = await detail.findByLabelText("カロリー（kcal）");
    await userEvent.clear(input);
    await userEvent.type(input, "520");
    await userEvent.click(detail.getByRole("button", { name: "栄養の結果を更新" }));
    await expect(await detail.findByRole("button", { name: "栄養を再解析" })).toBeEnabled();
    await expect(input).toHaveValue(520);
    await expect(refreshedNutrition).toHaveBeenCalledTimes(2);
    await expect(nutritionIntervals.delays()).not.toContain(5_000);
    await expect(nutritionIntervals.delays()).not.toContain(60_000);
  },
};

export const MultiplePhotos: Story = {
  args: { meals: [{ ...meals[0]!, additionalPhotoIds: ["photo-second", "photo-third", "photo-fourth"] }] },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByText("4 枚")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /の食事を開く/ }));
    const screen = within(canvasElement.ownerDocument.body);
    const detail = within(await screen.findByRole("dialog", { name: "食事の記録" }));
    await expect(detail.getAllByRole("img")).toHaveLength(4);
    await expect(detail.getByRole("img", { name: "食事の写真 4" })).toHaveAttribute("src", "/api/v1/meal-photos/photo-fourth/content");
    await expect(detail.getByText(/4 枚 · 横にスワイプ/)).toBeVisible();
  },
};

const deletedMealIds = new Set<string>();
const deletedMealRequest = fn();
const restoredMealRequest = fn();
const deletionHandlers = (failure?: "delete" | "restore") => [photoHandler,
  http.get("*/api/v1/meals", () => HttpResponse.json({ data: meals.filter((meal) => !deletedMealIds.has(meal.id)) })),
  http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: nutrition.filter((meal) => !deletedMealIds.has(meal.mealId)) })),
  http.delete("*/api/v1/meals/:id", async ({ params }) => {
    deletedMealRequest(params.id);
    await delay(200);
    if (failure === "delete") return HttpResponse.json({ error: { message: "食事を削除できませんでした。" } }, { status: 503 });
    deletedMealIds.add(String(params.id));
    return HttpResponse.json({ data: null });
  }),
  http.post("*/api/v1/meals/:id/restore", ({ params }) => {
    restoredMealRequest(params.id);
    if (failure === "restore") return HttpResponse.json({ error: { message: "食事を元に戻せませんでした。" } }, { status: 503 });
    deletedMealIds.delete(String(params.id));
    return HttpResponse.json({ data: null });
  }),
];
const resetDeletionStory = () => {
  deletedMealIds.clear();
  deletedMealRequest.mockReset();
  restoredMealRequest.mockReset();
};
const DeletionGallery = () => {
  const records = useQuery(mealsQuery);
  const [selectedMealId, setSelectedMealId] = useState<string>();
  const [layout, setLayout] = useState<MealGalleryLayout>("horizontal");
  return <MealGallery layout={layout} onLayoutChange={setLayout} meals={records.data ?? []} selectedMealId={selectedMealId} onSelectMeal={setSelectedMealId} />;
};

export const DeleteAndRestore: Story = {
  name: "対象を確認して 1 件削除し、元に戻す",
  render: () => <DeletionGallery />,
  beforeEach: resetDeletionStory,
  parameters: { msw: { handlers: deletionHandlers() } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "2 列折り返し" }));
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "2026/9/9 18:00 の食事を開く" }));
    const detail = within(await screen.findByRole("dialog", { name: "食事の記録" }));
    await userEvent.click(detail.getByRole("button", { name: "この食事を削除" }));
    let confirmation = within(await screen.findByRole("alertdialog"));
    await expect(confirmation.getByText("食事日時：2026/9/9 18:00")).toBeVisible();
    await expect(confirmation.getByText("登録日時：2026/9/9 18:00:00")).toBeVisible();
    await expect(confirmation.getByRole("img", { name: "削除対象の食事の代表写真" })).toBeVisible();
    await expect(confirmation.getByText(/ごはんと焼き魚/)).toHaveTextContent("味噌汁");
    await expect(confirmation.getByRole("button", { name: "キャンセル" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(deletedMealRequest).not.toHaveBeenCalled();
    await userEvent.click(detail.getByRole("button", { name: "この食事を削除" }));
    await screen.findByRole("alertdialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(screen.getByRole("dialog", { name: "食事の記録" })).toBeVisible();
    await expect(deletedMealRequest).not.toHaveBeenCalled();
    await userEvent.click(detail.getByRole("button", { name: "この食事を削除" }));
    confirmation = within(await screen.findByRole("alertdialog"));
    await userEvent.click(confirmation.getByRole("button", { name: "確認した食事を削除" }));
    await expect(await confirmation.findByRole("button", { name: "削除しています…" })).toBeDisabled();
    await expect(await canvas.findByText("2026/9/9 18:00 の食事を削除しました。")).toBeVisible();
    await waitFor(() => expect(canvas.getAllByRole("button", { name: /の食事を開く$/ })).toHaveLength(8));
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(deletedMealRequest).toHaveBeenCalledTimes(1);
    await expect(deletedMealRequest).toHaveBeenCalledWith("meal-0");
    await expect(canvas.queryByRole("region", { name: "2026-09-09 の食事" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "元に戻す" }));
    await waitFor(() => expect(canvas.getAllByRole("button", { name: /の食事を開く$/ })).toHaveLength(9));
    await expect(await canvas.findByLabelText("2026-09-09 の記録済みカロリー")).toHaveTextContent("650 kcal");
    await expect(canvas.getByRole("button", { name: "2 列折り返し" })).toHaveAttribute("aria-pressed", "true");
    await expect(restoredMealRequest).toHaveBeenCalledTimes(1);
    await expect(restoredMealRequest).toHaveBeenCalledWith("meal-0");
    await expect(canvas.queryByRole("button", { name: "元に戻す" })).not.toBeInTheDocument();
  },
};

export const DeleteFailure: Story = {
  name: "削除失敗でも対象と確認画面を保持",
  render: () => <DeletionGallery />,
  beforeEach: resetDeletionStory,
  parameters: { msw: { handlers: deletionHandlers("delete") } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "2026/9/8 18:00 の食事を開く" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "この食事を削除" }));
    const confirmation = within(await screen.findByRole("alertdialog"));
    await expect(confirmation.getByText("おにぎりとお茶")).toBeVisible();
    await expect(confirmation.queryByRole("img")).not.toBeInTheDocument();
    await userEvent.click(confirmation.getByRole("button", { name: "確認した食事を削除" }));
    await expect(await confirmation.findByRole("alert")).toHaveTextContent("食事を削除できませんでした。");
    await expect(confirmation.getByRole("button", { name: "確認した食事を削除" })).toBeEnabled();
    await userEvent.click(confirmation.getByRole("button", { name: "キャンセル" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "食事の詳細を閉じる" }));
    await expect(canvas.getAllByRole("button", { name: /の食事を開く$/ })).toHaveLength(9);
    await expect(canvas.queryByRole("button", { name: "元に戻す" })).not.toBeInTheDocument();
  },
};

export const RestoreFailure: Story = {
  name: "取り消し失敗でも元に戻す操作を残す",
  render: () => <DeletionGallery />,
  beforeEach: resetDeletionStory,
  parameters: { msw: { handlers: deletionHandlers("restore") } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "2026/9/9 18:00 の食事を開く" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "この食事を削除" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "確認した食事を削除" }));
    await userEvent.click(await canvas.findByRole("button", { name: "元に戻す" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("食事を元に戻せませんでした。");
    await expect(canvas.getByRole("button", { name: "元に戻す" })).toBeEnabled();
    await expect(deletedMealIds.has("meal-0")).toBe(true);
  },
};

const groupedMeals: Meal[] = Array.from({ length: 7 }, (_, index) => ({
  ...meals[0]!, id: `grouped-${index}`, photoId: index === 4 ? null : `grouped-photo-${index}`,
  additionalPhotoIds: index === 2 ? ["grouped-extra"] : [], memo: index === 4 ? "写真なしの食事" : "比較用の食事",
  occurredAt: new Date(Date.parse("2026-11-12T21:00:00+09:00") - index * 3_600_000).toISOString(),
}));
const groupedNutrition: MealNutrition[] = groupedMeals.map((meal, index) => ({
  ...nutrition[1]!, mealId: meal.id, photoId: meal.photoId, occurredAt: meal.occurredAt, manualCaloriesKcal: index === 4 ? null : 100,
}));
export const DailyLayouts: Story = {
  name: "日別の横送りと 2 列折り返しを切り替える",
  args: { meals: [...groupedMeals, { ...meals[1]!, occurredAt: "2026-11-11T14:59:00Z" }] },
  decorators: [(Story) => <div className="max-w-[360px]"><Story /></div>],
  parameters: { msw: { handlers: [photoHandler, http.get("*/api/v1/nutrition", () => HttpResponse.json({ data: groupedNutrition }))] } },
  play: async ({ canvas, userEvent }) => {
    const day = within(canvas.getByRole("region", { name: "2026-11-12 の食事" }));
    const row = day.getByRole("region", { name: "2026-11-12 の食事の一覧" });
    await expect(canvas.getByRole("button", { name: "横スクロール" })).toHaveAttribute("aria-pressed", "true");
    await expect(day.getAllByRole("button", { name: /の食事を開く/ })).toHaveLength(7);
    await expect(await day.findByLabelText("2026-11-12 の記録済みカロリー")).toHaveTextContent("600 kcalカロリー記録 6 / 7 件（未記録あり）");
    await expect(day.getByText("2 枚")).toBeVisible();
    await expect(canvas.getByRole("region", { name: "2026-11-11 の食事" })).toHaveTextContent("1 件の食事");
    await expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
    await expect(day.queryByRole("button", { name: /の(前|次)の食事へ/ })).not.toBeInTheDocument();
    await expect(day.queryByText("横にスワイプで食事を見る")).not.toBeInTheDocument();
    row.scrollTo({ left: row.clientWidth, behavior: "instant" });
    await waitFor(() => expect(row.scrollLeft).toBeGreaterThan(150));
    await userEvent.click(canvas.getByRole("button", { name: "2 列折り返し" }));
    await expect(canvas.getByRole("button", { name: "2 列折り返し" })).toHaveAttribute("aria-pressed", "true");
    await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
    const cards = day.getAllByRole("button", { name: /の食事を開く/ });
    await expect(cards[0]!.getBoundingClientRect().top).toBe(cards[1]!.getBoundingClientRect().top);
    await expect(cards[2]!.getBoundingClientRect().top).toBeGreaterThan(cards[0]!.getBoundingClientRect().top);
    await expect(day.getByText("写真なしの食事")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "横スクロール" }));
    await waitFor(() => expect(row.scrollLeft).toBeGreaterThan(150));
    await expect(day.getAllByRole("button", { name: /の食事を開く/ })).toHaveLength(7);
  },
};

export const JapanDateBoundary: Story = {
  name: "日本時間の深夜で日を分ける",
  args: { meals: [
    { ...meals[0]!, id: "after-midnight", occurredAt: "2026-11-12T15:00:00Z" },
    { ...meals[1]!, id: "before-midnight", occurredAt: "2026-11-12T14:59:00Z" },
  ] },
  play: async ({ canvas }) => {
    await expect(within(canvas.getByRole("region", { name: "2026-11-13 の食事" })).getByRole("button", { name: "2026/11/13 00:00 の食事を開く" })).toBeVisible();
    await expect(within(canvas.getByRole("region", { name: "2026-11-12 の食事" })).getByRole("button", { name: "2026/11/12 23:59 の食事を開く" })).toBeVisible();
  },
};
