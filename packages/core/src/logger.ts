export type LogEvent = {
  readonly event: string;
  readonly errorCode?: string;
  readonly jobId?: string;
  readonly requestId?: string;
  readonly runnerId?: string;
  readonly status?: string;
  readonly timestamp: string;
};

export interface Logger {
  error(event: LogEvent): void;
  warn(event: LogEvent): void;
  info(event: LogEvent): void;
}

export const createLogger = (service: string): Logger => {
  const write = (level: "error" | "warn" | "info", entry: LogEvent): void => {
    const { event, errorCode, jobId, requestId, runnerId, status, timestamp } = entry;
    console.error(JSON.stringify({ service, level, event, errorCode, jobId, requestId, runnerId, status, timestamp }));
  };
  return {
    error: (entry) => write("error", entry),
    warn: (entry) => write("warn", entry),
    info: (entry) => write("info", entry),
  };
};
