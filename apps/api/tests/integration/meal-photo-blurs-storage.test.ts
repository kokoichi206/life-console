import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";

import { describe, expect, it } from "vitest";

import { app } from "../../src/app";
import { D1LifeConsoleRepository } from "../../src/repositories/d1-life-console-repository";
import { createNutritionRepository } from "../../src/repositories/nutrition-repository";

import { createApiStorage } from "./support/d1-storage";

const now = "2026-11-14T03:00:00Z";
const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
type Upload = { photoId: string; uploadUrl: string; requiredHeaders: Record<string, string> };

describe("食事写真のぼかしバージョン", () => {
  it("同じ写真 ID の元画像とぼかしを保存・取得し、枚数と解析入力を増やさない", async () => {
    const { database, binding, repository } = createApiStorage();
    const objects = new Map<string, { body: string; type: string }>();
    const bucket = {
      put: async (key: string, body: ReadableStream, options: { httpMetadata: { contentType: string } }) => { objects.set(key, { body: await new Response(body).text(), type: options.httpMetadata.contentType }); },
      head: async (key: string) => objects.has(key) ? {} : null,
      get: async (key: string) => {
        const object = objects.get(key);
        return object === undefined ? null : { body: new Response(object.body).body, httpEtag: `"${key}"` };
      },
    };
    const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding, MEAL_PHOTOS: bucket, HEALTH_SHARE_TOKEN: "ab".repeat(32) };
    const request = (path: string, init?: RequestInit) => app.request(path, init, environment);
    try {
      const originalResponse = await request("/api/v1/meal-photos/upload", json({ clientId: crypto.randomUUID(), contentType: "image/jpeg" }));
      const { data: original } = await originalResponse.json() as { data: Upload };
      expect((await request(original.uploadUrl, { method: "PUT", headers: original.requiredHeaders, body: "original pixels" })).status).toBe(200);
      const blurResponse = await request(`/api/v1/meal-photos/${original.photoId}/blur/upload`, json({ contentType: "image/jpeg" }));
      const { data: blur } = await blurResponse.json() as { data: Upload };
      expect(blur.photoId).toBe(original.photoId);
      expect((await request(`/api/v1/meal-photos/${original.photoId}/content?variant=blurred`)).status).toBe(404);
      expect((await request(`/api/v1/meal-photos/${original.photoId}/blur/complete`, json({}))).status).toBe(400);
      expect((await request(blur.uploadUrl, { method: "PUT", headers: original.requiredHeaders, body: "blurred pixels" })).status).toBe(200);
      expect((await request(`/api/v1/meal-photos/${original.photoId}/blur/complete`, json({}))).status).toBe(200);
      // PUT の応答を受け取れず再試行した場合にも、保存済みの画像を上書きしない。
      expect(await (await request(`/api/v1/meal-photos/${original.photoId}/blur/upload`, json({ contentType: "image/jpeg" }))).json()).toEqual({ data: null });
      expect((await request(blur.uploadUrl, { method: "PUT", headers: blur.requiredHeaders, body: "overwrite" })).status).toBe(403);
      expect(await (await request(`/api/v1/meal-photos/${original.photoId}/content`)).text()).toBe("original pixels");
      const blurredRead = await request(`/api/v1/meal-photos/${original.photoId}/content?variant=blurred`);
      expect(await blurredRead.text()).toBe("blurred pixels");
      expect(blurredRead.headers.get("ETag")).toMatch(/^".+"$/u);
      const shared = await request(`/api/v1/share/${environment.HEALTH_SHARE_TOKEN}/meal-photos/${original.photoId}/content?variant=blurred`);
      expect(await shared.text()).toBe("blurred pixels");
      expect(shared.headers.get("Cache-Control")).toBe("no-store");
      expect((await request(`/api/v1/share/invalid/meal-photos/${original.photoId}/content?variant=blurred`)).status).toBe(404);
      const input = { clientId: crypto.randomUUID(), photoId: original.photoId, additionalPhotoIds: [], memo: "架空の食事", occurredAt: now, tags: [] };
      const saved = await request("/api/v1/meals", json(input));
      expect(saved.status).toBe(200);
      const { data: meal } = await saved.json() as { data: { id: string } };
      expect((await request("/api/v1/meals", json(input))).status).toBe(200);
      expect(await repository.listMealGallery("2026-11-14")).toMatchObject({ ok: true, value: { meals: [{ photoId: original.photoId, additionalPhotoIds: [], blurredPhotoIds: [original.photoId] }] } });
      const candidates = await createNutritionRepository(binding).candidates({ mealId: meal.id });
      expect(candidates).toMatchObject({ ok: true, value: [{ photoId: original.photoId, additionalPhotoIds: [] }] });
      expect(database.prepare("SELECT count(*) AS count FROM meals").get()?.count).toBe(1);
      expect(database.prepare("SELECT count(*) AS count FROM meal_photos").get()?.count).toBe(1);
      expect(database.prepare("SELECT count(*) AS count FROM meal_photo_blurs").get()?.count).toBe(1);
      expect(database.prepare("SELECT count(*) AS count FROM jobs").get()?.count).toBe(1);
    } finally { database.close(); }
  });

  it("R2 直接アップロードは完了確認まで表示対象にせず、予約の再送で子行を増やさない", async () => {
    const { database, binding, repository } = createApiStorage();
    const originalKey = "meals/original.png";
    let uploaded = false;
    const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "r2", DB: binding, R2_ACCOUNT_ID: "example-account", R2_BUCKET_NAME: "example-bucket", R2_ACCESS_KEY_ID: "example-key", R2_SECRET_ACCESS_KEY: "example-secret", MEAL_PHOTOS: { head: async () => uploaded ? {} : null } };
    try {
      await repository.createMealPhoto({ id: "photo", clientId: "photo", objectKey: originalKey, contentType: "image/png", tokenHash: "test", expiresAt: now, now });
      const request = () => app.request("/api/v1/meal-photos/photo/blur/upload", json({ contentType: "image/jpeg" }), environment);
      const first = await request();
      expect(first.status).toBe(200);
      const { data: upload } = await first.json() as { data: Upload };
      expect(upload.uploadUrl).toContain("example-account.r2.cloudflarestorage.com/example-bucket/meals/original.png.blur.jpg");
      expect((await request()).status).toBe(200);
      expect(database.prepare("SELECT count(*) AS count FROM meal_photo_blurs").get()?.count).toBe(1);
      await repository.createMealAndQueueNutrition("meal", { clientId: "meal", photoId: "photo", additionalPhotoIds: [], memo: "", manualCaloriesKcal: 1, occurredAt: now, tags: [] }, now);
      expect(await repository.listMeals()).toMatchObject({ ok: true, value: [{ blurredPhotoIds: [] }] });
      uploaded = true;
      expect((await app.request("/api/v1/meal-photos/photo/blur/complete", json({}), environment)).status).toBe(200);
      expect(await repository.listMeals()).toMatchObject({ ok: true, value: [{ blurredPhotoIds: ["photo"] }] });
      expect(await (await request()).json()).toEqual({ data: null });
    } finally { database.close(); }
  });

  it("写真が 100 枚を超えても D1 のパラメーター上限を超えず、対象写真の完了済みぼかしだけを返す", async () => {
    const { database, binding, repository } = createApiStorage();
    const ids = Array.from({ length: 150 }, (_, index) => `photo-${index}`);
    const prepare = binding.prepare.bind(binding);
    binding.prepare = (query: string) => {
      const statement = prepare(query);
      const bind = statement.bind.bind(statement);
      statement.bind = (...values: unknown[]) => {
        expect(values.length).toBeLessThanOrEqual(100);
        return bind(...values);
      };
      return statement;
    };
    const limitedRepository = new D1LifeConsoleRepository(binding);
    try {
      for (const id of [...ids, "outside"]) await repository.createMealPhoto({ id, clientId: id, contentType: "image/jpeg", objectKey: id, tokenHash: "hash", expiresAt: now, now });
      for (const id of [ids[3]!, ids[100]!, ids[149]!, "outside"]) {
        await repository.reserveMealPhotoBlur({ photoId: id, contentType: "image/jpeg", objectKey: `${id}.blur`, tokenHash: "hash", expiresAt: now, now });
        if (id !== ids[100]) await repository.markMealPhotoBlurUploaded(id, now);
      }
      await repository.createMealAndQueueNutrition("many", { clientId: "many", photoId: ids[0]!, additionalPhotoIds: ids.slice(1), memo: "", manualCaloriesKcal: 1, occurredAt: now, tags: [] }, now);
      expect(await limitedRepository.listMealGallery("2026-11-14")).toMatchObject({ ok: true, value: { meals: [{ blurredPhotoIds: [ids[3], ids[149]] }] } });
    } finally { database.close(); }
  });

  it("migration は既存の写真と食事を保持し、ぼかしテーブルを空で追加する", () => {
    const database = new DatabaseSync(":memory:");
    const folder = new URL("../../../../packages/db/migrations/", import.meta.url);
    const target = "0025_clammy_rage.sql";
    try {
      for (const name of readdirSync(folder).filter((name) => name.endsWith(".sql") && name < target).sort()) database.exec(readFileSync(new URL(name, folder), "utf8"));
      database.exec("INSERT INTO meal_photos(id,client_id,object_key,content_type,upload_token_hash,upload_expires_at,created_at) VALUES ('old','old','old.jpg','image/jpeg','hash','2099-01-01','2026-01-01')");
      database.exec(readFileSync(new URL(target, folder), "utf8"));
      expect(database.prepare("SELECT object_key FROM meal_photos WHERE id='old'").get()?.object_key).toBe("old.jpg");
      expect(database.prepare("SELECT count(*) AS count FROM meal_photo_blurs").get()?.count).toBe(0);
      expect(() => database.exec("INSERT INTO meal_photo_blurs(photo_id,object_key,content_type,upload_token_hash,upload_expires_at,created_at) VALUES ('missing','blur.jpg','image/jpeg','hash','2099-01-01','2026-01-01')")).toThrow();
    } finally { database.close(); }
  });
});
