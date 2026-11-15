import { describe, expect, it, vi } from "vitest";

import { app } from "../apps/api/src/app";
import { createNutritionRepository } from "../apps/api/src/repositories/nutrition-repository";

import { createJobStorage } from "./support/d1-storage";

const now = "2026-11-13T03:00:00Z";
const input = { photoId: "same-photo", additionalPhotoIds: ["second-photo"], memo: "架空の昼食", manualCaloriesKcal: 600, occurredAt: now, tags: ["昼食"] };

describe("食事の削除と取り消し", () => {
  it("指定した 1 件だけを一覧・集計・解析候補から除外し、写真と栄養情報を残して元に戻す", async () => {
    const { repository, database, binding } = createJobStorage();
    try {
      for (const id of ["keep", "duplicate"]) {
        await repository.createMealAndQueueNutrition(id, { ...input, clientId: id }, now);
        database.prepare("INSERT INTO nutrition_estimates (id, meal_id, model, analyzed_at, input_hash, calories_kcal, protein_grams, fat_grams, carbohydrate_grams, created_at) VALUES (?, ?, 'test', ?, 'hash', 650, 30, 20, 80, ?)").run(`estimate-${id}`, id, now, now);
      }
      for (const id of ["same-photo", "second-photo"]) await repository.createMealPhoto({ id, clientId: id, contentType: "image/jpeg", objectKey: `${id}.jpg`, tokenHash: "test", expiresAt: now, now });
      const settings = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding };
      const nutrition = createNutritionRepository(binding);
      const original = database.prepare("SELECT * FROM meals WHERE id = 'duplicate'").get();
      const originalEstimates = database.prepare("SELECT * FROM nutrition_estimates").all();
      const originalPhotos = database.prepare("SELECT * FROM meal_photos").all();

      const deleted = await app.request("/api/v1/meals/duplicate", { method: "DELETE" }, settings);
      expect(deleted.status).toBe(200);
      expect(await deleted.json()).toEqual({ data: null });
      expect(database.prepare("SELECT * FROM meals WHERE id = 'duplicate'").get()).toEqual({ ...original, deleted_at: expect.any(String) });
      expect(await repository.listMeals()).toMatchObject({ ok: true, value: [{ id: "keep" }] });
      expect(await repository.listMealGallery("2026-11-13")).toMatchObject({ ok: true, value: { meals: [{ id: "keep" }] } });
      expect(await repository.listMealDayCounts({ from: "2026-11-13", to: "2026-11-13" })).toEqual({ ok: true, value: [{ occurredAt: "2026-11-13", count: 1 }] });
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{ mealId: "keep", manualCaloriesKcal: 600 }] });
      expect(await nutrition.candidates({ mealId: "duplicate" })).toMatchObject({ ok: false, error: { code: "not_found" } });
      expect(await nutrition.saveManualCalories("duplicate", 500)).toMatchObject({ ok: false });
      expect(database.prepare("SELECT * FROM nutrition_estimates").all()).toEqual(originalEstimates);
      expect(database.prepare("SELECT * FROM meal_photos").all()).toEqual(originalPhotos);

      await repository.createMealAndQueueNutrition("retry", { ...input, clientId: "duplicate" }, now);
      expect(await repository.listMeals()).toMatchObject({ ok: true, value: [{ id: "keep" }] });
      const restored = await app.request("/api/v1/meals/duplicate/restore", { method: "POST" }, settings);
      expect(restored.status).toBe(200);
      expect(database.prepare("SELECT * FROM meals WHERE id = 'duplicate'").get()).toEqual(original);
      expect(await repository.listMeals()).toMatchObject({ ok: true, value: expect.arrayContaining([expect.objectContaining({ id: "keep" }), expect.objectContaining({ id: "duplicate" })]) });
      expect(await repository.listMealDayCounts({ from: "2026-11-13", to: "2026-11-13" })).toEqual({ ok: true, value: [{ occurredAt: "2026-11-13", count: 2 }] });
      expect(await nutrition.list()).toMatchObject({ ok: true, value: expect.arrayContaining([expect.objectContaining({ mealId: "duplicate", manualCaloriesKcal: 600, estimate: expect.objectContaining({ caloriesKcal: 650, proteinGrams: 30, fatGrams: 20, carbohydrateGrams: 80 }) })]) });
      expect(database.prepare("SELECT COUNT(*) AS count FROM jobs").get()).toEqual({ count: 0 });
    } finally { database.close(); }
  });

  it("存在しない ID と削除・復元できない状態は成功扱いにせず、他の記録を変えない", async () => {
    const { repository, database, binding } = createJobStorage();
    try {
      await repository.createMealAndQueueNutrition("keep", { ...input, clientId: "keep" }, now);
      const settings = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding };
      for (const [method, path] of [["DELETE", "missing"], ["POST", "missing/restore"], ["POST", "keep/restore"]] as const) {
        expect((await app.request(`/api/v1/meals/${path}`, { method }, settings)).status).toBe(404);
      }
      expect(database.prepare("SELECT deleted_at FROM meals WHERE id = 'keep'").get()).toEqual({ deleted_at: null });
      expect((await app.request("/api/v1/meals/keep", { method: "DELETE" }, settings)).status).toBe(200);
      const deletion = database.prepare("SELECT deleted_at FROM meals WHERE id = 'keep'").get();
      expect((await app.request("/api/v1/meals/keep", { method: "DELETE" }, settings)).status).toBe(404);
      expect(database.prepare("SELECT deleted_at FROM meals WHERE id = 'keep'").get()).toEqual(deletion);
      expect((await app.request(`/api/v1/meals/${"x".repeat(129)}`, { method: "DELETE" }, settings)).status).toBe(400);
    } finally { database.close(); }
  });

  it("DB の失敗を成功で隠さず、写真を削除する処理を呼ばない", async () => {
    const { database, binding } = createJobStorage();
    const bucket = { delete: vi.fn() };
    try {
      database.exec("DROP TABLE meals");
      const settings = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding, MEAL_PHOTOS: bucket };
      for (const [method, path] of [["DELETE", "meal"], ["POST", "meal/restore"]] as const) {
        expect((await app.request(`/api/v1/meals/${path}`, { method }, settings)).status).toBe(500);
      }
      expect(bucket.delete).not.toHaveBeenCalled();
    } finally { database.close(); }
  });
});
