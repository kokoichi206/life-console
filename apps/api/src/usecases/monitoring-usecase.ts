import type { MonitoringRepository } from "@api/repositories/monitoring-repository";
import type { PushSubscriptionRepository } from "@api/repositories/push-subscription-repository";
import type { WebPushRepository } from "@api/repositories/web-push-repository";
import { monitorState, type MonitorObservation, type MonitorStatus, type RegisterMonitorsInput } from "@life-console/contracts";
import { ok } from "@life-console/core";

import type { Clock } from "../shared/clock";

const monitoringDecision = (target: MonitorStatus, targets: ReadonlyArray<MonitorStatus>, now: number) => {
  const state = monitorState(target, now);
  if (state === "healthy") return { decision: "recover" as const, reason: "正常" };
  if (state === "unavailable") {
    const runner = targets.find((candidate) => candidate.runnerId === target.runnerId && candidate.service === "runner");
    if (target.service !== "runner" && runner !== undefined && monitorState(runner, now) === "unavailable") return { decision: "hold" as const, reason: "runner の応答待ち" };
    return { decision: "open" as const, reason: "5 分以上応答がありません。" };
  }
  if (target.outcome === "auth_required" || target.outcome === "permission_denied" || target.outcome === "not_configured") return { decision: "open" as const, reason: "認証・権限・接続設定を確認してください。" };
  if (target.failures >= 2) return { decision: "open" as const, reason: "接続確認が連続して失敗しています。" };
  return { decision: "hold" as const, reason: "確認中" };
};
export const createMonitoringUsecase = (repository: MonitoringRepository, subscriptions: PushSubscriptionRepository, push: WebPushRepository, clock: Clock, configured: boolean, expectedRunnerIds: ReadonlyArray<string> = []) => {
  const evaluate = async () => {
    const targets = await repository.list();
    if (!targets.ok) return targets;
    const now = clock.now();
    for (const target of targets.value) {
      const decision = monitoringDecision(target, targets.value, now.getTime());
      const saved = await repository.decide(target, decision.decision, decision.reason, now.toISOString());
      if (!saved.ok) return saved;
    }
    return ok(undefined);
  };
  return {
    register: (input: RegisterMonitorsInput) => repository.register(input, clock.now().toISOString()),
    async record(observation: MonitorObservation, historical: boolean) {
      const saved = await repository.record(observation, historical, clock.now().toISOString());
      if (!saved.ok || historical) return saved;
      return evaluate();
    },
    async summary() {
      const targets = await repository.list();
      if (!targets.ok) return targets;
      const counts = await repository.deliveryCounts();
      return counts.ok ? ok({ targets: targets.value, ...counts.value }) : counts;
    },
    history: repository.history,
    async maintain() {
      const expected = await repository.expectRunners(expectedRunnerIds, clock.now().toISOString());
      if (!expected.ok) return expected;
      const evaluated = await evaluate();
      if (!evaluated.ok) return evaluated;
      if (!configured) return repository.maintenanceFinished(clock.now().toISOString());
      for (let index = 0; index < 20; index += 1) {
        const claimed = await repository.claim(clock.now().toISOString());
        if (!claimed.ok) return claimed;
        if (claimed.value === null) break;
        const delivery = claimed.value;
        const subscription = await subscriptions.find(delivery.endpoint);
        if (!subscription.ok) return subscription;
        const sent = subscription.value === null
          ? ok("expired" as const)
          : await push.send(subscription.value, {
              title: "Life Console の死活監視", body: delivery.body, tag: `monitor-${delivery.id}`,
            });
        const finished = await repository.finish(delivery, sent.ok ? sent.value : "failed", clock.now().toISOString());
        if (!finished.ok) return finished;
      }
      return repository.maintenanceFinished(clock.now().toISOString());
    },
  };
};
