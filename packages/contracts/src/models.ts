import type { AgentProvider, AssetKind, ConnectorKind, ConversationClassification, FinanceEntryKind, JobKind, JobStatus, OrcaStatus, ReplyDraftStatus, SourceMappingConnector, SourceScope, TaskArea, TaskStatus, WeightSource } from "@life-console/domain";
export type Task = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly area: TaskArea;
  readonly scheduledAt: string | null;
  readonly sourceUrl: string | null;
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
  readonly connector: ConnectorKind;
  readonly sourceId: string;
  readonly externalMessageId: string;
  readonly authorLabel: string;
  readonly excerpt: string;
  readonly sourceUrl: string | null;
  readonly classification: ConversationClassification;
  readonly occurredAt: string;
};

export type ReplyDraft = {
  readonly conversationId: string;
  readonly connector: ConnectorKind;
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
  readonly source: WeightSource;
  readonly weightKg: number;
  readonly bodyFatPercent: number | null;
};

export type AbstinenceGoal = {
  readonly name: string;
  readonly startedAt: string;
  readonly targetDays: number;
  readonly targetDate: string | null;
};

export type AbstinenceEvent = {
  readonly id: string;
  readonly occurredAt: string;
  readonly durationMinutes: number | null;
  readonly memo: string;
  readonly recordedAt: string;
};

export type AbstinenceOverview = {
  readonly goal: AbstinenceGoal | null;
  readonly events: ReadonlyArray<AbstinenceEvent>;
  readonly totalEventDurationMinutes: number;
  readonly currentStreakDays: number;
  readonly longestStreakDays: number;
};

export type FinanceSummary = {
  readonly incomeYen: number;
  readonly expenseYen: number;
  readonly netCashflowYen: number;
  readonly netWorthYen: number;
  readonly byCategory: ReadonlyArray<{ readonly category: string; readonly amountYen: number }>;
  readonly byPaymentMethod: ReadonlyArray<{ readonly paymentMethod: string; readonly amountYen: number }>;
  readonly assetAllocation: ReadonlyArray<{ readonly assetKind: AssetKind; readonly amountYen: number }>;
  readonly transactions: ReadonlyArray<{
    readonly id: string;
    readonly kind: FinanceEntryKind;
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
  readonly kind: JobKind;
  readonly status: JobStatus;
  readonly payloadJson: string;
  readonly leaseToken: string | null;
  readonly cancelRequestedAt: string | null;
  readonly provider: AgentProvider | null;
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
  readonly orcaStatus: OrcaStatus;
  readonly lastErrorCode: string | null;
};

export type ConnectorHealth = {
  readonly connector: ConnectorKind;
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

export type MealGalleryPage = {
  readonly meals: ReadonlyArray<Meal>;
  readonly nextTo: string | null;
};

export type MealDayCount = {
  readonly occurredAt: string;
  readonly count: number;
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
