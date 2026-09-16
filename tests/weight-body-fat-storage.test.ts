import { describe, expect, it } from "vitest";

import { app } from "../apps/api/src/app";

import { createJobStorage } from "./support/d1-storage";

describe("体重と任意の体脂肪率", () => {
  it("体脂肪率あり・なしを HTTP で保存し、重複登録で上書きせず再取得する", async () => {
    const { database, binding } = createJobStorage();
    const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding };
    const create = (sourceKey: string, bodyFatPercent?: number) => app.request("/api/v1/weights", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "manual", sourceKey, weightKg: 70.5, occurredAt: "2026-09-16T00:00:00Z", bodyFatPercent }),
    }, environment);
    try {
      expect((await create("with-fat", 21.3)).status).toBe(200);
      expect((await create("without-fat")).status).toBe(200);
      expect((await create("with-fat", 22)).status).toBe(200);
      const response = await app.request("/api/v1/weights", {}, environment);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: expect.arrayContaining([
        expect.objectContaining({ weightKg: 70.5, bodyFatPercent: 21.3 }),
        expect.objectContaining({ weightKg: 70.5, bodyFatPercent: null }),
      ]) });
      expect(database.prepare("SELECT count(*) AS count FROM weights").get()?.count).toBe(2);
    } finally { database.close(); }
  });

  it.each([-0.1, 100.1, "21.3", null])("不正な体脂肪率 %s を保存しない", async (bodyFatPercent) => {
    const { database, binding } = createJobStorage();
    try {
      const response = await app.request("/api/v1/weights", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual", sourceKey: "invalid", weightKg: 70, occurredAt: "2026-09-16T00:00:00Z", bodyFatPercent }),
      }, { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding });
      expect(response.status).toBe(400);
      expect(database.prepare("SELECT count(*) AS count FROM weights").get()?.count).toBe(0);
    } finally { database.close(); }
  });
});
