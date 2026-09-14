import type { AbstinenceEvent, AbstinenceGoal } from "./models";

const JAPAN_TIME_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

export const abstinenceCalendarDate = (occurredAt: string): string => new Date(Date.parse(occurredAt) + JAPAN_TIME_OFFSET_MILLISECONDS).toISOString().slice(0, 10);

export const abstinenceCalendarDayDifference = (from: string, to: string): number => {
  const fromDay = Date.parse(`${abstinenceCalendarDate(from)}T00:00:00Z`);
  const toDay = Date.parse(`${abstinenceCalendarDate(to)}T00:00:00Z`);
  return Math.max(0, Math.floor((toDay - fromDay) / DAY_MILLISECONDS));
};

export const sumAbstinenceEventDurationMinutes = (events: ReadonlyArray<AbstinenceEvent>): number => events.reduce((total, event) => total + (event.durationMinutes ?? 0), 0);

export const calculateAbstinenceStreaks = (goal: AbstinenceGoal, events: ReadonlyArray<AbstinenceEvent>, now: string): { readonly currentStreakDays: number; readonly longestStreakDays: number } => {
  const orderedEvents = events.filter((event) => Date.parse(event.occurredAt) >= Date.parse(goal.startedAt)).toSorted((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  const currentStart = orderedEvents.at(-1)?.occurredAt ?? goal.startedAt;
  const completedStreaks = orderedEvents.map((event, index) => abstinenceCalendarDayDifference(index === 0 ? goal.startedAt : orderedEvents[index - 1]!.occurredAt, event.occurredAt));
  return {
    currentStreakDays: abstinenceCalendarDayDifference(currentStart, now),
    longestStreakDays: Math.max(0, ...completedStreaks, abstinenceCalendarDayDifference(currentStart, now)),
  };
};
