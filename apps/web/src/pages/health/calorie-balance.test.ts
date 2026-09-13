import type { MealNutrition } from "@life-console/contracts";
import { describe, expect, it } from "vitest";

import { calorieBalanceRows, recentBalanceWindow, type CalorieBalanceRow, type ExerciseInput } from "./calorie-balance";
import type { ExerciseDayCalories } from "./exercise-calories";

const meal = (mealId: string, occurredAt: string, caloriesKcal: number | null): MealNutrition => ({
  mealId, photoId: "photo", occurredAt, manualCaloriesKcal: caloriesKcal, estimate: null, analysisStatus: null, analysisSummary: null,
});
const tracked = (byDay: Record<string, ExerciseDayCalories>): ExerciseInput => ({ mode: "tracked", byDay: new Map(Object.entries(byDay)) });
const day = (kcal: number, pendingActivities = 0, unavailableActivities = 0): ExerciseDayCalories => ({ kcal, pendingActivities, unavailableActivities });
const days = (rows: ReadonlyArray<CalorieBalanceRow>) => rows.flatMap((row) => row.kind === "day" ? [row.day] : []);

describe("日別のカロリー収支", () => {
  it("基準消費量 + 運動 − 摂取で収支を出し、確定した日を貯金と超過に分ける", () => {
    const rows = calorieBalanceRows("2026-09-08", "2026-09-08", [meal("dinner", "2026-09-08T09:00:00Z", 1900)], tracked({ "2026-09-08": day(500) }), 1500);
    expect(rows).toEqual([{ kind: "day", day: {
      date: "2026-09-08", intakeKcal: 1900, recordedMeals: 1, totalMeals: 1, exercise: day(500),
      balanceKcal: 100, signKnown: true, amountKnown: true,
    } }]);
  });
  it("日本時間の午前 0 時で日を分け、期間内の全暦日を新しい順に返す", () => {
    const rows = calorieBalanceRows("2026-09-07", "2026-09-09", [
      meal("late", "2026-09-08T14:59:00Z", 800), meal("next", "2026-09-08T15:00:00Z", 700),
    ], { mode: "untracked" }, 1500);
    expect(days(rows).map((entry) => [entry.date, entry.intakeKcal, entry.balanceKcal])).toEqual([
      ["2026-09-09", 700, 800], ["2026-09-08", 800, 700], ["2026-09-07", 0, null],
    ]);
  });
  it("連続する記録なしの日を 1 行にまとめ、運動だけある日はまとめない", () => {
    const rows = calorieBalanceRows("2026-09-02", "2026-09-09", [meal("dinner", "2026-09-09T09:00:00Z", 1900)], tracked({ "2026-09-08": day(410) }), 1500);
    expect(rows.map((row) => row.kind === "gap" ? [row.kind, row.from, row.to, row.days] : [row.kind, row.day.date, row.day.balanceKcal])).toEqual([
      ["day", "2026-09-09", -400], ["day", "2026-09-08", null], ["gap", "2026-09-02", "2026-09-07", 6],
    ]);
  });
  it("未記録の食事があると額は未確定で、収支が負のときだけ符号が確定する", () => {
    const overrun = calorieBalanceRows("2026-09-10", "2026-09-10", [meal("lunch", "2026-09-10T03:00:00Z", 1902), meal("dinner", "2026-09-10T09:00:00Z", null)], tracked({ "2026-09-10": day(180) }), 1500);
    expect(days(overrun)[0]).toMatchObject({ balanceKcal: -222, signKnown: true, amountKnown: false });
    const saving = calorieBalanceRows("2026-09-12", "2026-09-12", [meal("lunch", "2026-09-12T03:00:00Z", 1082), meal("dinner", "2026-09-12T09:00:00Z", null)], tracked({ "2026-09-12": day(0) }), 1500);
    expect(days(saving)[0]).toMatchObject({ balanceKcal: 418, signKnown: false, amountKnown: false });
  });
  it("取得待ちの運動があると額は未確定で、収支が非負のときだけ符号が確定する", () => {
    const saving = calorieBalanceRows("2026-09-12", "2026-09-12", [meal("lunch", "2026-09-12T03:00:00Z", 1082)], tracked({ "2026-09-12": day(0, 1) }), 1500);
    expect(days(saving)[0]).toMatchObject({ balanceKcal: 418, signKnown: true, amountKnown: false });
    const overrun = calorieBalanceRows("2026-09-10", "2026-09-10", [meal("lunch", "2026-09-10T03:00:00Z", 1902)], tracked({ "2026-09-10": day(180, 1) }), 1500);
    expect(days(overrun)[0]).toMatchObject({ balanceKcal: -222, signKnown: false, amountKnown: false });
  });
  it("全件未記録の日を摂取 0 の貯金として確定しない", () => {
    const rows = calorieBalanceRows("2026-09-12", "2026-09-12", [meal("lunch", "2026-09-12T03:00:00Z", null), meal("dinner", "2026-09-12T09:00:00Z", null)], { mode: "untracked" }, 1500);
    expect(days(rows)[0]).toMatchObject({ intakeKcal: 0, recordedMeals: 0, totalMeals: 2, balanceKcal: 1500, signKnown: false, amountKnown: false });
  });
  it("未記録と取得待ちが同時にあれば符号も額も確定しない", () => {
    const rows = calorieBalanceRows("2026-09-10", "2026-09-10", [meal("lunch", "2026-09-10T03:00:00Z", 1902), meal("dinner", "2026-09-10T09:00:00Z", null)], tracked({ "2026-09-10": day(0, 1) }), 1500);
    expect(days(rows)[0]).toMatchObject({ balanceKcal: -402, signKnown: false, amountKnown: false });
  });
  it("untracked は運動 0・取得待ち 0 として摂取だけで確定を決める", () => {
    const recorded = calorieBalanceRows("2026-09-08", "2026-09-08", [meal("dinner", "2026-09-08T09:00:00Z", 1400)], { mode: "untracked" }, 1500);
    expect(days(recorded)[0]).toMatchObject({ exercise: undefined, balanceKcal: 100, signKnown: true, amountKnown: true });
    const unrecorded = calorieBalanceRows("2026-09-08", "2026-09-08", [meal("dinner", "2026-09-08T09:00:00Z", 1400), meal("late", "2026-09-08T12:00:00Z", null)], { mode: "untracked" }, 1500);
    expect(days(unrecorded)[0]).toMatchObject({ balanceKcal: 100, signKnown: false, amountKnown: false });
  });
  it("収支がちょうど 0 の日を貯金として確定する", () => {
    const rows = calorieBalanceRows("2026-09-08", "2026-09-08", [meal("dinner", "2026-09-08T09:00:00Z", 1500)], tracked({ "2026-09-08": day(0) }), 1500);
    expect(days(rows)[0]).toMatchObject({ balanceKcal: 0, signKnown: true, amountKnown: true });
  });
  it("算入外の運動は確定を妨げず、合計にも入らない", () => {
    const rows = calorieBalanceRows("2026-09-11", "2026-09-11", [meal("lunch", "2026-09-11T03:00:00Z", 1345)], tracked({ "2026-09-11": day(0, 0, 1) }), 1500);
    expect(days(rows)[0]).toMatchObject({ balanceKcal: 155, signKnown: true, amountKnown: true });
  });
  it("運動の取得中と失敗は収支を出さず、基準未設定と記録なしも null にする", () => {
    const meals = [meal("dinner", "2026-09-08T09:00:00Z", 1900)];
    expect(days(calorieBalanceRows("2026-09-08", "2026-09-08", meals, undefined, 1500))[0]).toMatchObject({ intakeKcal: 1900, balanceKcal: null, signKnown: false, amountKnown: false });
    expect(days(calorieBalanceRows("2026-09-08", "2026-09-08", meals, { mode: "untracked" }, null))[0]).toMatchObject({ balanceKcal: null });
    expect(days(calorieBalanceRows("2026-09-08", "2026-09-08", [], tracked({ "2026-09-08": day(410) }), 1500))[0]).toMatchObject({ totalMeals: 0, balanceKcal: null });
  });
  it("直近 7 日の窓を終端から数え、期間が短ければ切り詰めない", () => {
    expect(recentBalanceWindow("2026-09-02", "2026-09-13")).toEqual({ from: "2026-09-07", hiddenDays: 5 });
    expect(recentBalanceWindow("2026-09-07", "2026-09-13")).toEqual({ from: "2026-09-07", hiddenDays: 0 });
    expect(recentBalanceWindow("2026-09-08", "2026-09-13")).toEqual({ from: "2026-09-08", hiddenDays: 0 });
    expect(recentBalanceWindow("2026-09-13", "2026-09-13")).toEqual({ from: "2026-09-13", hiddenDays: 0 });
  });
  it("表示期間の外の食事を集計に含めない", () => {
    const rows = calorieBalanceRows("2026-09-08", "2026-09-08", [
      meal("inside", "2026-09-08T09:00:00Z", 1900), meal("outside", "2026-09-09T09:00:00Z", 500),
    ], { mode: "untracked" }, 1500);
    expect(days(rows)).toHaveLength(1);
    expect(days(rows)[0]).toMatchObject({ date: "2026-09-08", intakeKcal: 1900, totalMeals: 1 });
  });
});
