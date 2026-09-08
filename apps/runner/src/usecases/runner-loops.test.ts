import { afterEach, expect, it, vi } from "vitest";

import { runRunnerLoops } from "./runner-loops";

afterEach(() => vi.useRealTimers());
it("長時間 job と CLI 確認の待機中も runner を 2 分ごとに観測する", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let finishJob!: () => void;
  let finishCli!: () => void;
  const job = new Promise<void>((resolve) => {
    finishJob = resolve;
  });
  const cli = new Promise<void>((resolve) => {
    finishCli = resolve;
  });
  const observe = vi.fn(async (target) => {
    if (target.service === "slack") await cli;
  });
  const runJob = vi.fn(() => job);
  const running = runRunnerLoops({ targets: [{ service: "runner", account: "process" }, { service: "slack", account: "work" }], register: async () => true,
    observe, flush: async () => undefined, runJob, pollMilliseconds: 60_000 }, controller.signal);
  await vi.advanceTimersByTimeAsync(360_000);
  expect(observe.mock.calls.filter(([target]) => target.service === "runner")).toHaveLength(4);
  expect(observe.mock.calls.filter(([target]) => target.service === "slack")).toHaveLength(1);
  expect(runJob).toHaveBeenCalledOnce();
  controller.abort();
  finishJob();
  finishCli();
  await running;
});
it("登録 API が停止していてもローカル観測を続け、job は開始しない", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const observe = vi.fn(async () => undefined);
  const runJob = vi.fn(async () => undefined);
  const running = runRunnerLoops({ targets: [{ service: "runner", account: "process" }], register: async () => false,
    observe, flush: async () => undefined, runJob, pollMilliseconds: 60_000 }, controller.signal);
  await vi.advanceTimersByTimeAsync(240_000);
  expect(observe.mock.calls).toHaveLength(3);
  expect(observe).toHaveBeenLastCalledWith({ service: "runner", account: "process" }, false);
  expect(runJob).not.toHaveBeenCalled();
  controller.abort();
  await running;
});
