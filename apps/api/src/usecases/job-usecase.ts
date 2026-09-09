import type { AgentJobContext, Job, LifeConsoleRepository, RunnerHealth } from "@api/repositories/life-console-repository";
import type { CompleteJobInput, CreateAgentJobInput, CreateConnectorSyncInput, CreateConversationReplyInput, CreateScheduleInput, JobHeartbeatInput, RegisterRunnerInput } from "@life-console/contracts";
import type { Result } from "@life-console/core";
import { err } from "@life-console/core";
import type { OrcaStatus, JobCompletionOutcome } from "@life-console/domain";

import type { AppError } from "../shared/app-error";
import { appError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

const LEASE_MILLISECONDS = 180_000;

export interface JobUsecase {
  list(): Promise<Result<ReadonlyArray<Job>, AppError>>;
  listRunners(): Promise<Result<ReadonlyArray<RunnerHealth>, AppError>>;
  registerRunner(input: RegisterRunnerInput): Promise<Result<void, AppError>>;
  heartbeatRunner(runnerId: string, orcaStatus: OrcaStatus): Promise<Result<void, AppError>>;
  claim(runnerId: string): Promise<Result<Job | null, AppError>>;
  heartbeat(jobId: string, input: JobHeartbeatInput): Promise<Result<{ readonly cancelRequested: boolean }, AppError>>;
  complete(jobId: string, input: CompleteJobInput): Promise<Result<void, AppError>>;
  report(jobId: string, leaseToken: string, input: { readonly outcome: JobCompletionOutcome; readonly errorCode: string | null; readonly summary: string }): Promise<Result<void, AppError>>;
  validateLease(jobId: string, leaseToken: string): Promise<Result<boolean, AppError>>;
  cancel(jobId: string): Promise<Result<void, AppError>>;
  createAgentJob(input: CreateAgentJobInput): Promise<Result<Job, AppError>>;
  createConnectorSyncJob(input: CreateConnectorSyncInput): Promise<Result<Job, AppError>>;
  createRepositorySyncJob(): Promise<Result<Job, AppError>>;
  createConversationReplyJob(conversationId: string, input: CreateConversationReplyInput): Promise<Result<Job, AppError>>;
  createPromotionJob(taskId: string, repositoryId: string, target: string): Promise<Result<Job, AppError>>;
  createSchedule(input: CreateScheduleInput): Promise<Result<void, AppError>>;
  getAgentJobContext(taskId: string, repositoryId: string): Promise<Result<AgentJobContext, AppError>>;
  runScheduledMaintenance(): Promise<Result<number, AppError>>;
}

export const createJobUsecase = (
  repository: LifeConsoleRepository,
  clock: Clock,
  idGenerator: IdGenerator,
): JobUsecase => ({
  list: () => repository.listJobs(),
  listRunners: () => repository.listRunners(),
  registerRunner: (input) => repository.registerRunner(input, clock.now().toISOString()),
  heartbeatRunner: (runnerId, orcaStatus) => repository.heartbeatRunner(
    runnerId,
    orcaStatus,
    clock.now().toISOString(),
  ),
  claim(runnerId) {
    const now = clock.now();
    return repository.claimJob(
      runnerId,
      idGenerator.create(),
      new Date(now.getTime() + LEASE_MILLISECONDS).toISOString(),
      now.toISOString(),
    );
  },
  heartbeat(jobId, input) {
    const now = clock.now();
    return repository.heartbeatJob(
      jobId,
      input,
      new Date(now.getTime() + LEASE_MILLISECONDS).toISOString(),
      now.toISOString(),
    );
  },
  complete: (jobId, input) => repository.completeJob(jobId, input, clock.now().toISOString()),
  report: (jobId, leaseToken, input) => repository.completeJobByCapability(
    jobId,
    leaseToken,
    input.outcome,
    input.errorCode,
    input.summary,
    clock.now().toISOString(),
  ),
  validateLease: (jobId, leaseToken) => repository.validateLease(jobId, leaseToken),
  cancel: (jobId) => repository.requestJobCancel(jobId, clock.now().toISOString()),
  createAgentJob(input) {
    const now = clock.now().toISOString();
    const id = idGenerator.create();
    return repository.createJob({
      id,
      kind: "agent",
      idempotencyKey: `agent:${id}`,
      payloadJson: JSON.stringify(input),
      now,
      taskId: input.taskId,
      repositoryId: input.repositoryId,
      provider: input.provider,
    });
  },
  createConnectorSyncJob(input) {
    const now = clock.now().toISOString();
    const id = idGenerator.create();
    return repository.createJob({
      id,
      kind: `${input.connector}_sync`,
      idempotencyKey: `connector-sync:${id}`,
      payloadJson: "{}",
      now,
    });
  },
  createRepositorySyncJob() {
    const now = clock.now().toISOString();
    const id = idGenerator.create();
    return repository.createJob({
      id,
      kind: "repository_scan",
      idempotencyKey: `repository-scan:${id}`,
      payloadJson: "{}",
      now,
    });
  },
  async createConversationReplyJob(conversationId, input) {
    const conversation = await repository.getConversation(conversationId);
    if (!conversation.ok) return conversation;
    if (conversation.value.connector !== "slack" && conversation.value.connector !== "chatwork") {
      return err(appError.validation("このサービスへの送信は元のアプリで行ってください。"));
    }
    const now = clock.now().toISOString();
    const id = idGenerator.create();
    return repository.createJob({
      id,
      kind: "conversation_reply",
      idempotencyKey: `conversation-reply:${id}`,
      payloadJson: JSON.stringify({
        body: input.body,
        connector: conversation.value.connector,
        conversationId,
        externalMessageId: conversation.value.externalMessageId,
        sourceId: conversation.value.sourceId,
      }),
      now,
    });
  },
  createPromotionJob(taskId, repositoryId, target) {
    const now = clock.now().toISOString();
    const id = idGenerator.create();
    return repository.createJob({
      id,
      kind: "github_promotion",
      idempotencyKey: `github-promotion:${id}`,
      payloadJson: JSON.stringify({ taskId, repositoryId, target }),
      now,
      taskId,
      repositoryId,
    });
  },
  createSchedule: (input) => repository.createSchedule(
    idGenerator.create(),
    input,
    clock.now().toISOString(),
  ),
  getAgentJobContext: (taskId, repositoryId) => repository.getAgentJobContext(taskId, repositoryId),
  async runScheduledMaintenance() {
    const now = clock.now().toISOString();
    const repaired = await repository.markExpiredAndLostJobs(now);
    if (!repaired.ok) return repaired;
    return repository.enqueueDueSchedules(now);
  },
});
