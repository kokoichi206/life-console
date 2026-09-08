import { describe, expect, it } from "vitest";

import { app } from "../apps/api/src/app";

import { createJobStorage } from "./support/d1-storage";

describe("体重の目標の保存", () => {
  it("未設定から登録・更新・解除し、HTTP で読み直せる", async () => {
    const { database, binding } = createJobStorage();
    const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding };
    const read = async () => (await app.request("/api/v1/weight-goal", {}, environment)).json();
    const save = (goal: unknown) => app.request("/api/v1/weight-goal", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(goal) }, environment);
    try {
      expect(await read()).toEqual({ data: null });
      const goal = { startWeightKg: 90.5, targetWeightKg: 80.1, targetDate: "2026-12-31" };
      expect((await save(goal)).status).toBe(200);
      expect(await read()).toEqual({ data: goal });
      const updated = { ...goal, targetWeightKg: 79.5, targetDate: null };
      expect((await save(updated)).status).toBe(200);
      expect(await read()).toEqual({ data: updated });
      expect((await save({ ...goal, targetDate: "2026-02-30" })).status).toBe(400);
      expect((await save({ ...goal, targetWeightKg: 0 })).status).toBe(400);
      expect(await read()).toEqual({ data: updated });
      expect((await save(null)).status).toBe(200);
      expect(await read()).toEqual({ data: null });
    } finally {
      database.close();
    }
  });
});
