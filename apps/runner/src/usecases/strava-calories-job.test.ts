import { err, ok } from "@life-console/core";
import type { RunnerJob } from "@runner/repositories/api-repository";
import { describe, expect, it, vi } from "vitest";

import { createJobExecutorUsecase } from "./job-executor-usecase";

const job = { id: "job", kind: "strava_calories_sync", payloadJson: JSON.stringify({ from: "2026-09-07", to: "2026-09-13" }), leaseToken: "lease" } as RunnerJob;
const fetchResult = (overrides: Partial<{ fetched: number; unavailable: number; deleted: number; failed: number; remaining: number; retryAfterSeconds: number | null; dailyLimitReached: boolean }>) => ({
  fetched: 0, unavailable: 0, deleted: 0, failed: 0, remaining: 0, retryAfterSeconds: null, dailyLimitReached: false, ...overrides,
});
const reconcileResult = (overrides: Partial<{ nextPage: number | null; registered: number; deleted: number; retryAfterSeconds: number | null; dailyLimitReached: boolean }>) => ({
  nextPage: null, registered: 0, deleted: 0, retryAfterSeconds: null, dailyLimitReached: false, ...overrides,
});
const executor = (api: Record<string, unknown>) => createJobExecutorUsecase({ api } as unknown as Parameters<typeof createJobExecutorUsecase>[0]);

