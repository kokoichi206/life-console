import type { MealNutrition } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import { calorieBalanceRows, type ExerciseInput } from "../calorie-balance";
import type { ExerciseDayCalories } from "../exercise-calories";

import { DailyCalorieBalanceList } from "./DailyCalorieBalanceList";

const PERIOD = { from: "2026-09-02", to: "2026-09-13" } as const;
const meal = (mealId: string, date: string, caloriesKcal: number | null): MealNutrition => ({
  mealId, photoId: null, occurredAt: `${date}T12:00:00+09:00`, manualCaloriesKcal: caloriesKcal, estimate: null, analysisStatus: null, analysisSummary: null,
});
const exercise = (kcal: number, pendingActivities = 0, unavailableActivities = 0): ExerciseDayCalories => ({ kcal, pendingActivities, unavailableActivities });
const tracked = (byDay: Record<string, ExerciseDayCalories>): ExerciseInput => ({ mode: "tracked", byDay: new Map(Object.entries(byDay)) });

const sampleMeals: MealNutrition[] = [
  meal("13-a", "2026-09-13", 600), meal("13-b", "2026-09-13", 600), meal("13-c", "2026-09-13", 503),
  meal("12-a", "2026-09-12", 500), meal("12-b", "2026-09-12", 582), meal("12-c", "2026-09-12", null),
  meal("11-a", "2026-09-11", 700), meal("11-b", "2026-09-11", 645),
  meal("10-a", "2026-09-10", 700), meal("10-b", "2026-09-10", 700), meal("10-c", "2026-09-10", 502),
  meal("8-a", "2026-09-08", 600), meal("8-b", "2026-09-08", 700), meal("8-c", "2026-09-08", 600),
];
const sampleExercise = tracked({
  "2026-09-13": exercise(320), "2026-09-12": exercise(0, 1), "2026-09-11": exercise(0, 0, 1),
  "2026-09-10": exercise(180), "2026-09-09": exercise(410), "2026-09-08": exercise(500),
});
const sampleRows = calorieBalanceRows(PERIOD.from, PERIOD.to, sampleMeals, sampleExercise, 1500);

/** 棒は `aria-hidden` なので、その日の行から唯一の inline style を持つ要素として引く。 */
const barWidth = (canvas: { getByRole: (role: string, options: { name: string }) => HTMLElement }, date: string): number => {
  const bar = canvas.getByRole("rowheader", { name: date }).closest("tr")?.querySelector("span[style]");
  return bar === null || bar === undefined ? 0 : bar.getBoundingClientRect().width;
};

const meta = {
  title: "Health/カロリー収支",
  component: DailyCalorieBalanceList,
  args: {
    rows: sampleRows,
    baselineKcal: 1500,
    exerciseState: "tracked",
    pendingActivities: 1,
    nutritionPending: false,
    nutritionErrorMessage: null,
    onEditBaseline: fn(),
  },
} satisfies Meta<typeof DailyCalorieBalanceList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SavingAndOverrun: Story = {
  name: "貯金と超過の日がある",
  play: async ({ canvas }) => {
    await expect(canvas.getByText("+117")).toBeVisible();
    await expect(canvas.getByText("+100")).toBeVisible();
    await expect(canvas.getByText("超過 −222")).toBeVisible();
    await expect(canvas.getByText("1,900")).toBeVisible();
    await expect(canvas.getByText("+500")).toBeVisible();
    await expect(canvas.getByText("摂取 1,900 kcal、運動 500 kcal")).toBeInTheDocument();
    // ラベルはヘッダーに 1 回だけ出す。
    await expect(canvas.getByText("摂取")).toBeVisible();
    await expect(canvas.getByText("運動")).toBeVisible();
    await expect(barWidth(canvas, "9/10")).toBeGreaterThan(12);
    await expect(canvas.getByRole("button", { name: "基準消費量を編集" })).toBeVisible();
  },
};

