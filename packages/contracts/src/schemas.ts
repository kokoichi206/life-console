import { taskStatuses, conversationClassifications, connectorKinds, repositoryRoles, sourceScopes, jobStatuses, jobKinds, agentProviders, scheduleIntervals, scheduleCoalescingModes, mealKinds, financeEntryKinds, assetKinds, replyDraftStatuses, mealPhotoContentTypes, weightSources, orcaStatuses, jobCompletionOutcomes, agentExecutionModes, promotionTargets, sourceMappingConnectors } from "@life-console/domain";
import { z } from "zod";

const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(128);

export const taskStatusSchema = z.enum(taskStatuses);
export const conversationClassificationSchema = z.enum(conversationClassifications);
export const connectorKindSchema = z.enum(connectorKinds);
export const repositoryRoleSchema = z.enum(repositoryRoles);
export const sourceScopeSchema = z.enum(sourceScopes);
export const jobStatusSchema = z.enum(jobStatuses);
export const jobKindSchema = z.enum(jobKinds);
export const agentProviderSchema = z.enum(agentProviders);
export const scheduleIntervalSchema = z.enum(scheduleIntervals);
export const scheduleCoalescingSchema = z.enum(scheduleCoalescingModes);
export const mealKindSchema = z.enum(mealKinds);
export const financeEntryKindSchema = z.enum(financeEntryKinds);
export const assetKindSchema = z.enum(assetKinds);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(10_000).default(""),
  dueAt: isoDateTimeSchema.nullable().default(null),
  conversationId: identifierSchema.nullable().default(null),
  repositoryId: identifierSchema.nullable().default(null),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: taskStatusSchema.optional(),
});

export const classifyConversationSchema = z.object({
  classification: conversationClassificationSchema.exclude(["unprocessed"]),
});

export const listConversationsQuerySchema = z.object({
  connector: connectorKindSchema.optional(),
  classification: conversationClassificationSchema.optional(),
  period: z.enum(["24h", "3d", "7d", "all"]).default("24h"),
});

export const importedConversationSchema = z.object({
  externalMessageId: identifierSchema,
  authorLabel: z.string().trim().min(1).max(120),
  excerpt: z.string().trim().min(1).max(2_000),
  sourceUrl: z.url().nullable().default(null),
  occurredAt: isoDateTimeSchema,
  classification: conversationClassificationSchema.default("unprocessed"),
});

export const importConversationsSchema = z.object({
  connector: connectorKindSchema,
  sourceId: identifierSchema,
  sourceLabel: z.string().trim().min(1).max(240),
  watermark: z.string().min(1).max(500),
  conversations: z.array(importedConversationSchema).max(1_000),
});

export const createConnectorSyncSchema = z.object({
  connector: connectorKindSchema,
});

export const replyCalendarRequestSchema = z.object({
  from: z.iso.date(),
  through: z.iso.date(),
  dayStart: z.iso.time({ precision: -1 }),
  dayEnd: z.iso.time({ precision: -1 }),
  durationMinutes: z.union([z.literal(30), z.literal(60)]),
}).refine((input) => input.from <= input.through && Date.parse(input.through) - Date.parse(input.from) < 31 * 86_400_000,
  { message: "カレンダーの確認期間は開始日から 31 日以内にしてください。" })
  .refine((input) => input.dayStart < input.dayEnd, { message: "候補時間帯の終了は開始より後にしてください。" });
export type ReplyCalendarRequest = z.infer<typeof replyCalendarRequestSchema>;

