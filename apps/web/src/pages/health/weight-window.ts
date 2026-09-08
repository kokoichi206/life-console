export const WEIGHT_DAY_MS = 86_400_000;
export type WeightWindow = { readonly start: number; readonly end: number };

export const constrainWeightWindow = (window: WeightWindow, bounds: WeightWindow): WeightWindow => {
  const span = Math.min(Math.max(window.end - window.start, WEIGHT_DAY_MS), bounds.end - bounds.start);
  const start = Math.max(bounds.start, Math.min(window.start, bounds.end - span));
  return { start: Math.round(start / WEIGHT_DAY_MS) * WEIGHT_DAY_MS, end: Math.round((start + span) / WEIGHT_DAY_MS) * WEIGHT_DAY_MS };
};

export const gestureWeightWindow = (window: WeightWindow, bounds: WeightWindow, initial: readonly [number, number], current: readonly [number, number], plotWidth: number): WeightWindow => {
  const span = window.end - window.start;
  const initialDistance = Math.abs(initial[1] - initial[0]);
  const currentDistance = Math.abs(current[1] - current[0]);
  const nextSpan = Math.min(bounds.end - bounds.start, Math.max(WEIGHT_DAY_MS, span * initialDistance / Math.max(currentDistance, 1)));
  const anchor = (initial[0] + initial[1]) / 2 / plotWidth;
  const midpoint = (current[0] + current[1]) / 2 / plotWidth;
  const start = window.start + span * anchor - nextSpan * midpoint;
  return constrainWeightWindow({ start, end: start + nextSpan }, bounds);
};
