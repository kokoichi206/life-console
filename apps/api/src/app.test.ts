import { describe, expect, it, vi } from "vitest";

import { app } from "./app";

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
