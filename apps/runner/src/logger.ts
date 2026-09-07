type LocalLog = {
  readonly event: string;
  readonly jobId?: string;
  readonly errorCode?: string;
  readonly detail?: unknown;
  readonly timestamp: string;
};

export interface LocalLogger {
  error(entry: LocalLog): void;
  info(entry: LocalLog): void;
}

export const localLogger: LocalLogger = {
  error(entry): void {
    console.error(JSON.stringify({ level: "error", ...entry }));
  },
  info(entry): void {
    console.error(JSON.stringify({ level: "info", ...entry }));
  },
};
