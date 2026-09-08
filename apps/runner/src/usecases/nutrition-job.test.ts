import { err, ok } from "@life-console/core";
import type { RunnerJob } from "@runner/repositories/api-repository";
import { describe, expect, it, vi } from "vitest";

import { createJobExecutorUsecase } from "./job-executor-usecase";

const job = { id: "job", kind: "nutrition_analysis", payloadJson: "{}", leaseToken: "lease" } as RunnerJob;
const estimate = { model: "test", analyzedAt: "2026-09-09T00:00:00Z", inputHash: "a".repeat(64), caloriesKcal: 500, proteinGrams: 20, fatGrams: 20, carbohydrateGrams: 60 };
const meal = { id: "meal", photoId: "photo", mealKind: "lunch", memo: "" };

describe("栄養解析ジョブ", () => {
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
