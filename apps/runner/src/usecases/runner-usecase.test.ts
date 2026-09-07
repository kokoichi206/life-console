import { err, ok } from "@life-console/core";
import type { ApiRepository, RunnerJob } from "@runner/repositories/api-repository";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runnerError } from "../errors";

import { createRunnerUsecase } from "./runner-usecase";

const claimedJob: RunnerJob = {
  id: "j1", taskId: null, repositoryId: null, kind: "conversation_reply", status: "claimed",
  payloadJson: "{}", leaseToken: "lease", cancelRequestedAt: null, provider: null,
  summary: null, errorCode: null, createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z",
};

const createRunnerTest = (heartbeatJob: ApiRepository["heartbeatJob"]) => {
  const completeJob = vi.fn().mockResolvedValue(ok(undefined));
  const execute = vi.fn().mockResolvedValue({ outcome: "succeeded", reportedExternally: false, summary: "送信済み", errorCode: null });
  const runner = createRunnerUsecase({
    api: { heartbeatRunner: vi.fn().mockResolvedValue(ok(undefined)), claimJob: vi.fn().mockResolvedValue(ok(claimedJob)),
      heartbeatJob, completeJob } as unknown as ApiRepository,
    executor: { execute },
    heartbeatMilliseconds: 60_000,
    logger: { error: vi.fn(), info: vi.fn() },
    orca: { health: vi.fn().mockResolvedValue("healthy"), launchAgent: vi.fn() },
  });
  return { runner, execute, completeJob };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("実行開始前の heartbeat", () => {
  it("lease の確認が完了するまで副作用を開始しない", async () => {
    vi.useFakeTimers();
    const { runner, execute } = createRunnerTest(() => new Promise((resolve) => {
      setTimeout(() => resolve(ok({ cancelRequested: false })), 100);
    }));
    const running = runner.runOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    await running;
    expect(execute).toHaveBeenCalledOnce();
  });

  it("開始前に中止要求があれば送信せず canceled を報告する", async () => {
    vi.useFakeTimers();
    const { runner, execute, completeJob } = createRunnerTest(async () => ok({ cancelRequested: true }));
    await runner.runOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(completeJob).toHaveBeenCalledWith("j1", "lease", "canceled", null, expect.any(String));
  });

  it("lease が失効していたら実行も完了報告もしない", async () => {
    const { runner, execute, completeJob } = createRunnerTest(async () => err(runnerError("invalid_lease", "失効")));
    await runner.runOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(completeJob).not.toHaveBeenCalled();
  });
});
