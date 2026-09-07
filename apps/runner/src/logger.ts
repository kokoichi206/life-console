import { createLogger, type Logger } from "@life-console/core";

export type LocalLogger = Pick<Logger, "error" | "info">;
export const localLogger: LocalLogger = createLogger("runner");
