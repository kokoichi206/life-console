export type AppErrorCode
  = | "conflict"
    | "forbidden"
    | "invalid_lease"
    | "not_found"
    | "rate_limited"
    | "skipped_precondition"
    | "storage_error"
    | "unauthorized"
    | "upstream_error"
    | "validation_error";

export type AppError = {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly cause?: unknown;
};

const createError = (code: AppErrorCode, message: string, cause?: unknown): AppError => {
  if (cause === undefined) return { code, message };
  return { code, message, cause };
};

export const appError = {
  conflict: (message: string): AppError => createError("conflict", message),
  forbidden: (message: string): AppError => createError("forbidden", message),
  invalidLease: (): AppError => createError("invalid_lease", "job の lease が無効です。"),
  notFound: (message: string): AppError => createError("not_found", message),
  rateLimited: (message: string): AppError => createError("rate_limited", message),
  /** 実行条件が揃わず見送る。runner はこの code を受けて job を `skipped_precondition` で終える。 */
  skippedPrecondition: (message: string): AppError => createError("skipped_precondition", message),
  storage: (cause: unknown): AppError => createError("storage_error", "データの保存または取得に失敗しました。", cause),
  unauthorized: (): AppError => createError("unauthorized", "runner の認証に失敗しました。"),
  upstream: (message: string, cause?: unknown): AppError => createError("upstream_error", message, cause),
  validation: (message: string): AppError => createError("validation_error", message),
};
