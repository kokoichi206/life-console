import { describe, expect, it } from "vitest";

import { APP_ENV, baseEnvSchema } from "./index";

describe("実行環境の共通スキーマ", () => {
  it("local・development・production を受け付ける", () => {
    for (const APP_ENV_VALUE of Object.values(APP_ENV)) {
      expect(baseEnvSchema.parse({ APP_ENV: APP_ENV_VALUE }).APP_ENV).toBe(APP_ENV_VALUE);
    }
  });
  it("APP_ENV の未指定と不明な値は拒否する", () => {
    expect(baseEnvSchema.safeParse({}).success).toBe(false);
    expect(baseEnvSchema.safeParse({ APP_ENV: "prod" }).success).toBe(false);
  });
});
