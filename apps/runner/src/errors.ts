export type RunnerError = {
  readonly code: string;
  readonly summary: string;
  readonly cause?: unknown;
};

export const runnerError = (code: string, summary: string, cause?: unknown): RunnerError => {
  if (cause === undefined) return { code, summary };
  return { code, summary, cause };
};