export const createReplyDraftsSchema = z.object({
  connector: connectorKindSchema,
  period: z.enum(["24h", "3d", "7d"]).default("7d"),
  conversationId: identifierSchema.optional(),
  calendar: replyCalendarRequestSchema.optional(),
});
export const replyDraftDecisionSchema = z.object({
  status: z.enum(replyDraftStatuses),
  body: z.string().max(5_000),
  reason: z.string().min(1).max(3_000),
  replyEvidenceId: z.string().nullable(),
}).refine((input) => input.status !== "ready" || input.body.trim().length > 0, { message: "下書き本文がありません。" });
export const saveReplyDraftSchema = z.object({
  conversationId: identifierSchema,
  decision: replyDraftDecisionSchema,
  checkedAt: isoDateTimeSchema,
  jobId: identifierSchema,
  leaseToken: z.uuid(),
});
export const editReplyDraftSchema = z.object({
  body: z.string().trim().min(1).max(5_000),
  updatedAt: isoDateTimeSchema,
});
export type CreateReplyDraftsInput = z.infer<typeof createReplyDraftsSchema>;
export type ReplyDraftDecision = z.infer<typeof replyDraftDecisionSchema>;
export type SaveReplyDraftInput = z.infer<typeof saveReplyDraftSchema>;
export type EditReplyDraftInput = z.infer<typeof editReplyDraftSchema>;

export const createConversationReplySchema = z.object({
  body: z.string().trim().min(1).max(5_000),
});

export const createMealUploadSchema = z.object({
  clientId: z.uuid(),
  contentType: z.enum(mealPhotoContentTypes),
});

export const createMealSchema = z.object({
  clientId: z.uuid(),
  photoId: identifierSchema.nullable().default(null),
  memo: z.string().trim().max(2_000).default(""),
  mealKind: mealKindSchema,
  occurredAt: isoDateTimeSchema,
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
}).refine((input) => input.photoId !== null || input.memo.length > 0, {
  message: "写真またはメモのどちらかが必要です。",
  path: ["memo"],
});

export const createNutritionEstimateSchema = z.object({
  model: z.string().trim().min(1).max(120),
  analyzedAt: isoDateTimeSchema,
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  caloriesKcal: z.number().int().nonnegative(),
  proteinGrams: z.number().nonnegative(),
  fatGrams: z.number().nonnegative(),
  carbohydrateGrams: z.number().nonnegative(),
});

export const createWeightSchema = z.object({
  source: z.enum(weightSources),
  sourceKey: z.string().trim().min(1).max(240),
  weightKg: z.number().positive().max(500),
  occurredAt: isoDateTimeSchema,
});

export const weightCsvRowSchema = z.object({
  date: z.iso.date(),
  weightKg: z.number().positive().max(500),
});

export const createFinanceTransactionSchema = z.object({
  source: z.string().trim().min(1).max(80),
  sourceTransactionId: z.string().trim().min(1).max(240),
  kind: financeEntryKindSchema,
  amountYen: z.number().int().positive(),
  category: z.string().trim().min(1).max(80),
  paymentMethod: z.string().trim().min(1).max(80),
  payee: z.string().trim().max(160).default(""),
  occurredAt: isoDateTimeSchema,
});

export const createFinanceAdjustmentSchema = z.object({
  transactionId: identifierSchema,
  amountDeltaYen: z.number().int(),
  reason: z.string().trim().min(1).max(500),
});

export const createAssetBalanceSchema = z.object({
  accountName: z.string().trim().min(1).max(120),
  assetKind: assetKindSchema,
  amountYen: z.number().int(),
  occurredAt: isoDateTimeSchema,
});

export const createNoteSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  occurredAt: isoDateTimeSchema,
});

export const registerRunnerSchema = z.object({
  runnerId: identifierSchema,
  name: z.string().trim().min(1).max(120),
  tokenExpiresAt: isoDateTimeSchema.nullable(),
  orcaStatus: z.enum(orcaStatuses),
});

export const runnerHeartbeatSchema = z.object({
  runnerId: identifierSchema,
  orcaStatus: z.enum(orcaStatuses),
});

export const claimJobSchema = z.object({
  runnerId: identifierSchema,
});

export const jobHeartbeatSchema = z.object({
  runnerId: identifierSchema,
  leaseToken: z.uuid(),
  progressSummary: z.string().trim().max(240).nullable().default(null),
  waitingForUser: z.boolean().default(false),
});

export const completeJobSchema = z.object({
  runnerId: identifierSchema,
  leaseToken: z.uuid(),
  outcome: z.enum(jobCompletionOutcomes),
  errorCode: z.string().trim().max(80).nullable().default(null),
  summary: z.string().trim().max(240),
});

