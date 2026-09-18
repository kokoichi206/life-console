import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "../apps/api/src/app";

import { createJobStorage } from "./support/d1-storage";

const shareToken = "ab".repeat(32);
const environment = {
  APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", HEALTH_SHARE_TOKEN: shareToken,
  STRAVA_CLIENT_ID: "123", STRAVA_CLIENT_SECRET: "test-secret", STRAVA_TOKEN_KEY: "cd".repeat(32), STRAVA_REDIRECT_URI: "http://localhost/api/v1/strava/callback",
};
const databases: ReturnType<typeof createJobStorage>["database"][] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  vi.unstubAllGlobals();
});

describe("健康ページの共有 API", () => {
  it("本人用と共有用は同じ保存データ・期間検証を使い、外部 API やジョブを実行しない", async () => {
    const { binding, database } = createJobStorage();
    databases.push(database);
    database.exec("INSERT INTO weights (id,source,source_key,weight_grams,occurred_at,recorded_at) VALUES ('w','manual','w',65000,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z')");
    database.exec("INSERT INTO meals (id,client_id,memo,occurred_at,recorded_at,tags_json) VALUES ('m','m','架空の食事','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','[]')");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const settings = { ...environment, DB: binding };
    for (const path of ["weights", "weight-goal", "calorie-baseline", "meals?from=2026-09-01&to=2026-09-01", "nutrition", "strava/status", "strava/activities?from=2026-09-01&to=2026-09-18&page=1", "strava/calories?from=2026-09-01&to=2026-09-18", "strava/calories/sync-status"]) {
      const owner = await app.request(`/api/v1/${path}`, {}, settings);
      const shared = await app.request(`/api/v1/share/${shareToken}/${path}`, {}, settings);
      expect(owner.status, path).toBe(200);
      expect(shared.status, path).toBe(200);
      expect(await shared.json(), path).toEqual(await owner.json());
      expect(shared.headers.get("Cache-Control")).toBe("no-store");
    }
    expect((await app.request(`/api/v1/share/${shareToken}/meals?from=2026-09-01`, {}, settings)).status).toBe(400);
    expect((await app.request(`/api/v1/share/${shareToken}/strava/status`, { method: "HEAD" }, { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", HEALTH_SHARE_TOKEN: shareToken, DB: binding })).status).toBe(200);
    expect(fetcher).not.toHaveBeenCalled();
    expect(database.prepare("SELECT COUNT(*) AS count FROM jobs").get()).toEqual({ count: 0 });
  });

  it("共有が未設定・不正・停止済みなら拒否し、設定済みでも更新と健康以外の取得は許可しない", async () => {
    for (const token of ["wrong", "ef".repeat(32), "あ".repeat(64)]) {
      expect((await app.request(`/api/v1/share/${encodeURIComponent(token)}/weights`, {}, environment)).status).toBe(404);
    }
    expect((await app.request(`/api/v1/share/${shareToken}/weights`, {}, { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker" })).status).toBe(404);
    for (const [method, path] of [["POST", "weights"], ["PUT", "weight-goal"], ["POST", "strava/sync"], ["GET", "strava/callback"], ["GET", "tasks"], ["GET", "health-share"], ["GET", "runner/jobs"]] as const) {
      expect((await app.request(`/api/v1/share/${shareToken}/${path}`, { method }, environment)).status, `${method} ${path}`).toBe(404);
    }
    const link = await app.request("/api/v1/health-share", {}, environment);
    expect(await link.json()).toEqual({ data: `/share/health/${shareToken}` });
    expect(link.headers.get("Cache-Control")).toBe("no-store");
  });

  it("写真にも共有認証と no-store を適用する", async () => {
    const { binding, database } = createJobStorage();
    databases.push(database);
    database.exec("INSERT INTO meal_photos (id,client_id,object_key,content_type,upload_token_hash,upload_expires_at,created_at) VALUES ('photo','photo','meals/photo.jpg','image/jpeg','hash','2099-01-01','2026-09-01')");
    const bucket = { get: vi.fn(async () => ({ body: new Response("fixture-image").body, contentType: "image/jpeg", httpEtag: "\"photo\"" })) };
    const settings = { ...environment, DB: binding, MEAL_PHOTOS: bucket };
    const photo = await app.request(`/api/v1/share/${shareToken}/meal-photos/photo/content`, {}, settings);
    expect(photo.status).toBe(200);
    expect(await photo.text()).toBe("fixture-image");
    expect(photo.headers.get("Cache-Control")).toBe("no-store");
    expect(photo.headers.get("Referrer-Policy")).toBe("no-referrer");
    bucket.get.mockClear();
    expect((await app.request("/api/v1/share/invalid/meal-photos/photo/content", {}, settings)).status).toBe(404);
    expect(bucket.get).not.toHaveBeenCalled();
  });
});
