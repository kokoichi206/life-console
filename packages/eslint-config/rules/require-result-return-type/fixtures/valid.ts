type Result<T> = { ok: true; value: T } | { ok: false; error: string };
declare const result: Result<number>;
export const createUsecase = () => ({ get: async () => result });
export const get = (): Result<number> => result;
type Outcome = Result<number>;
export const aliased = async (): Promise<Outcome> => result;
export const handlers = { get: () => result };
