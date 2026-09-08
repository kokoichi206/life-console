import type { LocalLogger } from "@runner/logger";
import type { ApiRepository, RunnerJob } from "@runner/repositories/api-repository";

import type { JobExecutorUsecase } from "./job-executor-usecase";

type Dependencies = {
  readonly api: ApiRepository;
  readonly executor: JobExecutorUsecase;
  readonly heartbeatMilliseconds: number;
  readonly logger: LocalLogger;
};

export interface RunnerUsecase {
  register(): Promise<boolean>;
  runOnce(): Promise<void>;
}

export const createRunnerUsecase = (dependencies: Dependencies): RunnerUsecase => {
  const runClaimedJob = async (job: RunnerJob): Promise<void> => {
    if (job.leaseToken === null) {
      dependencies.logger.error({
        event: "claimed_job_missing_lease",
        errorCode: "missing_lease_token",
        jobId: job.id,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const leaseToken = job.leaseToken;
    const abortController = new AbortController();
    let heartbeatActive = true;
    let leaseLost = false;
    const waitingForUser = job.kind === "agent" || job.kind === "github_promotion";

    const heartbeat = async (): Promise<boolean> => {
      if (!heartbeatActive) return false;
      const result = await dependencies.api.heartbeatJob(
        job.id,
        leaseToken,
        waitingForUser,
        waitingForUser ? "agent の明示的な完了報告を待っています。" : "実行中",
      );
      if (!result.ok) {
        leaseLost = result.error.code === "invalid_lease";
        dependencies.logger.error({
          event: "job_heartbeat_failed",
          errorCode: result.error.code,
          jobId: job.id,
          timestamp: new Date().toISOString(),
        });
        abortController.abort();
        return false;
      }
      if (result.value.cancelRequested) {
        abortController.abort();
        return true;
      }
      setTimeout(() => {
        void heartbeat();
      }, dependencies.heartbeatMilliseconds);
      return true;
    };

    if (!await heartbeat()) {
      heartbeatActive = false;
      return;
    }
    const execution = abortController.signal.aborted
      ? { outcome: "canceled" as const, errorCode: null, summary: "実行前に中止しました。", reportedExternally: false }
      : await dependencies.executor.execute(job, abortController.signal);
    heartbeatActive = false;
    if (execution.reportedExternally || leaseLost) return;
    const completed = await dependencies.api.completeJob(
      job.id,
      leaseToken,
      execution.outcome,
      execution.errorCode,
      execution.summary,
    );
    if (!completed.ok) {
      dependencies.logger.error({
        event: "job_completion_failed",
        errorCode: completed.error.code,
        jobId: job.id,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    dependencies.logger.info({
      event: "job_completed",
      jobId: job.id,
      timestamp: new Date().toISOString(),
    });
  };

  return {
    async register() {
      const registered = await dependencies.api.registerRunner("unknown");
      if (!registered.ok) {
        dependencies.logger.error({
          event: "runner_registration_failed",
          errorCode: registered.error.code,
          timestamp: new Date().toISOString(),
        });
        return false;
      }
      return true;
    },
    async runOnce() {
      const claimed = await dependencies.api.claimJob();
      if (!claimed.ok) {
        dependencies.logger.error({
          event: "job_claim_failed",
          errorCode: claimed.error.code,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      if (claimed.value === null) return;
      await runClaimedJob(claimed.value);
    },
  };
};