export const BaselineUnset: Story = {
  name: "基準消費量が未設定",
  args: { rows: calorieBalanceRows(PERIOD.from, PERIOD.to, sampleMeals, sampleExercise, null), baselineKcal: null },
  play: async ({ canvas, userEvent, args }) => {
    await expect(canvas.getByText("基準消費量が未設定・体重と同じ期間・日本時間")).toBeVisible();
    await expect(canvas.queryByText("+117")).not.toBeInTheDocument();
    await expect(canvas.getByText("1,703")).toBeVisible();
    await expect(canvas.getByText("+320")).toBeVisible();
    // 棒を 1 本も描かないので、ゼロの目盛りと凡例は出さない。摂取と運動の数値は残る。
    await expect(canvas.queryByText("0")).not.toBeInTheDocument();
    await expect(canvas.queryByText("貯金")).not.toBeInTheDocument();
    await expect(canvas.getByText(/収支 = 基準消費量 \+ 運動 − 摂取/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "基準消費量を設定" }));
    await expect(args.onEditBaseline).toHaveBeenCalled();
  },
};

export const SignOnlyConfirmed: Story = {
  name: "符号だけ確定した日",
  args: {
    rows: calorieBalanceRows("2026-09-10", "2026-09-11", [
      meal("10-a", "2026-09-10", 1902), meal("10-b", "2026-09-10", null),
      meal("11-a", "2026-09-11", 1345),
    ], tracked({ "2026-09-10": exercise(180), "2026-09-11": exercise(0, 1) }), 1500),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("超過 −222 以下")).toBeVisible();
    await expect(canvas.getByText("1,902")).toBeVisible();
    await expect(canvas.getByText("+180")).toBeVisible();
    await expect(canvas.getByText("未記録 1 件")).toBeVisible();
    await expect(canvas.getByText("+155 以上")).toBeVisible();
    await expect(canvas.getByText("1,345")).toBeVisible();
    await expect(canvas.getByText("取得待ち 1 件")).toBeVisible();
  },
};

export const SignUnknown: Story = {
  name: "符号も未確定の日",
  args: {
    rows: calorieBalanceRows("2026-09-12", "2026-09-12", [meal("12-a", "2026-09-12", 1082), meal("12-b", "2026-09-12", null)], tracked({}), 1500),
    pendingActivities: 0,
  },
  play: async ({ canvas }) => {
    // 「未確定」は収支の列だけに出し、副行にはその理由を置く。
    await expect(within(canvas.getByRole("table")).getByText("未確定")).toBeVisible();
    await expect(canvas.getByText("1,082")).toBeVisible();
    await expect(canvas.getByText("未記録 1 件")).toBeVisible();
  },
};

export const AllMealsUnrecorded: Story = {
  name: "全件が未記録の日",
  args: {
    rows: calorieBalanceRows("2026-09-12", "2026-09-12", [meal("12-a", "2026-09-12", null), meal("12-b", "2026-09-12", null)], tracked({}), 1500),
    pendingActivities: 0,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("未記録 2 件")).toBeVisible();
    // 食べたがカロリーが未記録の日は、摂取を 0 とも「食事なし」の `—` とも見せない。
    await expect(canvas.queryByText("—")).not.toBeInTheDocument();
    await expect(canvas.getByText("摂取のカロリーが未記録")).toBeInTheDocument();
    await expect(within(canvas.getByRole("table")).getByText("未確定")).toBeVisible();
  },
};

export const UnavailableExercise: Story = {
  name: "算入外の運動がある日",
  args: { rows: calorieBalanceRows("2026-09-11", "2026-09-11", [meal("11-a", "2026-09-11", 1345)], tracked({ "2026-09-11": exercise(0, 0, 1) }), 1500), pendingActivities: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("+155")).toBeVisible();
    await expect(canvas.getByText("1,345")).toBeVisible();
    await expect(canvas.getByText("算入外 1 件")).toBeVisible();
  },
};

