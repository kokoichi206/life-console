import { describe, expect, it } from "vitest";

import { apiEnvironmentSchema } from "./environment";

describe("Worker の環境変数", () => {
  it("Worker upload は R2 S3 の資格情報を要求しない", () => {
    expect(apiEnvironmentSchema.safeParse({ APP_ENV: "production", PHOTO_UPLOAD_MODE: "worker" }).success).toBe(true);
  });
  it("環境名の誤りと空の token を拒否する", () => {
    expect(apiEnvironmentSchema.safeParse({ APP_ENV: "prod", PHOTO_UPLOAD_MODE: "worker" }).success).toBe(false);
    expect(apiEnvironmentSchema.safeParse({ APP_ENV: "production", PHOTO_UPLOAD_MODE: "worker", RUNNER_TOKEN: "" }).success).toBe(false);
  });
  it("R2 直接 upload は署名に必要な値をすべて要求する", () => {
    expect(apiEnvironmentSchema.safeParse({ APP_ENV: "production", PHOTO_UPLOAD_MODE: "r2" }).success).toBe(false);
    expect(apiEnvironmentSchema.safeParse({ APP_ENV: "production", PHOTO_UPLOAD_MODE: "r2", R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", R2_ACCOUNT_ID: "account", R2_BUCKET_NAME: "photos" }).success).toBe(true);
  });
  it("local 以外では既知のローカル token を拒否する", () => {
    expect(apiEnvironmentSchema.safeParse({ APP_ENV: "production", PHOTO_UPLOAD_MODE: "worker", RUNNER_TOKEN: "local-runner-token" }).success).toBe(false);
  });
});
