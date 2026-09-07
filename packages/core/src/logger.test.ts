import { describe, expect, it, vi } from "vitest";

import { createLogger } from "./logger";

describe("共通 logger", () => {
  it("サービス名とイベントを構造化し、未知の本文や token を出さない", () => {
    const sink = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const entry = { event: "job_failed", errorCode: "upstream_error", timestamp: "2026-09-08T00:00:00Z", token: "private-token", detail: "private-message" };
    createLogger("runner").error(entry);
    expect(JSON.parse(sink.mock.calls[0]![0] as string)).toEqual({ service: "runner", level: "error", event: "job_failed", errorCode: "upstream_error", timestamp: entry.timestamp });
    sink.mockRestore();
  });
});
