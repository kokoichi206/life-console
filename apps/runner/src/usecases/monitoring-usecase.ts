import { randomUUID } from "node:crypto";

import type { MonitorTarget } from "@life-console/contracts";
import type { ApiRepository } from "@runner/repositories/api-repository";
import type { MonitorProbeRepository } from "@runner/repositories/monitor-probe-repository";
import type { MonitorQueueRepository } from "@runner/repositories/monitor-queue-repository";

import type { LocalLogger } from "../logger";

export const createRunnerMonitoringUsecase = (api: ApiRepository, probes: MonitorProbeRepository, queue: MonitorQueueRepository, runnerId: string, logger: LocalLogger) => {
  const reportError = (code: string) => logger.error({ event: "monitoring_failed", runnerId, errorCode: code, timestamp: new Date().toISOString() });
  return {
    async observe(target: MonitorTarget, live = true) {
      const outcome = await probes.probe(target);
      const observation = { ...target, id: randomUUID(), runnerId, outcome, observedAt: new Date().toISOString() };
      const saved = await queue.save(observation);
      if (!saved.ok) {
        reportError(saved.error.code);
        return;
      }
      if (!live) return;
      const sent = await api.reportObservation(observation, false);
      if (!sent.ok) {
        reportError(sent.error.code);
        return;
      }
      const removed = await queue.remove(observation.id);
      if (!removed.ok) reportError(removed.error.code);
    },
    async flush() {
      // ライブ送信中の観測を後送として先に受理させない。
      const pending = await queue.pending(new Date(Date.now() - 60_000).toISOString());
      if (!pending.ok) {
        reportError(pending.error.code);
        return;
      }
      for (const observation of pending.value) {
        const sent = await api.reportObservation(observation, true);
        if (!sent.ok) {
          reportError(sent.error.code);
          return;
        }
        const removed = await queue.remove(observation.id);
        if (!removed.ok) {
          reportError(removed.error.code);
          return;
        }
      }
    },
  };
};
