import pino from "#pino";
import type { Logger as PinoLogger } from "pino";

export type LogEvent = {
  readonly event: string;
  readonly errorCode?: string;
  readonly jobId?: string;
  readonly method?: string;
  readonly route?: string;
  readonly status_code?: number;
  readonly duration_ms?: number;
  readonly runnerId?: string;
  readonly status?: string;
  readonly timestamp?: string;
};

export interface Logger {
  child(bindings: { readonly request_id: string }): Logger;
  error(event: LogEvent): void;
  warn(event: LogEvent): void;
  info(event: LogEvent): void;
}

const wrapLogger = (logger: PinoLogger): Logger => {
  const write = (level: "error" | "warn" | "info", entry: LogEvent): void => {
    const { event, errorCode, jobId, runnerId, status, timestamp, method, route, status_code, duration_ms } = entry;
    logger[level]({ event, errorCode, jobId, runnerId, status, timestamp, method, route, status_code, duration_ms });
  };
  return {
    child: ({ request_id }) => wrapLogger(logger.child({ request_id })),
    error: (entry) => write("error", entry),
    warn: (entry) => write("warn", entry),
    info: (entry) => write("info", entry),
  };
};

// Workers と Node.js で同じ同期出力を使い、console 側の severity も JSON の level に揃える。
export const createLogger = (service: string): Logger => wrapLogger(pino({
  browser: {
    formatters: { level: (level) => ({ level }) },
    write: {
      info: (entry) => console.info(JSON.stringify(entry)),
      warn: (entry) => console.warn(JSON.stringify(entry)),
      error: (entry) => console.error(JSON.stringify(entry)),
    },
  },
}).child({ service }));
