type Result = { ok: true; value: number } | { ok: false; error: string };
declare const save: () => Result;
declare const saveAsync: () => Promise<Result>;
save();
await saveAsync();
void saveAsync();
const result = save();
if (!result.ok) console.error(result.error);
export {};
