import { err, ok } from "@life-console/core";
import { describe, expect, it, vi } from "vitest";

import { classifyProbeFailure, createMonitorProbeRepository } from "./monitor-probe-repository";

const configuration = { gmailAccount: "test@example.com", slackWorkspace: "work", chatworkAccount: "work", talknoteAccount: "work" };
describe("CLI の軽量接続確認", () => {
  it("Slack は auth.test を実行する CLI を workspace 指定で呼ぶ", async () => {
    const execute = vi.fn().mockResolvedValue(ok({ stdout: "{\"user\":\"test\"}", stderr: "" }));
    const probes = createMonitorProbeRepository({ execute }, configuration);
    expect(await probes.probe({ service: "slack", account: "work" })).toBe("healthy");
    expect(execute).toHaveBeenCalledWith("sl", ["auth", "status", "--output", "json", "--workspace", "work"], expect.objectContaining({ killSignal: "SIGKILL" }));
  });
  it("空の Gmail labels は成功で、Calendar の部分エラーは成功にしない", async () => {
    const execute = vi.fn().mockResolvedValueOnce(ok({ stdout: "{\"labels\":[]}", stderr: "" }))
      .mockResolvedValueOnce(ok({ stdout: "{\"calendars\":{\"primary\":{\"errors\":[{\"reason\":\"forbidden\"}]}}}", stderr: "" }));
    const probes = createMonitorProbeRepository({ execute }, configuration);
    expect(await probes.probe({ service: "gmail", account: "test@example.com" })).toBe("healthy");
    expect(await probes.probe({ service: "calendar", account: "test@example.com" })).toBe("invalid_response");
  });
  it("不明な実行失敗を認証切れと推測せず、明確な token 失効だけ分類する", async () => {
    expect(classifyProbeFailure({ code: "command_failed", summary: "失敗", cause: { stderr: "slack api auth.test: token_revoked" } }, false)).toBe("auth_required");
    expect(classifyProbeFailure({ code: "command_failed", summary: "失敗", cause: { stderr: "connection reset" } }, false)).toBe("unavailable");
    expect(classifyProbeFailure({ code: "command_start_failed", summary: "失敗" }, true)).toBe("timeout");
    const probes = createMonitorProbeRepository({ execute: async () => err({ code: "command_start_failed", summary: "失敗" }) }, configuration);
    expect(await probes.probe({ service: "talknote", account: "work" })).toBe("unavailable");
  });
});
