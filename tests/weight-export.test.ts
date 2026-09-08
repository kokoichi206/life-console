import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "../apps/api/src/app";
import type { RunnerConfig } from "../apps/runner/src/config";
import { createApiRepository } from "../apps/runner/src/repositories/api-repository";
import { fileWeightHistoryRepository } from "../apps/runner/src/repositories/weight-history-repository";
import { createJobExecutorUsecase } from "../apps/runner/src/usecases/job-executor-usecase";
import { createRunnerUsecase } from "../apps/runner/src/usecases/runner-usecase";
import { createWeightObsidianExportUsecase } from "../apps/runner/src/usecases/weight-obsidian-export-usecase";

import { createJobStorage } from "./support/d1-storage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("体重の定期書き出しの API と runner", () => {
  it("書き出し API は runner 認証を要求する", async () => {
    const response = await app.request("/api/v1/runner/weights/export", {}, { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker" });
    expect(response.status).toBe(401);
  });

  it("HTTP で登録した定期設定から runner が既存の体重グラフを更新し、成功を DB に報告する", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const { database, repository, binding } = createJobStorage();
    const vaultPath = await mkdtemp(join(tmpdir(), "life-console-export-"));
    try {
      await mkdir(join(vaultPath, "data/weight"), { recursive: true });
      await writeFile(join(vaultPath, "data/weight/weight-trend.csv"), "date,weight_kg,ma7_kg,window_samples\n2020-01-01,80.0,80.00,1\n");
      const now = new Date().toISOString();
      const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding };
      const created = await app.request("/api/v1/schedules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "体重書き出し", jobKind: "weight_obsidian_export", interval: "hourly", timezone: "Asia/Tokyo",
          nextRunAt: now, coalescing: "skip_if_pending", deadlineSeconds: 7200, payload: { dataDirectory: "data/weight" } }),
      }, environment);
      expect(created.status).toBe(200);
      await repository.createWeight("measurement", { source: "manual", sourceKey: "measurement", weightKg: 70.25,
        occurredAt: "2026-09-08T00:15:00Z" }, now);
      expect(await repository.enqueueDueSchedules(now)).toMatchObject({ ok: true, value: 1 });
      vi.stubGlobal("fetch", (url: string, init: RequestInit) => app.request(url, init, environment));
      const api = createApiRepository({ apiUrl: "http://localhost", runnerId: "runner-test", runnerName: "Test runner",
        runnerToken: "local-runner-token" } as RunnerConfig);
      const weightExport = createWeightObsidianExportUsecase({ api, history: fileWeightHistoryRepository, vaultPath });
      const executor = createJobExecutorUsecase({ weightExport } as Parameters<typeof createJobExecutorUsecase>[0]);
      const runner = createRunnerUsecase({ api, executor, heartbeatMilliseconds: 60_000,
        logger: { info: vi.fn(), error: vi.fn() } });
      expect(await runner.register()).toBe(true);
      await runner.runOnce();
      expect(database.prepare("SELECT status, error_code FROM jobs").get()).toMatchObject({ status: "succeeded", error_code: null });
      expect(await readFile(join(vaultPath, "data/weight/weight-trend.csv"), "utf8")).toContain("2026-09-08,70.25,70.25,1");
    } finally {
      database.close();
      await rm(vaultPath, { recursive: true, force: true });
    }
  });
});
