import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { runnerEnvironmentSchema } from "./environment";

describe("runner の環境変数", () => {
  it("LaunchAgent 例は APP_ENV を local と明示する", () => {
    const launchAgent = readFileSync(new URL("../launchd/com.life-console.runner.plist.example", import.meta.url), "utf8");
    expect(launchAgent).toMatch(/<key>EnvironmentVariables<\/key>\s*<dict>\s*<key>APP_ENV<\/key>\s*<string>local<\/string>/u);
  });
  it("local に限ってローカル接続の既定値を使う", () => {
    const parsed = runnerEnvironmentSchema.parse({ APP_ENV: "local" });
    expect(parsed.LIFE_CONSOLE_API_URL).toBe("http://localhost:8788");
    expect(parsed.LIFE_CONSOLE_RUNNER_TOKEN).toBe("local-runner-token");
    expect(parsed.LIFE_CONSOLE_NUTRITION_PROVIDER).toBe("codex");
  });
  it("環境名の未指定と本番接続先・token の未指定を拒否する", () => {
    expect(runnerEnvironmentSchema.safeParse({}).success).toBe(false);
    expect(runnerEnvironmentSchema.safeParse({ APP_ENV: "production" }).success).toBe(false);
  });
  it("Access の ID と secret は両方必要", () => {
    expect(runnerEnvironmentSchema.safeParse({ APP_ENV: "local", CF_ACCESS_CLIENT_ID: "client" }).success).toBe(false);
  });
  it("本番用の明示設定を受け付ける", () => {
    expect(runnerEnvironmentSchema.safeParse({ APP_ENV: "production", LIFE_CONSOLE_API_URL: "https://console.example.com", LIFE_CONSOLE_RUNNER_TOKEN: "private-test-token" }).success).toBe(true);
  });
  it("不正な poll 間隔を拒否する", () => {
    expect(runnerEnvironmentSchema.safeParse({ APP_ENV: "local", LIFE_CONSOLE_POLL_SECONDS: "abc" }).success).toBe(false);
  });
});
