import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";

import { describe, expect, it } from "vitest";

import { app } from "../apps/api/src/app";
import { createNutritionRepository } from "../apps/api/src/repositories/nutrition-repository";

import { createJobStorage } from "./support/d1-storage";

const now = "2026-10-10T12:00:00Z";
describe("食事の追加写真の保存", () => {
  it("写真の順序を保存し、食事一覧・ギャラリー・解析候補に返し、再送で予約を増やさない", async () => {
    const { repository, database, binding } = createJobStorage();
    try {
      const input = { clientId: "client", photoId: "main", additionalPhotoIds: ["second", "third", "fourth"], memo: "食事", occurredAt: now, tags: [] };
      const created = await repository.createMealAndQueueNutrition("meal", input, now);
      expect(created).toMatchObject({ ok: true, value: { photoId: "main", additionalPhotoIds: input.additionalPhotoIds } });
      expect(await repository.createMealAndQueueNutrition("ignored-retry", input, now)).toEqual(created);
      expect(await repository.listMeals()).toMatchObject({ ok: true, value: [{ additionalPhotoIds: input.additionalPhotoIds }] });
      expect(await repository.listMealGallery("2026-10-10")).toMatchObject({ ok: true, value: { meals: [{ additionalPhotoIds: input.additionalPhotoIds }] } });
      expect(await createNutritionRepository(binding).candidates({ mealId: "meal" })).toMatchObject({ ok: true, value: [{ photoId: "main", additionalPhotoIds: input.additionalPhotoIds }] });
      expect(database.prepare("SELECT count(*) AS count FROM jobs").get()?.count).toBe(1);
    } finally { database.close(); }
  });
});

it.each([true, false])("全写真のアップロードを確認してから保存する: 完了=%s", async (uploaded) => {
  const { repository, database, binding } = createJobStorage();
  try {
    for (const id of ["main", "second", "third", "fourth"]) await repository.createMealPhoto({ id, clientId: id, contentType: "image/jpeg", objectKey: id, tokenHash: "test", expiresAt: now, now });
    const response = await app.request("/api/v1/meals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      clientId: "11111111-1111-4111-8111-111111111111", photoId: "main", additionalPhotoIds: ["second", "third", "fourth"], occurredAt: now,
    }) }, { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding, MEAL_PHOTOS: { head: async (id: string) => !uploaded && id === "fourth" ? null : {} } });
    expect(response.status).toBe(uploaded ? 200 : 400);
    if (uploaded) expect(database.prepare("SELECT photo_id, additional_photo_ids FROM meals").get()).toMatchObject({ photo_id: "main", additional_photo_ids: JSON.stringify(["second", "third", "fourth"]) });
    expect(database.prepare("SELECT count(*) AS count FROM meals").get()?.count).toBe(uploaded ? 1 : 0);
    expect(database.prepare("SELECT count(*) AS count FROM jobs").get()?.count).toBe(uploaded ? 1 : 0);
  } finally { database.close(); }
});

it("追加写真の migration は既存の代表写真・メモ・手入力カロリーを保持する", () => {
  const database = new DatabaseSync(":memory:");
  const migrations = new URL("../packages/db/migrations/", import.meta.url);
  const target = "0022_worried_joystick.sql";
  try {
    for (const name of readdirSync(migrations).filter((name) => name.endsWith(".sql") && name < target).sort()) database.exec(readFileSync(new URL(name, migrations), "utf8"));
    database.prepare("INSERT INTO meals (id, client_id, photo_id, memo, manual_calories_kcal, occurred_at, recorded_at, tags_json) VALUES ('legacy', 'legacy', 'legacy-photo', '既存の記録', 600, ?, ?, '[]')").run(now, now);
    database.exec(readFileSync(new URL(target, migrations), "utf8"));
    expect(database.prepare("SELECT photo_id, memo, manual_calories_kcal, additional_photo_ids FROM meals WHERE id = 'legacy'").get()).toMatchObject({
      photo_id: "legacy-photo", memo: "既存の記録", manual_calories_kcal: 600, additional_photo_ids: "[]",
    });
  } finally { database.close(); }
});
