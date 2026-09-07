import type { LifeConsoleRepository, Task } from "@api/repositories/life-console-repository";
import type { CreateTaskInput, Result, UpdateTaskInput } from "@life-console/contracts";

import type { AppError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

export interface TaskUsecase {
  list(): Promise<Result<ReadonlyArray<Task>, AppError>>;
  create(input: CreateTaskInput): Promise<Result<Task, AppError>>;
  update(id: string, input: UpdateTaskInput): Promise<Result<Task, AppError>>;
}

export const createTaskUsecase = (
  repository: LifeConsoleRepository,
  clock: Clock,
  idGenerator: IdGenerator,
): TaskUsecase => ({
  list: () => repository.listTasks(),
  create: (input) => repository.createTask(idGenerator.create(), input, clock.now().toISOString()),
  update: (id, input) => repository.updateTask(id, input, clock.now().toISOString()),
});
