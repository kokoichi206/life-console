export type AppErrorCode
  = | "conflict"
    | "forbidden"
    | "invalid_lease"
    | "not_found"
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
  storage: (cause: unknown): AppError => createError("storage_error", "データの保存または取得に失敗しました。", cause),
  unauthorized: (): AppError => createError("unauthorized", "runner の認証に失敗しました。"),
  upstream: (message: string, cause?: unknown): AppError => createError("upstream_error", message, cause),
  validation: (message: string): AppError => createError("validation_error", message),
};
