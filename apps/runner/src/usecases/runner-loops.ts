import type { MonitorTarget } from "@life-console/contracts";

const waitUntilNext = (milliseconds: number, signal: AbortSignal): Promise<void> => new Promise((resolve) => {
  const finish = () => {
    clearTimeout(timer);
    signal.removeEventListener("abort", finish);
    resolve();
  };
  const timer = setTimeout(finish, milliseconds);
  signal.addEventListener("abort", finish, { once: true });
  if (signal.aborted) finish();
});
export const runRunnerLoops = async (dependencies: {
  readonly targets: ReadonlyArray<MonitorTarget>;
  readonly register: () => Promise<boolean>;
  readonly observe: (target: MonitorTarget, live: boolean) => Promise<void>;
  readonly flush: () => Promise<void>;
  readonly runJob: () => Promise<void>;
  readonly pollMilliseconds: number;
}, signal: AbortSignal): Promise<void> => {
  let registered = false;
  const repeat = async (operation: () => Promise<void>, milliseconds: number) => {
    while (!signal.aborted) {
      const started = Date.now();
      await operation();
      if (!signal.aborted) await waitUntilNext(Math.max(0, milliseconds - (Date.now() - started)), signal);
    }
  };
  await Promise.all([
    repeat(async () => {
      if (!registered) registered = await dependencies.register();
    }, 60_000),
    ...dependencies.targets.map((target) => repeat(() => dependencies.observe(target, registered), 120_000)),
    repeat(async () => { if (registered) await dependencies.flush(); }, 60_000),
    repeat(async () => { if (registered) await dependencies.runJob(); }, dependencies.pollMilliseconds),
  ]);
};
