import { err, ok } from "@life-console/core";
import type { RunnerJob } from "@runner/repositories/api-repository";
import { describe, expect, it, vi } from "vitest";

import { createJobExecutorUsecase } from "./job-executor-usecase";

const job = { id: "job", kind: "nutrition_analysis", payloadJson: "{}", leaseToken: "lease" } as RunnerJob;
const estimate = { model: "test", analyzedAt: "2026-09-09T00:00:00Z", inputHash: "a".repeat(64), caloriesKcal: 500, proteinGrams: 20, fatGrams: 20, carbohydrateGrams: 60 };
const meal = { id: "meal", photoId: "photo", memo: "" };

describe("栄養解析ジョブ", () => {
  it("手入力による結果保存のスキップで、一括の残りを止めない", async () => {
    const generate = vi.fn().mockResolvedValue(ok(estimate));
    const saveNutritionEstimate = vi.fn().mockResolvedValueOnce(err({ code: "nutrition_manual_calories", summary: "手入力済み" })).mockResolvedValueOnce(ok(null));
    const executor = createJobExecutorUsecase({
      api: { nutritionCandidates: vi.fn().mockResolvedValue(ok([meal, { ...meal, id: "other" }])), saveNutritionEstimate },
      nutritionGenerator: { generate },
    } as unknown as Parameters<typeof createJobExecutorUsecase>[0]);
    expect(await executor.execute(job, new AbortController().signal)).toMatchObject({ outcome: "succeeded", summary: "1 件の食事に推定カロリーと栄養素を保存しました。手入力済みの 1 件は保存しませんでした。" });
    expect(saveNutritionEstimate).toHaveBeenCalledTimes(2);
  });
  it("手入力済みの個別候補は解析せずスキップする", async () => {
    const generate = vi.fn();
    const executor = createJobExecutorUsecase({ api: { nutritionCandidates: vi.fn().mockResolvedValue(ok([])) }, nutritionGenerator: { generate } } as unknown as Parameters<typeof createJobExecutorUsecase>[0]);
    expect(await executor.execute({ ...job, payloadJson: JSON.stringify({ mealId: meal.id }) }, new AbortController().signal)).toMatchObject({ outcome: "skipped_precondition" });
    expect(generate).not.toHaveBeenCalled();
  });
  it("画像解析中の中止を失敗として報告しない", async () => {
    const controller = new AbortController();
    const generate = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.resolve(err({ code: "command_failed", summary: "中止" }));
    });
    const executor = createJobExecutorUsecase({ api: { nutritionCandidates: vi.fn().mockResolvedValue(ok([meal])) }, nutritionGenerator: { generate } } as unknown as Parameters<typeof createJobExecutorUsecase>[0]);
    expect(await executor.execute(job, controller.signal)).toMatchObject({ outcome: "canceled", errorCode: null });
  });
  it("一部の写真が判断不能でも残りを解析し、成功で隠さず失敗件数を報告する", async () => {
    const generate = vi.fn().mockResolvedValueOnce(err({ code: "nutrition_unidentifiable", summary: "写真を判別できません。" })).mockResolvedValueOnce(ok(estimate));
    const saveNutritionEstimate = vi.fn().mockResolvedValue(ok(null));
    const executor = createJobExecutorUsecase({
      api: { nutritionCandidates: vi.fn().mockResolvedValue(ok([meal, { ...meal, id: "meal-2" }])), saveNutritionEstimate },
      nutritionGenerator: { generate },
    } as unknown as Parameters<typeof createJobExecutorUsecase>[0]);
    const result = await executor.execute(job, new AbortController().signal);
    expect(result).toMatchObject({ outcome: "failed", errorCode: "nutrition_analysis_partial", summary: "1 件を保存、1 件の解析に失敗しました。写真を判別できません。" });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(saveNutritionEstimate).toHaveBeenCalledExactlyOnceWith({ ...estimate, mealId: "meal-2", jobId: "job", leaseToken: "lease" }, expect.any(AbortSignal));
  });
  it("中止済みなら写真を解析しない", async () => {
    const generate = vi.fn();
    const executor = createJobExecutorUsecase({ api: { nutritionCandidates: vi.fn().mockResolvedValue(ok([meal])) }, nutritionGenerator: { generate } } as unknown as Parameters<typeof createJobExecutorUsecase>[0]);
    expect(await executor.execute(job, AbortSignal.abort())).toMatchObject({ outcome: "canceled" });
    expect(generate).not.toHaveBeenCalled();
  });
});
