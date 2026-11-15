import type { LifeConsoleRepository } from "@api/repositories/life-console-repository";
import type { Clock } from "@api/shared/clock";
import type { IdGenerator } from "@api/shared/id-generator";
import { calculateAbstinenceStreaks, sumAbstinenceEventDurationMinutes, type AbstinenceEventInput, type AbstinenceGoal, type AbstinenceOverview } from "@life-console/contracts";
import type { Result } from "@life-console/core";

import { appError, type AppError } from "../shared/app-error";

export interface AbstinenceUsecase {
  getOverview(): Promise<Result<AbstinenceOverview, AppError>>;
  saveGoal(input: AbstinenceGoal | null): Promise<Result<void, AppError>>;
  createEvent(input: AbstinenceEventInput): Promise<Result<void, AppError>>;
}

export const createAbstinenceUsecase = (repository: LifeConsoleRepository, clock: Clock, idGenerator: IdGenerator): AbstinenceUsecase => ({
  async getOverview() {
    const goalResult = await repository.getAbstinenceGoal();
    if (!goalResult.ok) return goalResult;
    const eventsResult = await repository.listAbstinenceEvents();
    if (!eventsResult.ok) return eventsResult;
    const totalEventDurationMinutes = sumAbstinenceEventDurationMinutes(eventsResult.value);
    if (goalResult.value === null) return { ok: true, value: { goal: null, events: eventsResult.value, totalEventDurationMinutes, currentStreakDays: 0, longestStreakDays: 0 } };
    return { ok: true, value: { goal: goalResult.value, events: eventsResult.value, totalEventDurationMinutes, ...calculateAbstinenceStreaks(goalResult.value, eventsResult.value, clock.now().toISOString()) } };
  },
  saveGoal: (input) => repository.saveAbstinenceGoal(input),
  async createEvent(input) {
    const goalResult = await repository.getAbstinenceGoal();
    if (!goalResult.ok) return goalResult;
    if (goalResult.value === null) return { ok: false, error: appError.validation("禁欲目標を設定してからイベントを記録してください。") };
    return repository.createAbstinenceEvent(idGenerator.create(), input, clock.now().toISOString());
  },
});
