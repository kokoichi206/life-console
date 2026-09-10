import type { TaskStatus, SourceMappingConnector, SourceScope, ReplyDraftStatus } from "@life-console/domain";
export type Task = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
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

export type ReplyDraft = {
  readonly conversationId: string;
  readonly connector: string;
  readonly authorLabel: string;
  readonly excerpt: string;
  readonly sourceUrl: string | null;
  readonly occurredAt: string;
  readonly status: ReplyDraftStatus;
  readonly body: string;
  readonly reason: string;
  readonly replyEvidenceId: string | null;
  readonly checkedAt: string;
  readonly editedAt: string | null;
  readonly updatedAt: string;
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
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly tags: ReadonlyArray<string>;
};

export type Repository = {
  readonly id: string;
  readonly name: string;
};

export type SourceRepositoryMapping = {
  readonly connector: SourceMappingConnector;
  readonly sourceScope: SourceScope;
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly repositoryId: string;
  readonly repositoryName: string;
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
