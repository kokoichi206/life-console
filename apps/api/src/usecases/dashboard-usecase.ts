import type { Dashboard, LifeConsoleRepository } from "@api/repositories/life-console-repository";
import type { Result } from "@life-console/core";

import type { AppError } from "../shared/app-error";

export interface DashboardUsecase {
  get(): Promise<Result<Dashboard, AppError>>;
}

export const createDashboardUsecase = (repository: LifeConsoleRepository): DashboardUsecase => ({
  get: () => repository.getDashboard(),
});
