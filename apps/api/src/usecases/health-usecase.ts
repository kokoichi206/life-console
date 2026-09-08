import type { LifeConsoleRepository, Meal, WeightPoint } from "@api/repositories/life-console-repository";
import type { CreateMealInput, CreateWeightInput, WeightGoal } from "@life-console/contracts";
import type { Result } from "@life-console/core";

import type { AppError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

export interface HealthUsecase {
  listMeals(period?: { readonly from: string; readonly to: string }): Promise<Result<ReadonlyArray<Meal>, AppError>>;
  createMeal(input: CreateMealInput): Promise<Result<Meal, AppError>>;
  getWeightGoal(): Promise<Result<WeightGoal | null, AppError>>;
  saveWeightGoal(input: WeightGoal | null): Promise<Result<void, AppError>>;
  listWeights(): Promise<Result<ReadonlyArray<WeightPoint>, AppError>>;
  listWeightsForExport(): Promise<Result<ReadonlyArray<WeightPoint>, AppError>>;
  createWeight(input: CreateWeightInput): Promise<Result<void, AppError>>;
  importWeights(inputs: ReadonlyArray<CreateWeightInput>): Promise<Result<number, AppError>>;
}

export const createHealthUsecase = (
  repository: LifeConsoleRepository,
  clock: Clock,
  idGenerator: IdGenerator,
): HealthUsecase => ({
  listMeals: (period) => repository.listMeals(period),
  createMeal: (input) => repository.createMealAndQueueNutrition(idGenerator.create(), input, clock.now().toISOString()),
  getWeightGoal: () => repository.getWeightGoal(),
  saveWeightGoal: (input) => repository.saveWeightGoal(input),
  listWeights: () => repository.listWeights(),
  listWeightsForExport: () => repository.listWeightsForExport(),
  createWeight: (input) => repository.createWeight(
    idGenerator.create(),
    input,
    clock.now().toISOString(),
  ),
  async importWeights(inputs) {
    const now = clock.now().toISOString();
    for (const input of inputs) {
      const created = await repository.createWeight(idGenerator.create(), input, now);
      if (!created.ok) return created;
    }
    return { ok: true, value: inputs.length };
  },
});
