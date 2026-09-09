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

describe("手入力カロリーの HTTP 経路", () => {
  it("写真とカロリーを初回保存し、詳細から変更して再取得できる", async () => {
    const { database, repository, binding } = createJobStorage();
    const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding, MEAL_PHOTOS: { head: vi.fn().mockResolvedValue({}) } };
    const headers = { "Content-Type": "application/json" };
    try {
      const now = new Date().toISOString();
      await repository.createMealPhoto({ id: "photo", clientId: "photo-client", contentType: "image/jpeg", objectKey: "meals/test.jpg", tokenHash: "hash", expiresAt: now, now });
      const input = { clientId: "11111111-1111-4111-8111-111111111111", photoId: "photo", mealKind: "lunch", occurredAt: now, manualCaloriesKcal: 520 };
      expect((await app.request("/api/v1/meals", { method: "POST", headers, body: JSON.stringify(input) }, environment)).status).toBe(200);
      const meal = database.prepare("SELECT id FROM meals").get()!;
      expect(database.prepare("SELECT count(*) AS count FROM jobs").get()?.count).toBe(0);
      expect(await (await app.request("/api/v1/nutrition", {}, environment)).json()).toMatchObject({ data: [{ manualCaloriesKcal: 520, estimate: null }] });
      const path = `/api/v1/nutrition/${String(meal.id)}/calories`;
      expect((await app.request(path, { method: "PUT", headers, body: JSON.stringify({ caloriesKcal: 0 }) }, environment)).status).toBe(200);
      expect(await (await app.request("/api/v1/nutrition", {}, environment)).json()).toMatchObject({ data: [{ manualCaloriesKcal: 0, estimate: null }] });
      for (const caloriesKcal of [-1, 1.5, "520", null]) {
        expect((await app.request(path, { method: "PUT", headers, body: JSON.stringify({ caloriesKcal }) }, environment)).status).toBe(400);
        expect((await app.request("/api/v1/meals", { method: "POST", headers, body: JSON.stringify({ ...input, manualCaloriesKcal: caloriesKcal }) }, environment)).status).toBe(400);
      }
      expect((await app.request("/api/v1/nutrition/missing/calories", { method: "PUT", headers, body: JSON.stringify({ caloriesKcal: 100 }) }, environment)).status).toBe(404);
    } finally { database.close(); }
  });
});

describe("解析予約後の手入力", () => {
  it("画像解析中に手入力された個別ジョブを失敗にせず、手入力値を保持する", async () => {
    const { database, repository, binding } = createJobStorage();
    const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding };
    const now = new Date().toISOString();
    try {
      expect((await repository.createMealAndQueueNutrition("meal", { clientId: "client", photoId: "photo", memo: "", mealKind: "lunch", occurredAt: now, tags: [] }, now)).ok).toBe(true);
      vi.stubGlobal("fetch", (url: string, init: RequestInit) => app.request(url, init, environment));
      const api = createApiRepository({ apiUrl: "http://localhost", runnerId: "test-runner", runnerName: "Test runner", runnerToken: "local-runner-token" } as RunnerConfig);
      const generate = vi.fn().mockImplementation(async () => {
        const response = await app.request("/api/v1/nutrition/meal/calories", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caloriesKcal: 520 }) }, environment);
        expect(response.status).toBe(200);
        return ok({ caloriesKcal: 600, proteinGrams: 20, fatGrams: 20, carbohydrateGrams: 60, model: "test", analyzedAt: now, inputHash: "a".repeat(64) });
      });
      const executor = createJobExecutorUsecase({ api, nutritionGenerator: { generate } } as unknown as Parameters<typeof createJobExecutorUsecase>[0]);
      const runner = createRunnerUsecase({ api, executor, heartbeatMilliseconds: 60_000, logger: { info: vi.fn(), error: vi.fn() } });
      expect(await runner.register()).toBe(true);
      await runner.runOnce();
      expect(database.prepare("SELECT status, error_code FROM jobs").get()).toMatchObject({ status: "skipped_precondition", error_code: null });
      expect(await (await app.request("/api/v1/nutrition", {}, environment)).json()).toMatchObject({ data: [{ manualCaloriesKcal: 520, estimate: null, analysisStatus: null }] });
    } finally { database.close(); }
  });
});
