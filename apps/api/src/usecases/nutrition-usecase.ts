import type { LifeConsoleRepository } from "@api/repositories/life-console-repository";
import type { NutritionRepository } from "@api/repositories/nutrition-repository";
import type { Job, MealNutrition, NutritionAnalysisPayload, NutritionCandidate, SaveNutritionEstimateInput } from "@life-console/contracts";
import { err, type Result } from "@life-console/core";

import { appError, type AppError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

export const createNutritionUsecase = (nutrition: NutritionRepository, jobs: LifeConsoleRepository, clock: Clock, ids: IdGenerator) => ({
  saveManualCalories: (mealId: string, caloriesKcal: number): Promise<Result<void, AppError>> => nutrition.saveManualCalories(mealId, caloriesKcal),
  list: (): Promise<Result<ReadonlyArray<MealNutrition>, AppError>> => nutrition.list(),
  candidates: (input: NutritionAnalysisPayload): Promise<Result<ReadonlyArray<NutritionCandidate>, AppError>> => nutrition.candidates(input),
  save: (input: SaveNutritionEstimateInput): Promise<Result<void, AppError>> => nutrition.save(ids.create(), input, clock.now().toISOString()),
  async generate(input: NutritionAnalysisPayload): Promise<Result<Job, AppError>> {
    const candidates = await nutrition.candidates(input);
    if (!candidates.ok) return candidates;
    if (candidates.value.length === 0) return err(appError.validation("未解析の写真付き食事がありません。"));
    const id = ids.create();
    return jobs.createJob({ id, kind: "nutrition_analysis", idempotencyKey: `nutrition:${id}`,
      payloadJson: JSON.stringify(input), now: clock.now().toISOString() });
  },
});
