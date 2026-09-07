import type { LifeConsoleRepository, Repository, SourceRepositoryMapping } from "@api/repositories/life-console-repository";
import type { SyncRepositoriesInput, UpsertSourceRepositoryMappingInput } from "@life-console/contracts";
import type { Result } from "@life-console/core";

import type { AppError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

export interface RepositoryUsecase {
  list(): Promise<Result<ReadonlyArray<Repository>, AppError>>;
  listMappings(): Promise<Result<ReadonlyArray<SourceRepositoryMapping>, AppError>>;
  create(name: string, localPath: string): Promise<Result<void, AppError>>;
  sync(input: SyncRepositoriesInput): Promise<Result<number, AppError>>;
  upsertMapping(input: UpsertSourceRepositoryMappingInput): Promise<Result<void, AppError>>;
  assign(taskId: string, repositoryId: string, role: string): Promise<Result<void, AppError>>;
}

export const createRepositoryUsecase = (
  repository: LifeConsoleRepository,
  clock: Clock,
  idGenerator: IdGenerator,
): RepositoryUsecase => ({
  list: () => repository.listRepositories(),
  listMappings: () => repository.listSourceRepositoryMappings(),
  create: (name, localPath) => repository.createRepository(
    idGenerator.create(),
    name,
    localPath,
    clock.now().toISOString(),
  ),
  sync: (input) => repository.syncRepositories(
    input,
    input.repositories.map(() => idGenerator.create()),
    clock.now().toISOString(),
  ),
  upsertMapping: (input) => repository.upsertSourceRepositoryMapping(input, clock.now().toISOString()),
  assign: (taskId, repositoryId, role) => repository.assignTaskRepository(
    taskId,
    repositoryId,
    role,
    clock.now().toISOString(),
  ),
});
