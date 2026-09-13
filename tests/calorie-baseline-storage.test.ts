import { describe, expect, it } from "vitest";

import { app } from "../apps/api/src/app";

import { createJobStorage } from "./support/d1-storage";

describe("1 日の基準消費量の保存", () => {
  it("未設定から登録・更新・解除し、HTTP で読み直せる", async () => {
    const { database, binding } = createJobStorage();
    const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding };
    const read = async () => (await app.request("/api/v1/calorie-baseline", {}, environment)).json();
    const save = (baseline: unknown) => app.request("/api/v1/calorie-baseline", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(baseline) }, environment);
    try {
      expect(await read()).toEqual({ data: null });
      expect((await save({ dailyExpenditureKcal: 1500 })).status).toBe(200);
      expect(await read()).toEqual({ data: { dailyExpenditureKcal: 1500 } });
      expect((await save({ dailyExpenditureKcal: 1800 })).status).toBe(200);
      expect(await read()).toEqual({ data: { dailyExpenditureKcal: 1800 } });
      expect((await save(null)).status).toBe(200);
      expect(await read()).toEqual({ data: null });
    } finally {
      database.close();
    }
  });
  it("0・小数・上限超過・文字列を拒否し、保存済みの値を変えない", async () => {
    const { database, binding } = createJobStorage();
    const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding };
    const read = async () => (await app.request("/api/v1/calorie-baseline", {}, environment)).json();
    const save = (baseline: unknown) => app.request("/api/v1/calorie-baseline", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(baseline) }, environment);
    try {
      expect((await save({ dailyExpenditureKcal: 1500 })).status).toBe(200);
      for (const invalid of [0, -1, 1500.5, 10_001, "1500"]) {
        expect((await save({ dailyExpenditureKcal: invalid })).status).toBe(400);
      }
      expect(await read()).toEqual({ data: { dailyExpenditureKcal: 1500 } });
    } finally {
      database.close();
    }
  });
});