export const PendingCalories: Story = {
  name: "取得待ちがある期間",
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("消費カロリーを取得中（残り 1 件）。Mac の runner が順に取得します。");
    await expect(canvas.getByText("未記録 1 件・取得待ち 1 件")).toBeVisible();
  },
};

export const GapDays: Story = {
  name: "記録なしの日と空白期間",
  play: async ({ canvas }) => {
    await expect(canvas.getByText("9/2〜9/7 食事と運動の記録なし（6 日）")).toBeVisible();
    await expect(canvas.getByText("食事の記録なし")).toBeVisible();
    await expect(canvas.getByText("+410")).toBeVisible();
    // 食事のない日は摂取も収支も `—`。全件未記録の日（摂取は空）と区別する。
    await expect(canvas.getAllByText("—")).toHaveLength(2);
  },
};

export const WithoutStrava: Story = {
  name: "運動を含めない収支",
  args: {
    rows: calorieBalanceRows(PERIOD.from, PERIOD.to, sampleMeals, { mode: "untracked" }, 1500),
    exerciseState: "untracked",
    pendingActivities: 0,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Strava 未接続のため、運動を含めていません。")).toBeVisible();
    await expect(canvas.getByText("超過 −203")).toBeVisible();
    await expect(canvas.queryByText("Powered by Strava")).not.toBeInTheDocument();
    // 値が永久に出ない列の見出しは残さない。摂取の見出しは残る。
    await expect(canvas.queryByText("運動")).not.toBeInTheDocument();
    await expect(canvas.getByText("摂取")).toBeVisible();
  },
};

export const ActivitiesLoading: Story = {
  name: "運動の一覧を取得中",
  args: {
    rows: calorieBalanceRows(PERIOD.from, PERIOD.to, sampleMeals, undefined, 1500),
    exerciseState: "loading",
    pendingActivities: 0,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("運動を取得しています。取得後に収支を表示します。");
    await expect(canvas.queryByText("+117")).not.toBeInTheDocument();
    await expect(canvas.getByText("1,703")).toBeVisible();
  },
};

export const ActivitiesFailed: Story = {
  name: "運動の一覧の取得失敗",
  args: { ...ActivitiesLoading.args, exerciseState: "failed" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("運動を取得できていないため、収支を表示していません。")).toBeVisible();
    await expect(canvas.queryByText("+117")).not.toBeInTheDocument();
  },
};

export const NutritionLoading: Story = {
  // 食事が未取得の間は行を組まない。空配列で組むと期間全体が「記録なし」の表になる。
  name: "カロリーの読み込み中",
  args: { rows: [], pendingActivities: 0, nutritionPending: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("カロリーを読み込んでいます。");
    await expect(canvas.queryByText(/記録なし/)).not.toBeInTheDocument();
    await expect(canvas.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(0);
  },
};

export const NutritionFailed: Story = {
  name: "カロリーの取得失敗",
  args: { ...NutritionLoading.args, nutritionPending: false, nutritionErrorMessage: "食事のカロリーを取得できませんでした。" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("食事のカロリーを取得できませんでした。");
    await expect(canvas.queryByText(/記録なし/)).not.toBeInTheDocument();
  },
};

export const Dark: Story = { name: "ダーク", globals: { theme: "dark" } };
export const Mobile: Story = {
  name: "モバイル",
  // 棒の幅はビューポート幅で切り替えるため、コンテナを狭めるだけでは実機の見え方にならない。
  parameters: { viewport: { options: { calorieMobile: { name: "カロリー収支 · 390 × 800", styles: { width: "390px", height: "800px" }, type: "mobile" } } } },
  globals: { viewport: { value: "calorieMobile", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("超過 −222")).toBeVisible();
    await expect(canvas.getByText("1,902")).toBeVisible();
    await expect(canvas.getByText("+180")).toBeVisible();
    // 狭い画面でも収支の棒が視認できる幅を持つこと。
    await expect(barWidth(canvas, "9/10")).toBeGreaterThan(12);
  },
};
