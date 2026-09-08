import { ok } from "@life-console/core";
import { describe, expect, it, vi } from "vitest";

import { app } from "./app";
import { D1LifeConsoleRepository } from "./repositories/d1-life-console-repository";

describe("HTTP の環境変数検証", () => {
  it("不正な APP_ENV は health を成功させず、値を応答やログに含めない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await app.request("/api/v1/health", {}, { APP_ENV: "private-invalid-value", PHOTO_UPLOAD_MODE: "worker" });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private-invalid-value");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-invalid-value");
    log.mockRestore();
  });
  it("正しい設定なら DB 操作を伴わない health に応答する", async () => {
    const response = await app.request("/api/v1/health", {}, { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker" });
    expect(response.status).toBe(200);
  });
});

describe("食事写真のアップロード URL", () => {
  it("Worker 経由は画面と同じ origin に送信できる相対パスを返す", async () => {
    const savePhoto = vi.spyOn(D1LifeConsoleRepository.prototype, "createMealPhoto").mockResolvedValue(ok(undefined));
    try {
      const response = await app.request("http://localhost:8788/api/v1/meal-photos/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: crypto.randomUUID(), contentType: "image/jpeg" }),
      }, { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker" });
      expect(response.status).toBe(200);
      const { data: upload } = await response.json() as { readonly data: { readonly uploadUrl: string; readonly photoId: string } };
      expect(upload.uploadUrl).toMatch(new RegExp(`^/api/v1/meal-photos/${upload.photoId}/content\\?token=`));
      expect(new URL(upload.uploadUrl, "http://localhost:5173/health").origin).toBe("http://localhost:5173");
      expect(savePhoto).toHaveBeenCalledOnce();
    } finally {
      savePhoto.mockRestore();
    }
  });
});
