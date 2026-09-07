import type { WeightPoint } from "./models";

const ONE_DAY_MILLISECONDS = 86_400_000;
const JAPAN_TIME_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;

export const weightCalendarDate = (occurredAt: string): string => new Date(Date.parse(occurredAt) + JAPAN_TIME_OFFSET_MILLISECONDS).toISOString().slice(0, 10);

export const weightCalendarDayTimestamp = (occurredAt: string): number => Date.parse(`${weightCalendarDate(occurredAt)}T00:00:00Z`);

export type WeightPointWithMovingAverage = WeightPoint & {
  readonly movingAverage7DaysKg: number;
  readonly movingAverageWindowSamples: number;
};

export const calculate7DayMovingAverage = (
  points: ReadonlyArray<WeightPoint>,
): ReadonlyArray<WeightPointWithMovingAverage> => points.map((point) => {
  const occurredOn = weightCalendarDayTimestamp(point.occurredAt);
  const window = points.filter((candidate) => {
    const candidateOccurredOn = weightCalendarDayTimestamp(candidate.occurredAt);
    return candidateOccurredOn > occurredOn - (7 * ONE_DAY_MILLISECONDS) && candidateOccurredOn <= occurredOn;
  });
  const average = window.reduce((sum, entry) => sum + entry.weightKg, 0) / window.length;
  return {
    ...point,
    movingAverage7DaysKg: Math.round(average * 100) / 100,
    movingAverageWindowSamples: window.length,
  };
});
