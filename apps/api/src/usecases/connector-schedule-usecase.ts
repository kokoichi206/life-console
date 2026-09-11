import type { ConnectorScheduleRepository } from "@api/repositories/connector-schedule-repository";
import type { ConnectorScheduleStatus, CreateConnectorScheduleInput, UpdateConnectorScheduleInput } from "@life-console/contracts";
import type { Result } from "@life-console/core";

import type { AppError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

const nextRun = (now: Date, interval: CreateConnectorScheduleInput["interval"]) => new Date(now.getTime() + { hourly: 1, daily: 24, weekly: 168 }[interval] * 3_600_000).toISOString();
export const createConnectorScheduleUsecase = (repository: ConnectorScheduleRepository, clock: Clock, ids: IdGenerator) => ({
  list: (): Promise<Result<ReadonlyArray<ConnectorScheduleStatus>, AppError>> => repository.list(),
  create(input: CreateConnectorScheduleInput): Promise<Result<void, AppError>> {
    const now = clock.now();
    return repository.create(ids.create(), input, now.toISOString(), input.runImmediately ? now.toISOString() : nextRun(now, input.interval));
  },
  update(id: string, input: UpdateConnectorScheduleInput): Promise<Result<void, AppError>> {
    const now = clock.now();
    return repository.update(id, input, now.toISOString(), nextRun(now, input.interval));
  },
});
