export type Result<T, E>
  = | {
    readonly ok: true;
    readonly value: T;
  }
  | {
    readonly ok: false;
    readonly error: E;
  };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const safeTry = async <T>(operation: () => Promise<T> | T): Promise<Result<T, unknown>> => {
  try {
    return ok(await operation());
  } catch (cause) {
    return err(cause);
  }
};