describe("消費カロリーの同期ジョブ", () => {
  it("reconcile を空ページまで、fetch を取得待ちがなくなるまで繰り返して件数を報告する", async () => {
    const reconcileStravaCalories = vi.fn()
      .mockResolvedValueOnce(ok(reconcileResult({ nextPage: 2, registered: 3 })))
      .mockResolvedValueOnce(ok(reconcileResult({ deleted: 1 })));
    const fetchStravaCalories = vi.fn()
      .mockResolvedValueOnce(ok(fetchResult({ fetched: 2, remaining: 1 })))
      .mockResolvedValueOnce(ok(fetchResult({ fetched: 0, unavailable: 1, deleted: 1, remaining: 0 })));
    const result = await executor({ reconcileStravaCalories, fetchStravaCalories }).execute(job, new AbortController().signal);
    expect(result).toMatchObject({ outcome: "succeeded", errorCode: null, summary: "取得 2 件・値なし 1 件・削除 2 件。" });
    expect(reconcileStravaCalories.mock.calls.map(([input]) => input)).toEqual([
      { jobId: "job", leaseToken: "lease", from: "2026-09-07", to: "2026-09-13", page: 1 },
      { jobId: "job", leaseToken: "lease", from: "2026-09-07", to: "2026-09-13", page: 2 },
    ]);
    expect(fetchStravaCalories).toHaveBeenCalledTimes(2);
  });

  it("一覧のページングが 15 分の上限に触れたら待ってから次のページへ進む", async () => {
    vi.useFakeTimers();
    try {
      const reconcileStravaCalories = vi.fn()
        .mockResolvedValueOnce(ok(reconcileResult({ nextPage: 2, registered: 100, retryAfterSeconds: 300 })))
        .mockResolvedValueOnce(ok(reconcileResult({ registered: 1 })));
      const fetchStravaCalories = vi.fn().mockResolvedValue(ok(fetchResult({ fetched: 101 })));
      const execution = executor({ reconcileStravaCalories, fetchStravaCalories }).execute(job, new AbortController().signal);
      await vi.waitFor(() => expect(reconcileStravaCalories).toHaveBeenCalledTimes(1));
      expect(fetchStravaCalories).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(300_000);
      expect(await execution).toMatchObject({ outcome: "succeeded" });
      expect(reconcileStravaCalories.mock.calls.map(([input]) => input.page)).toEqual([1, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("一覧のページング中に 1 日の上限へ達したら詳細を取得せずに終える", async () => {
    const fetchStravaCalories = vi.fn();
    const result = await executor({
      reconcileStravaCalories: vi.fn().mockResolvedValue(ok(reconcileResult({ nextPage: 2, registered: 100, dailyLimitReached: true }))),
      fetchStravaCalories,
    }).execute(job, new AbortController().signal);
    expect(result).toMatchObject({ outcome: "succeeded", errorCode: null });
    expect(result.summary).toContain("1 日の上限に達したため、一覧の同期を中断しました。");
    expect(fetchStravaCalories).not.toHaveBeenCalled();
  });

  it("1 日の上限で中断しても異常にせず、残り件数と再開方法を報告する", async () => {
    const result = await executor({
      reconcileStravaCalories: vi.fn().mockResolvedValue(ok(reconcileResult({ registered: 50 }))),
      fetchStravaCalories: vi.fn().mockResolvedValue(ok(fetchResult({ fetched: 10, remaining: 40, dailyLimitReached: true }))),
    }).execute(job, new AbortController().signal);
    expect(result).toMatchObject({ outcome: "succeeded", errorCode: null });
    expect(result.summary).toBe("取得 10 件・値なし 0 件・削除 0 件。1 日の上限に達したため中断しました。残り 40 件は次回の表示か『運動を更新』で再開します。");
  });

  it("15 分の上限では待ってから続け、待機中の中止を失敗にしない", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const fetchStravaCalories = vi.fn().mockResolvedValue(ok(fetchResult({ fetched: 1, remaining: 5, retryAfterSeconds: 300 })));
      const execution = executor({ reconcileStravaCalories: vi.fn().mockResolvedValue(ok(reconcileResult({ registered: 6 }))), fetchStravaCalories }).execute(job, controller.signal);
      await vi.waitFor(() => expect(fetchStravaCalories).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(300_000);
      await vi.waitFor(() => expect(fetchStravaCalories).toHaveBeenCalledTimes(2));
      controller.abort();
      await vi.advanceTimersByTimeAsync(300_000);
      expect(await execution).toMatchObject({ outcome: "canceled", errorCode: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it("進捗のない失敗が続いたら成功で隠さず失敗件数を報告する", async () => {
    const result = await executor({
      reconcileStravaCalories: vi.fn().mockResolvedValue(ok(reconcileResult({ registered: 3 }))),
      fetchStravaCalories: vi.fn()
        .mockResolvedValueOnce(ok(fetchResult({ fetched: 1, failed: 2, remaining: 2 })))
        .mockResolvedValueOnce(ok(fetchResult({ failed: 2, remaining: 2 }))),
    }).execute(job, new AbortController().signal);
    expect(result).toMatchObject({ outcome: "failed", errorCode: "strava_calories_partial", summary: "取得 1 件・値なし 0 件・削除 0 件。2 件の取得に失敗しました。" });
  });

  it("reconcile の失敗を成功にせず、lease token がなければ実行しない", async () => {
    const reconcileStravaCalories = vi.fn().mockResolvedValue(err({ code: "invalid_lease", summary: "job の lease が無効です。" }));
    expect(await executor({ reconcileStravaCalories }).execute(job, new AbortController().signal)).toMatchObject({ outcome: "failed", errorCode: "invalid_lease" });
    expect(await executor({ reconcileStravaCalories }).execute({ ...job, leaseToken: null }, new AbortController().signal)).toMatchObject({ outcome: "failed", errorCode: "missing_lease_token" });
    expect(reconcileStravaCalories).toHaveBeenCalledTimes(1);
  });

  it("期間のない payload を実行しない", async () => {
    const reconcileStravaCalories = vi.fn();
    const result = await executor({ reconcileStravaCalories }).execute({ ...job, payloadJson: "{}" }, new AbortController().signal);
    expect(result).toMatchObject({ outcome: "failed", errorCode: "invalid_job_payload" });
    expect(reconcileStravaCalories).not.toHaveBeenCalled();
  });
});
