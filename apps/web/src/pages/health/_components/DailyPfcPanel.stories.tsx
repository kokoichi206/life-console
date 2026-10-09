import type { MealNutrition } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, within } from "storybook/test";

import { DailyPfcPanel } from "./DailyPfcPanel";

const nutrition: MealNutrition[] = [
  { mealId: "estimated", photoId: null, occurredAt: "2026-10-09T09:00:00+09:00", manualCaloriesKcal: null, analysisStatus: null, analysisSummary: null, estimate: { caloriesKcal: 500, proteinGrams: 65, fatGrams: 30, carbohydrateGrams: 150, model: "sample", analyzedAt: "2026-10-09T09:05:00+09:00", inputHash: "a".repeat(64) } },
  { mealId: "manual", photoId: null, occurredAt: "2026-10-09T19:00:00+09:00", manualCaloriesKcal: 750, analysisStatus: null, analysisSummary: null, estimate: null },
];
const meta = {
  title: "Health/PFC バランス",
  component: DailyPfcPanel,
  args: { nutrition, from: "2026-10-03", to: "2026-10-09", selectedDay: undefined, onSelectDay: () => undefined, pending: false, errorMessage: null },
  decorators: [(Story, context) => {
    const [selectedDay, setSelectedDay] = useState<string | undefined>(context.args.selectedDay);
    return <Story args={{ ...context.args, selectedDay, onSelectDay: setSelectedDay }} />;
  }],
} satisfies Meta<typeof DailyPfcPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Partial: Story = {
  name: "手入力カロリーがあっても PFC は未解析",
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("10/9：記録した 2 食中 1 食を解析済み")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "2026-10-09 の PFC と食事を見る" })).toHaveAttribute("aria-pressed", "false");
    await expect(canvas.getByText("解析済み分の合計です。未解析の食事は含めていません。")).toBeVisible();
    await userEvent.click(canvas.getByText(/^割合の目安：/));
    const weight = canvas.getByRole("spinbutton", { name: "体重の例（kg）" });
    await userEvent.clear(weight);
    await userEvent.type(weight, "65");
    await userEvent.click(canvas.getByRole("button", { name: "例を再計算" }));
    await expect(canvas.getAllByText("計算例 約 130 g / 日")).toHaveLength(1);
    await userEvent.click(canvas.getByRole("button", { name: "2026-10-08 の PFC と食事を見る" }));
    await expect(canvas.getByText("この日の食事記録はありません。")).toBeVisible();
  },
};
export const Dark: Story = { globals: { theme: "dark" } };
export const Mobile: Story = { decorators: [(Story) => <div className="max-w-90"><Story /></div>] };
export const Loading: Story = { args: { nutrition: undefined, pending: true } };
export const Failed: Story = { args: { nutrition: undefined, errorMessage: "栄養を取得できませんでした。" }, play: async ({ canvas }) => {
  await expect(canvas.getByRole("alert")).toBeVisible();
  await expect(canvas.queryByText("この日の食事記録はありません。")).not.toBeInTheDocument();
} };
export const Empty: Story = { args: { nutrition: [] } };
export const Zero: Story = {
  args: { nutrition: [{ ...nutrition[0]!, estimate: { ...nutrition[0]!.estimate!, proteinGrams: 0, fatGrams: 0, carbohydrateGrams: 0 } }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("10/9：記録した 1 食中 1 食を解析済み")).toBeVisible();
    await expect(canvas.getAllByText("PFC は全て 0 g のため、構成比はありません。")).toHaveLength(2);
  },
};
export const InvalidGoal: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText(/^割合の目安：/));
    const intake = canvas.getByRole("spinbutton", { name: "摂取量の例（kcal / 日）" });
    await userEvent.clear(intake);
    await userEvent.type(intake, "500");
    await userEvent.click(canvas.getByRole("button", { name: "例を再計算" }));
    await expect(within(canvas.getByRole("alert")).getByText(/0 以下/)).toBeVisible();
    await expect(canvas.getAllByText("計算例 約 140 g / 日")).toHaveLength(1);
  },
};

export const DecimalTotals: Story = {
  args: { nutrition: [12.3, 45.6].map((proteinGrams, index) => ({ ...nutrition[0]!, mealId: `decimal-${index}`, estimate: { ...nutrition[0]!.estimate!, proteinGrams } })) },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText(/57\.9/)).toHaveLength(2);
    await expect(canvas.queryByText(/57\.9000/)).not.toBeInTheDocument();
  },
};
