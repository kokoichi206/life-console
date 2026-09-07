import type {
  CompleteJobInput,
  CreateAssetBalanceInput,
  CreateFinanceAdjustmentInput,
  CreateFinanceTransactionInput,
  CreateMealInput,
  CreateScheduleInput,
  CreateTaskInput,
  CreateWeightInput,
  JobHeartbeatInput,
  RegisterRunnerInput,
  Result,
  CreateReplyDraftsInput,
  SaveReplyDraftInput,
  EditReplyDraftInput,
  ReplyDraft,
  SyncRepositoriesInput,
  UpsertSourceRepositoryMappingInput,
  UpdateTaskInput,
} from "@life-console/contracts";

import type { AppError } from "../shared/app-error";

export type Task = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly completedAt: string | null;
  readonly conversationId: string | null;
  readonly repositoryId: string | null;
  readonly repositoryName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type Conversation = {
  readonly id: string;
  readonly connector: string;
  readonly sourceId: string;
  readonly externalMessageId: string;
  readonly authorLabel: string;
  readonly excerpt: string;
  readonly sourceUrl: string | null;
  readonly classification: string;
  readonly occurredAt: string;
};

export type WeightPoint = {
  readonly id: string;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly source: string;
  readonly weightKg: number;
};

export type FinanceSummary = {
  readonly incomeYen: number;
  readonly expenseYen: number;
  readonly netCashflowYen: number;
  readonly netWorthYen: number;
  readonly byCategory: ReadonlyArray<{ readonly category: string; readonly amountYen: number }>;
  readonly byPaymentMethod: ReadonlyArray<{ readonly paymentMethod: string; readonly amountYen: number }>;
  readonly assetAllocation: ReadonlyArray<{ readonly assetKind: string; readonly amountYen: number }>;
  readonly transactions: ReadonlyArray<{
    readonly id: string;
    readonly kind: string;
    readonly amountYen: number;
    readonly adjustedAmountYen: number;
    readonly category: string;
    readonly paymentMethod: string;
    readonly payee: string;
    readonly occurredAt: string;
  }>;
  readonly adjustments: ReadonlyArray<{
    readonly id: string;
    readonly transactionId: string;
    readonly amountDeltaYen: number;
    readonly reason: string;
    readonly createdAt: string;
  }>;
  readonly assetHistory: ReadonlyArray<{
    readonly occurredAt: string;
    readonly netWorthYen: number;
  }>;
};

