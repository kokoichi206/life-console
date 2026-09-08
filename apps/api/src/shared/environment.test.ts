import { describe, expect, it } from "vitest";

import { apiEnvironmentSchema } from "./environment";

describe("Worker の環境変数", () => {
  it("Web Push の部分設定や不正な連絡先を拒否する", () => {
    const base = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker" };
    const keys = { WEB_PUSH_PUBLIC_KEY: "B".repeat(87), WEB_PUSH_PRIVATE_KEY: "A".repeat(43), WEB_PUSH_SUBJECT: "mailto:push@example.com" };
    expect(apiEnvironmentSchema.safeParse({ ...base, WEB_PUSH_PUBLIC_KEY: keys.WEB_PUSH_PUBLIC_KEY }).success).toBe(false);
    expect(apiEnvironmentSchema.safeParse({ ...base, ...keys }).success).toBe(true);
    expect(apiEnvironmentSchema.safeParse({ ...base, ...keys, WEB_PUSH_SUBJECT: "http://localhost" }).success).toBe(false);
  });
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
