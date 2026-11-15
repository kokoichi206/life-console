import { describe, expect, it } from "vitest";

import { app } from "../apps/api/src/app";
import { createNutritionRepository } from "../apps/api/src/repositories/nutrition-repository";

import { createJobStorage } from "./support/d1-storage";

const now = "2026-11-15T03:00:00Z";
const input = { photoId: "new-main", additionalPhotoIds: ["new-second"], memo: "鮭定食、ご飯 150 g", occurredAt: "2026-11-14T10:00:00Z", tags: ["夕食"] };

const seedMeal = async (storage: ReturnType<typeof createJobStorage>) => {
  await storage.repository.createMealAndQueueNutrition("meal", { clientId: "client", photoId: "old", additionalPhotoIds: [], memo: "定食", occurredAt: now, tags: [], manualCaloriesKcal: 600 }, now);
};

describe("保存済みの食事の編集", () => {
  it("写真・メモ・日時を更新し、解析候補へ反映し、登録日時・カロリーを保ち、ジョブを増やさない", async () => {
    const storage = createJobStorage();
    try {
      await seedMeal(storage);
      expect(await storage.repository.updateMeal("meal", input)).toEqual({ ok: true, value: undefined });
      expect(await storage.repository.listMeals()).toMatchObject({ ok: true, value: [{ ...input, recordedAt: now }] });
      expect(await createNutritionRepository(storage.binding).candidates({ mealId: "meal" })).toMatchObject({ ok: true, value: [{ id: "meal", photoId: "new-main", additionalPhotoIds: ["new-second"], memo: input.memo }] });
      expect(storage.database.prepare("SELECT manual_calories_kcal FROM meals").get()?.manual_calories_kcal).toBe(600);
      expect(storage.database.prepare("SELECT count(*) AS count FROM jobs").get()?.count).toBe(0);
    } finally { storage.database.close(); }
  });

  it("解析待ちの食事は編集でき、待機ジョブを保持して更新後の入力を候補に返す", async () => {
    const storage = createJobStorage();
    try {
      await storage.repository.createMealAndQueueNutrition("meal", { clientId: "client", photoId: null, additionalPhotoIds: [], memo: "定食", occurredAt: now, tags: [] }, now);
      expect(await storage.repository.updateMeal("meal", input)).toMatchObject({ ok: true });
      expect(await createNutritionRepository(storage.binding).candidates({ mealId: "meal" })).toMatchObject({ ok: true, value: [{ memo: input.memo, photoId: input.photoId, additionalPhotoIds: input.additionalPhotoIds }] });
      expect(storage.database.prepare("SELECT count(*) AS count FROM jobs WHERE status = 'queued'").get()?.count).toBe(1);
    } finally { storage.database.close(); }
  });

  it.each(["claimed", "running", "waiting_for_user"])("個別または一括解析が %s のときは更新しない", async (status) => {
    for (const payload of [{ mealId: "meal" }, {}]) {
      const storage = createJobStorage();
      try {
        await seedMeal(storage);
        await storage.repository.createJob({ id: "analysis", kind: "nutrition_analysis", idempotencyKey: "analysis", payloadJson: JSON.stringify(payload), now });
        storage.database.prepare("UPDATE jobs SET status = ?").run(status);
        expect(await storage.repository.updateMeal("meal", input)).toMatchObject({ ok: false, error: { code: "conflict" } });
        expect(storage.database.prepare("SELECT memo, photo_id FROM meals").get()).toMatchObject({ memo: "定食", photo_id: "old" });
      } finally { storage.database.close(); }
    }
  });

  it("他の食事の解析は編集を妨げず、削除済みの記録は編集しない", async () => {
    const storage = createJobStorage();
    try {
      await seedMeal(storage);
      await storage.repository.createJob({ id: "other", kind: "nutrition_analysis", idempotencyKey: "other", payloadJson: JSON.stringify({ mealId: "other" }), now });
      storage.database.prepare("UPDATE jobs SET status = 'running'").run();
      expect(await storage.repository.updateMeal("meal", input)).toMatchObject({ ok: true });
      await storage.repository.deleteMeal("meal", now);
      expect(await storage.repository.updateMeal("meal", { ...input, memo: "更新しない" })).toMatchObject({ ok: false });
      expect(storage.database.prepare("SELECT memo FROM meals").get()?.memo).toBe(input.memo);
    } finally { storage.database.close(); }
  });

  it.each([true, false])("更新 API は追加写真までアップロードを確認する: 完了=%s", async (uploaded) => {
    const storage = createJobStorage();
    try {
      await seedMeal(storage);
      for (const id of [input.photoId, ...input.additionalPhotoIds]) await storage.repository.createMealPhoto({ id, clientId: id, contentType: "image/jpeg", objectKey: id, tokenHash: "test", expiresAt: now, now });
      const response = await app.request("/api/v1/meals/meal", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, {
        APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: storage.binding,
        MEAL_PHOTOS: { head: async (id: string) => !uploaded && id === "new-second" ? null : {} },
      });
      expect(response.status).toBe(uploaded ? 200 : 400);
      expect(storage.database.prepare("SELECT memo FROM meals").get()?.memo).toBe(uploaded ? input.memo : "定食");
    } finally { storage.database.close(); }
  });
});
