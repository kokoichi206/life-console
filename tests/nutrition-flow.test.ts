import { writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "../apps/api/src/app";
import type { RunnerConfig } from "../apps/runner/src/config";
import { createApiRepository } from "../apps/runner/src/repositories/api-repository";
import { createNutritionGenerator } from "../apps/runner/src/repositories/nutrition-generator";
import { createJobExecutorUsecase } from "../apps/runner/src/usecases/job-executor-usecase";
import { createRunnerUsecase } from "../apps/runner/src/usecases/runner-usecase";
import { ok } from "../packages/core/src/index";

import { createJobStorage } from "./support/d1-storage";

afterEach(() => vi.unstubAllGlobals());

describe("栄養解析の HTTP と runner の経路", () => {
  it("runner の認証がない写真取得・結果保存を拒否する", async () => {
    for (const [path, method] of [["/api/v1/runner/meal-photos/photo/content", "GET"], ["/api/v1/runner/nutrition/candidates", "GET"], ["/api/v1/runner/nutrition/estimates", "POST"]] as const) {
      expect((await app.request(path, { method }, { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker" })).status).toBe(401);
    }
  });
  it("画像取得から解析・lease 付き保存・ジョブ完了・再表示まで通る", async () => {
    const { database, repository, binding } = createJobStorage();
    const get = vi.fn().mockResolvedValue({ body: new Blob(["test-image"]).stream(), httpEtag: "\"test\"" });
    const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding, MEAL_PHOTOS: { get, head: vi.fn().mockResolvedValue({}) } };
    try {
      const now = new Date().toISOString();
      await repository.createMealPhoto({ id: "photo", clientId: "photo-client", contentType: "image/jpeg", objectKey: "meals/test.jpg", tokenHash: "hash", expiresAt: now, now });
      const response = await app.request("/api/v1/meals", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "11111111-1111-4111-8111-111111111111", photoId: "photo", memo: "写真の食事", mealKind: "lunch", occurredAt: now, tags: [] }) }, environment);
      expect(response.status).toBe(200);
      expect(database.prepare("SELECT status, kind FROM jobs").get()).toMatchObject({ status: "queued", kind: "nutrition_analysis" });
      vi.stubGlobal("fetch", (url: string, init: RequestInit) => app.request(url, init, environment));
      const api = createApiRepository({ apiUrl: "http://localhost", runnerId: "test-runner", runnerName: "Test runner", runnerToken: "local-runner-token" } as RunnerConfig);
      const execute = vi.fn().mockImplementation(async (_command: string, args: ReadonlyArray<string>) => {
        await writeFile(args[args.indexOf("--output-last-message") + 1]!, JSON.stringify({
          estimate: { caloriesKcal: 650, proteinGrams: 30, fatGrams: 20, carbohydrateGrams: 87.5 },
        }));
        return ok({ stdout: JSON.stringify({ type: "turn.completed" }), stderr: "" });
      });
      const executor = createJobExecutorUsecase({ api, nutritionGenerator: createNutritionGenerator({ execute }, api) } as Parameters<typeof createJobExecutorUsecase>[0]);
      const runner = createRunnerUsecase({ api, executor, heartbeatMilliseconds: 60_000, logger: { info: vi.fn(), error: vi.fn() } });
      expect(await runner.register()).toBe(true);
      await runner.runOnce();
      expect(database.prepare("SELECT status, error_code FROM jobs").get()).toMatchObject({ status: "succeeded", error_code: null });
      const listed = await app.request("/api/v1/nutrition", {}, environment);
      expect(await listed.json()).toMatchObject({ data: [{ estimate: { caloriesKcal: 650, model: "gpt-5.6-luna" } }] });
      expect(get).toHaveBeenCalledWith("meals/test.jpg");
      expect(execute).toHaveBeenCalledOnce();
    } finally { database.close(); }
  });
});
