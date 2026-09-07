import type { FinanceSummary, LifeConsoleRepository } from "@api/repositories/life-console-repository";
import type {
  CreateAssetBalanceInput,
  CreateFinanceAdjustmentInput,
  CreateFinanceTransactionInput,
  Result,
} from "@life-console/contracts";

import type { AppError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

export interface FinanceUsecase {
  summary(): Promise<Result<FinanceSummary, AppError>>;
  createTransaction(input: CreateFinanceTransactionInput): Promise<Result<void, AppError>>;
  createAdjustment(input: CreateFinanceAdjustmentInput): Promise<Result<void, AppError>>;
  createAssetBalance(input: CreateAssetBalanceInput): Promise<Result<void, AppError>>;
}

export const createFinanceUsecase = (
  repository: LifeConsoleRepository,
  clock: Clock,
  idGenerator: IdGenerator,
): FinanceUsecase => ({
  summary: () => repository.getFinanceSummary(),
  createTransaction: (input) => repository.createFinanceTransaction(
    idGenerator.create(),
    input,
    clock.now().toISOString(),
  ),
  createAdjustment: (input) => repository.createFinanceAdjustment(
    idGenerator.create(),
    input,
    clock.now().toISOString(),
  ),
  createAssetBalance: (input) => repository.createAssetBalance(
    idGenerator.create(),
    input,
    clock.now().toISOString(),
  ),
});
