import type { LifeConsoleRepository } from "@api/repositories/life-console-repository";
import type { Result } from "@life-console/contracts";

import type { AppError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

export interface NoteUsecase {
  create(body: string, occurredAt: string): Promise<Result<void, AppError>>;
}

export const createNoteUsecase = (
  repository: LifeConsoleRepository,
  clock: Clock,
  idGenerator: IdGenerator,
): NoteUsecase => ({
  create: (body, occurredAt) => repository.createNote(
    idGenerator.create(),
    body,
    occurredAt,
    clock.now().toISOString(),
  ),
});
