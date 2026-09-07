type LogEvent = {
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
}

export const cloudLogger: Logger = {
  error(event): void {
    console.error(JSON.stringify(event));
  },
  warn(event): void {
    console.warn(JSON.stringify(event));
  },
};