export type Job = {
  readonly id: string;
  readonly taskId: string | null;
  readonly repositoryId: string | null;
  readonly kind: string;
  readonly status: string;
  readonly payloadJson: string;
  readonly leaseToken: string | null;
  readonly cancelRequestedAt: string | null;
  readonly provider: string | null;
  readonly summary: string | null;
  readonly errorCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type RunnerHealth = {
  readonly id: string;
  readonly name: string;
  readonly lastHeartbeatAt: string;
  readonly tokenExpiresAt: string | null;
  readonly orcaStatus: string;
  readonly lastErrorCode: string | null;
};

export type ConnectorHealth = {
  readonly connector: string;
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly watermark: string | null;
  readonly lastSuccessAt: string | null;
  readonly nextRunAt: string | null;
  readonly lastErrorCode: string | null;
};

export type Meal = {
  readonly id: string;
  readonly photoId: string | null;
  readonly memo: string;
  readonly mealKind: string;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly tags: ReadonlyArray<string>;
};

export type Repository = {
  readonly id: string;
  readonly name: string;
};

export type SourceRepositoryMapping = {
  readonly connector: "slack" | "chatwork";
  readonly sourceScope: "channel" | "room";
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly repositoryId: string;
  readonly repositoryName: string;
};

export type AgentJobContext = {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly taskDescription: string;
  readonly repositoryId: string;
  readonly repositoryName: string;
  readonly repositoryPath: string;
};

export type Dashboard = {
  readonly todayTasks: ReadonlyArray<Task>;
  readonly conversations: ReadonlyArray<Conversation>;
  readonly runners: ReadonlyArray<RunnerHealth>;
  readonly connectors: ReadonlyArray<ConnectorHealth>;
  readonly recentJobs: ReadonlyArray<Job>;
  readonly delayedJobCount: number;
  readonly finance: FinanceSummary;
  readonly weights: ReadonlyArray<WeightPoint & {
    readonly movingAverage7DaysKg: number;
    readonly movingAverageWindowSamples: number;
  }>;
};

export type NewConversation = {
  readonly id: string;
  readonly connector: string;
  readonly sourceId: string;
  readonly externalMessageId: string;
  readonly authorLabel: string;
  readonly excerpt: string;
  readonly sourceUrl: string | null;
  readonly occurredAt: string;
  readonly classification: string;
};

export type ConversationListFilter = {
  readonly connector: "slack" | "chatwork" | "gmail" | "talknote" | null;
  readonly classification: string | null;
  readonly since: string | null;
};

export interface LifeConsoleRepository {
  listReplyDrafts(): Promise<Result<ReadonlyArray<ReplyDraft>, AppError>>;
  listReplyCandidates(input: CreateReplyDraftsInput, since: string): Promise<Result<ReadonlyArray<Conversation>, AppError>>;
  saveReplyDraft(input: SaveReplyDraftInput, now: string): Promise<Result<void, AppError>>;
  editReplyDraft(id: string, input: EditReplyDraftInput, now: string): Promise<Result<void, AppError>>;
  listTasks(): Promise<Result<ReadonlyArray<Task>, AppError>>;
  createTask(id: string, input: CreateTaskInput, now: string): Promise<Result<Task, AppError>>;
  updateTask(id: string, input: UpdateTaskInput, now: string): Promise<Result<Task, AppError>>;
  listConversations(filter: ConversationListFilter): Promise<Result<ReadonlyArray<Conversation>, AppError>>;
  getConversation(id: string): Promise<Result<Conversation, AppError>>;
  getSourceRepositoryMapping(connector: string, sourceId: string): Promise<Result<SourceRepositoryMapping | null, AppError>>;
  classifyConversation(id: string, classification: string, now: string): Promise<Result<void, AppError>>;
  createTaskFromConversation(id: string, input: CreateTaskInput, conversationId: string, now: string): Promise<Result<Task, AppError>>;
  saveConversations(conversations: ReadonlyArray<NewConversation>, sourceLabel: string, watermark: string, now: string): Promise<Result<number, AppError>>;
  listMeals(): Promise<Result<ReadonlyArray<Meal>, AppError>>;
  createMeal(id: string, input: CreateMealInput, now: string): Promise<Result<Meal, AppError>>;
  createMealPhoto(input: { readonly id: string; readonly clientId: string; readonly contentType: string; readonly objectKey: string; readonly tokenHash: string; readonly expiresAt: string; readonly now: string }): Promise<Result<void, AppError>>;
  getMealPhoto(id: string): Promise<Result<{ readonly contentType: string; readonly objectKey: string; readonly tokenHash: string; readonly expiresAt: string; readonly uploadedAt: string | null }, AppError>>;
  markMealPhotoUploaded(id: string, now: string): Promise<Result<void, AppError>>;
  listWeights(): Promise<Result<ReadonlyArray<WeightPoint>, AppError>>;
  createWeight(id: string, input: CreateWeightInput, now: string, sourceJobId?: string): Promise<Result<void, AppError>>;
  getFinanceSummary(): Promise<Result<FinanceSummary, AppError>>;
  createFinanceTransaction(id: string, input: CreateFinanceTransactionInput, now: string, sourceJobId?: string): Promise<Result<void, AppError>>;
  createFinanceAdjustment(id: string, input: CreateFinanceAdjustmentInput, now: string): Promise<Result<void, AppError>>;
  createAssetBalance(id: string, input: CreateAssetBalanceInput, now: string): Promise<Result<void, AppError>>;
  createNote(id: string, body: string, occurredAt: string, now: string): Promise<Result<void, AppError>>;
  listRepositories(): Promise<Result<ReadonlyArray<Repository>, AppError>>;
  listSourceRepositoryMappings(): Promise<Result<ReadonlyArray<SourceRepositoryMapping>, AppError>>;
  getAgentJobContext(taskId: string, repositoryId: string): Promise<Result<AgentJobContext, AppError>>;
  createRepository(id: string, name: string, localPath: string, now: string): Promise<Result<void, AppError>>;
  syncRepositories(input: SyncRepositoriesInput, ids: ReadonlyArray<string>, now: string): Promise<Result<number, AppError>>;
  upsertSourceRepositoryMapping(input: UpsertSourceRepositoryMappingInput, now: string): Promise<Result<void, AppError>>;
  assignTaskRepository(taskId: string, repositoryId: string, role: string, now: string): Promise<Result<void, AppError>>;
  registerRunner(input: RegisterRunnerInput, now: string): Promise<Result<void, AppError>>;
  heartbeatRunner(runnerId: string, orcaStatus: string, now: string): Promise<Result<void, AppError>>;
  listRunners(): Promise<Result<ReadonlyArray<RunnerHealth>, AppError>>;
  listConnectorHealth(): Promise<Result<ReadonlyArray<ConnectorHealth>, AppError>>;
  listJobs(): Promise<Result<ReadonlyArray<Job>, AppError>>;
  createJob(input: { readonly id: string; readonly kind: string; readonly idempotencyKey: string; readonly payloadJson: string; readonly now: string; readonly deadlineAt?: string; readonly scheduleId?: string; readonly taskId?: string; readonly repositoryId?: string; readonly provider?: string }): Promise<Result<Job, AppError>>;
  claimJob(runnerId: string, leaseToken: string, leaseExpiresAt: string, now: string): Promise<Result<Job | null, AppError>>;
  heartbeatJob(jobId: string, input: JobHeartbeatInput, leaseExpiresAt: string, now: string): Promise<Result<{ readonly cancelRequested: boolean }, AppError>>;
  completeJob(jobId: string, input: CompleteJobInput, now: string): Promise<Result<void, AppError>>;
  completeJobByCapability(jobId: string, leaseToken: string, outcome: string, errorCode: string | null, summary: string, now: string): Promise<Result<void, AppError>>;
  requestJobCancel(jobId: string, now: string): Promise<Result<void, AppError>>;
  validateLease(jobId: string, leaseToken: string): Promise<Result<boolean, AppError>>;
  createSchedule(id: string, input: CreateScheduleInput, now: string): Promise<Result<void, AppError>>;
  enqueueDueSchedules(now: string): Promise<Result<number, AppError>>;
  markExpiredAndLostJobs(now: string): Promise<Result<void, AppError>>;
  getDashboard(): Promise<Result<Dashboard, AppError>>;
}