export const agentReportSchema = completeJobSchema.omit({
  runnerId: true,
  leaseToken: true,
});

export const createAgentJobSchema = z.object({
  taskId: identifierSchema,
  repositoryId: identifierSchema,
  provider: agentProviderSchema,
  executionMode: z.enum(agentExecutionModes),
});

export const createRepositorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  localPath: z.string().trim().min(1).max(1_024),
});

export const syncRepositoriesSchema = z.object({
  repositories: z.array(createRepositorySchema).max(1_000),
});

export const upsertSourceRepositoryMappingSchema = z.object({
  connector: z.enum(sourceMappingConnectors),
  sourceScope: sourceScopeSchema,
  sourceId: identifierSchema,
  repositoryId: identifierSchema,
});

export const assignRepositorySchema = z.object({
  repositoryId: identifierSchema,
  role: repositoryRoleSchema,
});

export const promoteTaskSchema = z.object({
  target: z.enum(promotionTargets),
  repositoryId: identifierSchema,
});

export const weightObsidianExportPayloadSchema = z.object({
  dataDirectory: z.string().trim().min(1).max(512).refine((path) =>
    !path.includes("\\") && !/\p{Cc}/u.test(path)
    && path.split("/").every((segment) => !["", ".", "..", ".obsidian"].includes(segment)),
  "vault 内の体重ディレクトリの相対パスを指定してください。"),
}).strict();

const scheduleFields = {
  name: z.string().trim().min(1).max(120),
  interval: scheduleIntervalSchema,
  timezone: z.string().trim().min(1).max(80),
  nextRunAt: isoDateTimeSchema,
  coalescing: scheduleCoalescingSchema,
  deadlineSeconds: z.number().int().positive().max(604_800),
};

export const createScheduleSchema = z.discriminatedUnion("jobKind", [
  z.object({
    ...scheduleFields,
    jobKind: jobKindSchema.exclude(["reply_drafts", "weight_obsidian_export"]),
    payload: z.object({}).strict().optional(),
  }),
  z.object({
    ...scheduleFields,
    jobKind: z.literal("weight_obsidian_export"),
    payload: weightObsidianExportPayloadSchema,
  }),
]);

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateMealInput = z.infer<typeof createMealSchema>;
export type CreateWeightInput = z.infer<typeof createWeightSchema>;
export type CreateFinanceTransactionInput = z.infer<typeof createFinanceTransactionSchema>;
export type CreateFinanceAdjustmentInput = z.infer<typeof createFinanceAdjustmentSchema>;
export type CreateAssetBalanceInput = z.infer<typeof createAssetBalanceSchema>;
export type RegisterRunnerInput = z.infer<typeof registerRunnerSchema>;
export type JobHeartbeatInput = z.infer<typeof jobHeartbeatSchema>;
export type CompleteJobInput = z.infer<typeof completeJobSchema>;
export type CreateAgentJobInput = z.infer<typeof createAgentJobSchema>;
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type ImportConversationsInput = z.infer<typeof importConversationsSchema>;
export type ListConversationsInput = z.infer<typeof listConversationsQuerySchema>;
export type CreateConnectorSyncInput = z.infer<typeof createConnectorSyncSchema>;
export type CreateConversationReplyInput = z.infer<typeof createConversationReplySchema>;
export type SyncRepositoriesInput = z.infer<typeof syncRepositoriesSchema>;
export type UpsertSourceRepositoryMappingInput = z.infer<typeof upsertSourceRepositoryMappingSchema>;
export type { JobKind, JobStatus } from "@life-console/domain";

export const weightGoalSchema = z.object({
  startWeightKg: z.number().min(0.1).max(500),
  targetWeightKg: z.number().min(0.1).max(500),
  targetDate: z.iso.date().nullable(),
});
export type WeightGoal = z.infer<typeof weightGoalSchema>;

export const mealPeriodQuerySchema = z.union([
  z.object({ from: z.iso.date(), to: z.iso.date() }).refine((value) => value.from <= value.to),
  z.object({}).strict(),
]);
