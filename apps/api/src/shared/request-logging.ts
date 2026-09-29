import type { Logger } from "@life-console/core";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

import type { AppErrorCode } from "./app-error";
import { cloudLogger } from "./logger";

export type RequestLogVariables = {
  request_id: string;
  logger: Logger;
  errorCode?: AppErrorCode | "internal_error" | "http_error";
};

export const requestLogging = createMiddleware<{ Variables: RequestLogVariables }>(async (context, next) => {
  const requestId = crypto.randomUUID();
  const logger = cloudLogger.child({ request_id: requestId });
  const startedAt = performance.now();
  context.set("request_id", requestId);
  context.set("logger", logger);

  // Hono は下流の例外を onError でレスポンスへ変換してから next を完了する。
  await next();

  context.header("X-Request-Id", requestId);
  const request = {
    method: context.req.method,
    // 生のパスには共有 token が含まれるため、定義上のルートだけを記録する。
    route: routePath(context, -1),
    status_code: context.res.status,
    duration_ms: performance.now() - startedAt,
  };
  if (request.status_code >= 400) {
    const level = request.status_code >= 500 ? "error" : "warn";
    logger[level]({ ...request, event: "request_failed", errorCode: context.get("errorCode") ?? "http_error" });
  }
  logger.info({ ...request, event: "request_completed" });
});
