type Result = { ok: true; value: number } | { ok: false; error: string };
declare const save: () => Result;
declare const saveAsync: () => Promise<Result>;
declare const log: () => void;
const result = save();
if (!result.ok) console.error(result.error);
export const run = async () => saveAsync();
log();
