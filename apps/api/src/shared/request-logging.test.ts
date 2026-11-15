import { err, ok } from "@life-console/core";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../app";
import { D1LifeConsoleRepository } from "../repositories/d1-life-console-repository";

import type { AppErrorCode } from "./app-error";
import { requestLogging, type RequestLogVariables } from "./request-logging";

const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker" };
type LogEntry = { event: string; request_id: string; level: string; errorCode?: string; status_code: number; method: string; route: string; duration_ms: number };

describe("HTTP のリクエストログ", () => {
  const entries: LogEntry[] = [];
  beforeEach(() => {
    entries.length = 0;
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((line: string) => {
        const entry = JSON.parse(line) as LogEntry;
        expect(entry.level).toBe(level);
        entries.push(entry);
      });
    }
  });
  afterEach(() => vi.restoreAllMocks());

  const expectRequestLogs = (response: Response, status: number, errorCode?: string) => {
    expect(response.status).toBe(status);
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(entries.filter((entry) => entry.event === "request_completed")).toEqual([
      expect.objectContaining({ request_id: requestId, status_code: status, level: "info", duration_ms: expect.any(Number) }),
    ]);
    const failures = entries.filter((entry) => entry.event === "request_failed");
    expect(failures).toHaveLength(status >= 400 ? 1 : 0);
    if (status >= 400) {
      expect(failures[0]).toMatchObject({ request_id: requestId, status_code: status, errorCode, level: status >= 500 ? "error" : "warn" });
    }
    expect(entries).toHaveLength(status >= 400 ? 2 : 1);
  };

  it("成功時も完了ログを出し、外部から指定された ID は採用しない", async () => {
    const response = await app.request("/api/v1/health?token=secret-query", {
      headers: { "X-Request-Id": "external-id", "cf-ray": "external-ray", "Authorization": "Bearer secret-token", "Cookie": "session=secret-cookie" },
    }, environment);
    expectRequestLogs(response, 200);
    expect(entries[0]).toMatchObject({ method: "GET", route: "/api/v1/health" });
    expect(JSON.stringify(entries)).not.toMatch(/secret|external-/u);
  });

  it.each<[AppErrorCode, number]>([
    ["validation_error", 400], ["unauthorized", 401], ["forbidden", 403], ["invalid_lease", 403],
    ["not_found", 404], ["conflict", 409], ["skipped_precondition", 412], ["rate_limited", 429],
    ["storage_error", 500], ["upstream_error", 502],
  ])("Result の %s を HTTP %i と同じ区分で 1 件記録する", async (code, status) => {
    vi.spyOn(D1LifeConsoleRepository.prototype, "listTasks").mockResolvedValue(err({ code, message: "private-message", cause: new Error("private-cause") }));
    const response = await app.request("/api/v1/tasks", {}, environment);
    expectRequestLogs(response, status, code);
    expect(JSON.stringify(entries)).not.toContain("private-");
  });

  it("認証による早期終了も記録する", async () => {
    const response = await app.request("/api/v1/runner/runners", {}, environment);
    expectRequestLogs(response, 401, "unauthorized");
  });

  it.each(["{}", "{invalid-json"])("入力検証の失敗も 400 として記録する: %s", async (body) => {
    const response = await app.request("/api/v1/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body }, environment);
    expectRequestLogs(response, 400, "http_error");
  });

  it("未知の URL でも 404 を記録し、生のパスを出さない", async () => {
    const response = await app.request("/api/v1/private-path", {}, environment);
    expectRequestLogs(response, 404, "http_error");
    expect(JSON.stringify(entries)).not.toContain("private-path");
  });

  it("環境検証の例外にも ID を付けて 500 を 1 件記録する", async () => {
    const response = await app.request("/api/v1/health", {}, { ...environment, APP_ENV: "private-invalid" });
    expectRequestLogs(response, 500, "internal_error");
    expect(JSON.stringify(entries)).not.toContain("private-invalid");
  });

  it("非同期処理の未処理例外も 500 を 1 件記録する", async () => {
    vi.spyOn(D1LifeConsoleRepository.prototype, "listTasks").mockRejectedValue(new Error("private-cause"));
    const response = await app.request("/api/v1/tasks", {}, environment);
    expectRequestLogs(response, 500, "internal_error");
    expect(JSON.stringify(entries)).not.toContain("private-cause");
  });

  it("共有ルートは token をルート定義に置き換える", async () => {
    const response = await app.request(`/api/v1/share/${"a".repeat(64)}/weights`, {}, environment);
    expectRequestLogs(response, 404, "not_found");
    expect(entries[0]?.route).toBe("/api/v1/share/:token/weights");
    expect(JSON.stringify(entries)).not.toContain("a".repeat(64));
  });

  it("同時リクエストの非同期処理でも context の logger が同じ ID を引き継ぐ", async () => {
    let releaseFirst!: () => void;
    const firstWaiting = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const loggingApp = new Hono<{ Variables: RequestLogVariables }>();
    loggingApp.use("*", requestLogging);
    loggingApp.get("/:name", async (context) => {
      if (context.req.param("name") === "first") await firstWaiting;
      context.get("logger").info({ event: context.req.param("name") });
      return context.json({ request_id: context.get("request_id") });
    });
    const firstPending = loggingApp.request("/first");
    const second = await loggingApp.request("/second");
    releaseFirst();
    const first = await firstPending;
    const firstId = first.headers.get("x-request-id");
    const secondId = second.headers.get("x-request-id");
    expect(firstId).not.toBe(secondId);
    expect(await first.json()).toEqual({ request_id: firstId });
    expect(await second.json()).toEqual({ request_id: secondId });
    expect(entries.map(({ event, request_id }) => ({ event, request_id }))).toEqual([
      { event: "second", request_id: secondId }, { event: "request_completed", request_id: secondId },
      { event: "first", request_id: firstId }, { event: "request_completed", request_id: firstId },
    ]);
  });

  it("正常な DB 応答ではエラーログを出さない", async () => {
    vi.spyOn(D1LifeConsoleRepository.prototype, "listTasks").mockResolvedValue(ok([]));
    expectRequestLogs(await app.request("/api/v1/tasks", {}, environment), 200);
  });
});
