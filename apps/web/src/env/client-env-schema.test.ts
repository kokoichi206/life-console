import { describe, expect, it } from "vitest";

import { clientEnvSchema } from "./client-env-schema";

describe("フロントの公開環境変数", () => {
  it("公開する APP_ENV だけを受け取り、秘密情報を保持しない", () => {
    expect(clientEnvSchema.parse({ APP_ENV: "local", RUNNER_TOKEN: "secret" })).toEqual({ APP_ENV: "local" });
  });
  it("APP_ENV の未指定を拒否する", () => {
    expect(clientEnvSchema.safeParse({}).success).toBe(false);
  });
});
