import type { WeightGoal, CompleteJobInput, CreateAssetBalanceInput, CreateFinanceAdjustmentInput, CreateFinanceTransactionInput, CreateMealInput, CreateScheduleInput, CreateTaskInput, CreateWeightInput, JobHeartbeatInput, RegisterRunnerInput, CreateReplyDraftsInput, SaveReplyDraftInput, EditReplyDraftInput, ReplyDraft, SyncRepositoriesInput, UpsertSourceRepositoryMappingInput, UpdateTaskInput } from "@life-console/contracts";
import { calculate7DayMovingAverage } from "@life-console/contracts";
import type { Result } from "@life-console/core";
import { err, ok, safeTry } from "@life-console/core";
import { assetBalances, connectorStates, conversations, financeAdjustments, financeTransactions, jobHeartbeatObservations, jobs, mealPhotos, meals, notes, repositories, replyDrafts, runners, schedules, sourceRepositoryMappings, systemState, taskRepositories, tasks, weightGoal, weights } from "@life-console/db";
import { and, asc, count, desc, eq, exists, gt, gte, inArray, isNotNull, isNull, lte, notExists, notInArray, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { alias, type SQLiteInsertValue } from "drizzle-orm/sqlite-core";

import type { AppError } from "../shared/app-error";
import { appError } from "../shared/app-error";

import type {
  AgentJobContext,
  ConnectorHealth,
  Conversation,
  ConversationListFilter,
  Dashboard,
  FinanceSummary,
  Job,
  LifeConsoleRepository,
  Meal,
  NewConversation,
  Repository,
  RunnerHealth,
  SourceRepositoryMapping,
  Task,
  WeightPoint,
} from "./life-console-repository";

const taskColumns = {
  id: tasks.id, title: tasks.title, description: tasks.description, status: tasks.status,
  dueAt: tasks.dueAt, completedAt: tasks.completedAt, conversationId: tasks.conversationId,
  repositoryId: repositories.id, repositoryName: repositories.name, createdAt: tasks.createdAt, updatedAt: tasks.updatedAt,
};
const jobColumns = {
  id: jobs.id, taskId: jobs.taskId, repositoryId: jobs.repositoryId, kind: jobs.kind, status: jobs.status,
  payloadJson: jobs.payloadJson, leaseToken: jobs.leaseToken, cancelRequestedAt: jobs.cancelRequestedAt,
  provider: jobs.provider, summary: jobs.summary, errorCode: jobs.errorCode, createdAt: jobs.createdAt, updatedAt: jobs.updatedAt,
};
const conversationColumns = {
  id: conversations.id, connector: conversations.connector, sourceId: conversations.sourceId,
  externalMessageId: conversations.externalMessageId, authorLabel: conversations.authorLabel,
  excerpt: conversations.excerpt, sourceUrl: conversations.sourceUrl, classification: conversations.classification, occurredAt: conversations.occurredAt,
};
const mealColumns = {
  id: meals.id, photoId: meals.photoId, memo: meals.memo, mealKind: meals.mealKind,
  occurredAt: meals.occurredAt, recordedAt: meals.recordedAt, tagsJson: meals.tagsJson,
};
const sourceMappingColumns = {
  connector: sourceRepositoryMappings.connector, sourceScope: sourceRepositoryMappings.sourceScope,
  sourceId: sourceRepositoryMappings.sourceId,
  sourceLabel: sql<string>`coalesce(${connectorStates.sourceLabel}, ${sourceRepositoryMappings.sourceId})`,
  repositoryId: repositories.id, repositoryName: repositories.name,
};
const activeJobStatuses = ["claimed", "running", "waiting_for_user"];
const pendingJobStatuses = ["queued", ...activeJobStatuses];

type QueuedJobInput = Pick<SQLiteInsertValue<typeof jobs>, "id" | "kind" | "idempotencyKey" | "payloadJson" | "createdAt" | "updatedAt" | "scheduleId" | "taskId" | "repositoryId" | "provider" | "deadlineAt">;
const queuedJobSelection = (input: QueuedJobInput) => ({
  id: sql`${input.id}`.as("id"), scheduleId: sql`${input.scheduleId ?? null}`.as("scheduleId"), taskId: sql`${input.taskId ?? null}`.as("taskId"),
  repositoryId: sql`${input.repositoryId ?? null}`.as("repositoryId"), kind: sql`${input.kind}`.as("kind"), status: sql`'queued'`.as("status"),
  idempotencyKey: sql`${input.idempotencyKey}`.as("idempotencyKey"), payloadJson: sql`${input.payloadJson}`.as("payloadJson"),
  runnerId: sql`null`.as("runnerId"), leaseToken: sql`null`.as("leaseToken"), leaseExpiresAt: sql`null`.as("leaseExpiresAt"), lastHeartbeatAt: sql`null`.as("lastHeartbeatAt"),
  progressUpdatedAt: sql`null`.as("progressUpdatedAt"), cancelRequestedAt: sql`null`.as("cancelRequestedAt"), deadlineAt: sql`${input.deadlineAt ?? null}`.as("deadlineAt"),
  attempt: sql`0`.as("attempt"), provider: sql`${input.provider ?? null}`.as("provider"), summary: sql`null`.as("summary"), errorCode: sql`null`.as("errorCode"),
  startedAt: sql`null`.as("startedAt"), finishedAt: sql`null`.as("finishedAt"), createdAt: sql`${input.createdAt}`.as("createdAt"), updatedAt: sql`${input.updatedAt}`.as("updatedAt"),
});

export class D1LifeConsoleRepository implements LifeConsoleRepository {
  readonly #database: DrizzleD1Database;

  constructor(database: D1Database) {
    this.#database = drizzle(database);
  }

  async listReplyDrafts(): Promise<Result<ReadonlyArray<ReplyDraft>, AppError>> {
    const result = await safeTry(() => this.#database.select({
      conversationId: replyDrafts.conversationId, connector: conversations.connector, authorLabel: conversations.authorLabel,
      excerpt: conversations.excerpt, sourceUrl: conversations.sourceUrl, occurredAt: conversations.occurredAt,
      status: replyDrafts.status, body: replyDrafts.body, reason: replyDrafts.reason, replyEvidenceId: replyDrafts.replyEvidenceId,
      checkedAt: replyDrafts.checkedAt, editedAt: replyDrafts.editedAt, updatedAt: replyDrafts.updatedAt,
    }).from(replyDrafts).innerJoin(conversations, eq(conversations.id, replyDrafts.conversationId))
      .orderBy(desc(conversations.occurredAt)).all());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value);
  }

  async listReplyCandidates(input: CreateReplyDraftsInput, since: string): Promise<Result<ReadonlyArray<Conversation>, AppError>> {
    const result = await safeTry(() => this.#database.select(conversationColumns).from(conversations)
      .where(and(eq(conversations.connector, input.connector), gte(conversations.occurredAt, since)))
      .orderBy(desc(conversations.occurredAt)).all());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value);
  }

  async saveReplyDraft(input: SaveReplyDraftInput, now: string): Promise<Result<void, AppError>> {
    const selection = this.#database.select({
      conversationId: sql`${input.conversationId}`.as("conversationId"), status: sql`${input.decision.status}`.as("status"), body: sql`${input.decision.body}`.as("body"),
      reason: sql`${input.decision.reason}`.as("reason"), replyEvidenceId: sql`${input.decision.replyEvidenceId}`.as("replyEvidenceId"),
      checkedAt: sql`${input.checkedAt}`.as("checkedAt"), editedAt: sql`null`.as("editedAt"), updatedAt: sql`${now}`.as("updatedAt"),
    }).from(jobs).where(and(eq(jobs.id, input.jobId), eq(jobs.leaseToken, input.leaseToken), eq(jobs.kind, "reply_drafts"),
      inArray(jobs.status, ["claimed", "running"]), gt(jobs.leaseExpiresAt, now), isNull(jobs.cancelRequestedAt)));
    const result = await safeTry(() => this.#database.insert(replyDrafts).select(selection).onConflictDoUpdate({
      target: replyDrafts.conversationId, set: {
        status: input.decision.status, body: sql`case when ${replyDrafts.editedAt} is not null then ${replyDrafts.body} else ${input.decision.body} end`,
        reason: input.decision.reason, replyEvidenceId: input.decision.replyEvidenceId, checkedAt: input.checkedAt, updatedAt: now,
      }, setWhere: lte(replyDrafts.checkedAt, input.checkedAt),
    }).run());
    if (!result.ok) return err(appError.storage(result.error));
    return result.value.meta.changes > 0 ? ok(undefined) : err(appError.conflict("下書きの保存権限が失効したか、新しい確認結果があります。"));
  }

  async editReplyDraft(id: string, input: EditReplyDraftInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.update(replyDrafts).set({ body: input.body, editedAt: now, updatedAt: now })
      .where(and(eq(replyDrafts.conversationId, id), eq(replyDrafts.updatedAt, input.updatedAt), inArray(replyDrafts.status, ["ready", "needs_review"]))).run());
    if (!result.ok) return err(appError.storage(result.error));
    return result.value.meta.changes > 0 ? ok(undefined) : err(appError.conflict("下書きが更新されています。再読み込みして確認してください。"));
  }

  async listTasks(): Promise<Result<ReadonlyArray<Task>, AppError>> {
    const result = await safeTry(() => this.#database.select(taskColumns).from(tasks)
      .leftJoin(taskRepositories, and(eq(taskRepositories.taskId, tasks.id), eq(taskRepositories.role, "work")))
      .leftJoin(repositories, and(eq(repositories.id, taskRepositories.repositoryId), isNull(repositories.archivedAt))).orderBy(sql`case ${tasks.status} when 'doing' then 0 when 'todo' then 1 when 'inbox' then 2 else 3 end`,
        isNull(tasks.dueAt), asc(tasks.dueAt), desc(tasks.createdAt)).all());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value);
  }

  async createTask(id: string, input: CreateTaskInput, now: string): Promise<Result<Task, AppError>> {
    const inserted = await safeTry(() => this.#database.insert(tasks).values({ id, title: input.title,
      description: input.description, status: "todo", dueAt: input.dueAt, completedAt: null, conversationId: input.conversationId, createdAt: now, updatedAt: now,
    }).run());
    if (!inserted.ok) return err(appError.storage(inserted.error));
    if (input.repositoryId !== null) {
      const assigned = await this.assignTaskRepository(id, input.repositoryId, "work", now);
      if (!assigned.ok) return assigned;
    }
    return this.getTask(id);
  }

  async updateTask(id: string, input: UpdateTaskInput, now: string): Promise<Result<Task, AppError>> {
    const current = await this.getTask(id);
    if (!current.ok) return current;
    const task = current.value;
    const status = input.status ?? task.status;
    const completedAt = status === "done" ? task.completedAt ?? now : null;
    const updated = await safeTry(() => this.#database.update(tasks).set({
      title: input.title ?? task.title, description: input.description ?? task.description, status,
      dueAt: input.dueAt === undefined ? task.dueAt : input.dueAt, completedAt,
      conversationId: input.conversationId === undefined ? task.conversationId : input.conversationId, updatedAt: now,
    }).where(eq(tasks.id, id)).run());
    if (!updated.ok) return err(appError.storage(updated.error));
    if (input.repositoryId !== undefined && input.repositoryId !== task.repositoryId) {
      const cleared = await safeTry(() => this.#database.delete(taskRepositories).where(and(eq(taskRepositories.taskId, id), eq(taskRepositories.role, "work"))).run());
      if (!cleared.ok) return err(appError.storage(cleared.error));
      if (input.repositoryId !== null) {
        const assigned = await this.assignTaskRepository(id, input.repositoryId, "work", now);
        if (!assigned.ok) return assigned;
      }
    }
    return this.getTask(id);
  }

  async listConversations(filter: ConversationListFilter): Promise<Result<ReadonlyArray<Conversation>, AppError>> {
    const result = await safeTry(() => this.#database.select(conversationColumns).from(conversations).where(and(
      filter.connector === null ? undefined : eq(conversations.connector, filter.connector),
      filter.classification === null ? undefined : eq(conversations.classification, filter.classification),
      filter.since === null ? undefined : gte(conversations.occurredAt, filter.since),
    )).orderBy(desc(conversations.occurredAt)).all());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value);
  }

  async getConversation(id: string): Promise<Result<Conversation, AppError>> {
    const result = await safeTry(() => this.#database.select(conversationColumns).from(conversations).where(eq(conversations.id, id)).get());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value === undefined) return err(appError.notFound("会話が見つかりません。"));
    return ok(result.value);
  }

  async getSourceRepositoryMapping(connector: string, sourceId: string): Promise<Result<SourceRepositoryMapping | null, AppError>> {
    const result = await safeTry(() => this.#database.select(sourceMappingColumns).from(sourceRepositoryMappings)
      .innerJoin(repositories, and(eq(repositories.id, sourceRepositoryMappings.repositoryId), isNull(repositories.archivedAt)))
      .leftJoin(connectorStates, and(eq(connectorStates.connector, sourceRepositoryMappings.connector), eq(connectorStates.sourceId, sourceRepositoryMappings.sourceId))).where(and(eq(sourceRepositoryMappings.connector, sql`${connector}`), eq(sourceRepositoryMappings.sourceId, sourceId), eq(sourceRepositoryMappings.role, "work"))).limit(1).get());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value ?? null);
  }

  async classifyConversation(id: string, classification: string, _now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.update(conversations).set({ classification }).where(eq(conversations.id, id)).run());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value.meta.changes === 0) return err(appError.notFound("会話が見つかりません。"));
    return ok(undefined);
  }

  async createTaskFromConversation(id: string, input: CreateTaskInput, conversationId: string, now: string): Promise<Result<Task, AppError>> {
    const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [this.#database.insert(tasks).values({ id, title: input.title,
      description: input.description, status: "todo", dueAt: input.dueAt, completedAt: null, conversationId, createdAt: now, updatedAt: now,
    })];
    if (input.repositoryId !== null) statements.push(this.#database.insert(taskRepositories).values({ taskId: id, repositoryId: input.repositoryId, role: "work", createdAt: now }));
    statements.push(this.#database.update(conversations).set({ classification: "task_candidate" }).where(eq(conversations.id, conversationId)));
    const result = await safeTry(() => this.#database.batch(statements));
    if (!result.ok) return err(appError.storage(result.error));
    return this.getTask(id);
  }

  async saveConversations(incomingConversations: ReadonlyArray<NewConversation>, sourceLabel: string, watermark: string, now: string): Promise<Result<number, AppError>> {
    const state = incomingConversations[0];
    if (state === undefined) return ok(0);
    const statements = incomingConversations.map((conversation) => this.#database.insert(conversations).values({ ...conversation, recordedAt: now })
      .onConflictDoUpdate({ target: [conversations.connector, conversations.sourceId, conversations.externalMessageId], set: {
        authorLabel: conversation.authorLabel, excerpt: conversation.excerpt, sourceUrl: conversation.sourceUrl, occurredAt: conversation.occurredAt,
      } }));
    const nextRunAt = sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${now}, '+1 hour')`;
    const connectorState = { sourceLabel, watermark, lastSuccessAt: now, nextRunAt, lastErrorCode: null, updatedAt: now };
    const result = await safeTry(() => this.#database.batch([
      statements[0]!, ...statements.slice(1),
      this.#database.insert(connectorStates).values({ connector: state.connector, sourceId: state.sourceId, ...connectorState })
        .onConflictDoUpdate({ target: [connectorStates.connector, connectorStates.sourceId], set: connectorState }),
    ]));
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.slice(0, -1).reduce((total, entry) => total + entry.meta.changes, 0));
  }

  async listMeals(period?: { readonly from: string; readonly to: string }): Promise<Result<ReadonlyArray<Meal>, AppError>> {
    const query = this.#database.select(mealColumns).from(meals).where(and(isNull(meals.deletedAt),
      period === undefined
        ? undefined
        : and(
            gte(sql`julianday(${meals.occurredAt})`, sql`julianday(${`${period.from}T00:00:00+09:00`})`),
            sql`julianday(${meals.occurredAt}) < julianday(${`${period.to}T00:00:00+09:00`}, '+1 day')`,
          ),
    )).orderBy(desc(meals.occurredAt));
    const result = await safeTry(() => (period === undefined ? query.limit(100) : query).all());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.map((row) => ({ ...row, tags: JSON.parse(row.tagsJson) as ReadonlyArray<string> })));
  }

  async createMealAndQueueNutrition(id: string, input: CreateMealInput, now: string): Promise<Result<Meal, AppError>> {
    const initialJobId = sql`'nutrition-initial:' || ${meals.id}`;
    const initialJob = this.#database.insert(jobs).select(this.#database.select(queuedJobSelection({
      id: initialJobId, kind: "nutrition_analysis", idempotencyKey: initialJobId,
      payloadJson: sql`json_object('mealId', ${meals.id})`, createdAt: now, updatedAt: now,
    })).from(meals).where(and(eq(meals.clientId, input.clientId), isNotNull(meals.photoId), isNull(meals.deletedAt)))).onConflictDoNothing();
    const inserted = await safeTry(() => this.#database.batch([
      this.#database.insert(meals).values({ id, clientId: input.clientId, photoId: input.photoId, memo: input.memo,
        mealKind: input.mealKind, occurredAt: input.occurredAt, recordedAt: now, tagsJson: JSON.stringify(input.tags), deletedAt: null,
      }).onConflictDoNothing(), initialJob,
    ]));
    if (!inserted.ok) return err(appError.storage(inserted.error));
    const selected = await safeTry(() => this.#database.select(mealColumns).from(meals).where(eq(meals.clientId, input.clientId)).get());
    if (!selected.ok) return err(appError.storage(selected.error));
    if (selected.value === undefined) return err(appError.storage("meal insert returned no row"));
    return ok({ ...selected.value, tags: JSON.parse(selected.value.tagsJson) as ReadonlyArray<string> });
  }

  async createMealPhoto(input: { readonly id: string; readonly clientId: string; readonly contentType: string; readonly objectKey: string; readonly tokenHash: string; readonly expiresAt: string; readonly now: string }): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.insert(mealPhotos).values({ id: input.id, clientId: input.clientId, objectKey: input.objectKey,
      contentType: input.contentType, uploadTokenHash: input.tokenHash, uploadExpiresAt: input.expiresAt, uploadedAt: null, createdAt: input.now,
    }).onConflictDoNothing().run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async getMealPhoto(id: string): Promise<Result<{ readonly contentType: string; readonly objectKey: string; readonly tokenHash: string; readonly expiresAt: string; readonly uploadedAt: string | null }, AppError>> {
    const result = await safeTry(() => this.#database.select({ contentType: mealPhotos.contentType, objectKey: mealPhotos.objectKey,
      tokenHash: mealPhotos.uploadTokenHash, expiresAt: mealPhotos.uploadExpiresAt, uploadedAt: mealPhotos.uploadedAt,
    }).from(mealPhotos).where(eq(mealPhotos.id, id)).get());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value === undefined) return err(appError.notFound("写真アップロードが見つかりません。"));
    return ok(result.value);
  }

  async markMealPhotoUploaded(id: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.update(mealPhotos).set({ uploadedAt: now }).where(eq(mealPhotos.id, id)).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async getWeightGoal(): Promise<Result<WeightGoal | null, AppError>> {
    const result = await safeTry(() => this.#database.select({ startWeightKg: sql<number>`${weightGoal.startWeightGrams} / 1000.0`.as("startWeightKg"),
      targetWeightKg: sql<number>`${weightGoal.targetWeightGrams} / 1000.0`.as("targetWeightKg"), targetDate: weightGoal.targetDate,
    }).from(weightGoal).where(eq(weightGoal.id, 1)).get());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value ?? null);
  }

  async saveWeightGoal(input: WeightGoal | null): Promise<Result<void, AppError>> {
    const changes = input === null ? null : { startWeightGrams: Math.round(input.startWeightKg * 1000), targetWeightGrams: Math.round(input.targetWeightKg * 1000), targetDate: input.targetDate };
    const result = await safeTry(() => changes === null
      ? this.#database.delete(weightGoal).where(eq(weightGoal.id, 1)).run()
      : this.#database.insert(weightGoal).values({ id: 1, ...changes }).onConflictDoUpdate({ target: weightGoal.id, set: changes }).run());
    return result.ok ? ok(undefined) : err(appError.storage(result.error));
  }

  listWeights(): Promise<Result<ReadonlyArray<WeightPoint>, AppError>> {
    return this.#readWeights();
  }

  listWeightsForExport(): Promise<Result<ReadonlyArray<WeightPoint>, AppError>> {
    return this.#readWeights();
  }

  async #readWeights(): Promise<Result<ReadonlyArray<WeightPoint>, AppError>> {
    const result = await safeTry(() => this.#database.select({ id: weights.id, source: weights.source, weightGrams: weights.weightGrams,
      occurredAt: weights.occurredAt, recordedAt: weights.recordedAt,
    }).from(weights).where(isNull(weights.deletedAt)).orderBy(sql`julianday(${weights.occurredAt})`, asc(weights.id)).all());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.map(({ weightGrams, ...row }) => ({ ...row, weightKg: weightGrams / 1000 })));
  }

  async createWeight(id: string, input: CreateWeightInput, now: string, sourceJobId?: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.insert(weights).values({ id, source: input.source, sourceKey: input.sourceKey,
      weightGrams: Math.round(input.weightKg * 1000), occurredAt: input.occurredAt, recordedAt: now, sourceJobId: sourceJobId ?? null,
    }).onConflictDoNothing().run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async getFinanceSummary(): Promise<Result<FinanceSummary, AppError>> {
    const adjustmentsByTransaction = this.#database.select({ transactionId: financeAdjustments.transactionId,
      delta: sql<number>`sum(${financeAdjustments.amountDeltaYen})`.as("delta"),
    }).from(financeAdjustments).groupBy(financeAdjustments.transactionId).as("adjustments_by_transaction");
    const adjustedAmount = sql<number>`${financeTransactions.amountYen} + coalesce(${adjustmentsByTransaction.delta}, 0)`;
    const latestBalance = alias(assetBalances, "latest_balance");
    const result = await safeTry(() => this.#database.batch([
      this.#database.select({
        incomeYen: sql<number>`coalesce(sum(case when ${financeTransactions.kind} = 'income' then ${adjustedAmount} else 0 end), 0)`.as("incomeYen"),
        expenseYen: sql<number>`coalesce(sum(case when ${financeTransactions.kind} = 'expense' then ${adjustedAmount} else 0 end), 0)`.as("expenseYen"),
      }).from(financeTransactions).leftJoin(adjustmentsByTransaction, eq(adjustmentsByTransaction.transactionId, financeTransactions.id)).where(isNull(financeTransactions.deletedAt)),
      this.#database.select({ category: financeTransactions.category, amountYen: sql<number>`sum(${adjustedAmount})`.as("amountYen") })
        .from(financeTransactions).leftJoin(adjustmentsByTransaction, eq(adjustmentsByTransaction.transactionId, financeTransactions.id))
        .where(and(isNull(financeTransactions.deletedAt), eq(financeTransactions.kind, "expense")))
        .groupBy(financeTransactions.category).orderBy(desc(sql`"amountYen"`)),
      this.#database.select({ paymentMethod: financeTransactions.paymentMethod, amountYen: sql<number>`sum(${adjustedAmount})`.as("amountYen") })
        .from(financeTransactions).leftJoin(adjustmentsByTransaction, eq(adjustmentsByTransaction.transactionId, financeTransactions.id))
        .where(and(isNull(financeTransactions.deletedAt), eq(financeTransactions.kind, "expense")))
        .groupBy(financeTransactions.paymentMethod).orderBy(desc(sql`"amountYen"`)),
      this.#database.select({ assetKind: assetBalances.assetKind, amountYen: sql<number>`sum(${assetBalances.amountYen})`.as("amountYen") })
        .from(assetBalances).where(eq(assetBalances.occurredAt,
          this.#database.select({ latest: sql`max(${latestBalance.occurredAt})`.as("latest") }).from(latestBalance).where(eq(latestBalance.accountName, assetBalances.accountName)),
        )).groupBy(assetBalances.assetKind).orderBy(desc(sql`"amountYen"`)),
      this.#database.select({ id: financeTransactions.id, kind: financeTransactions.kind, amountYen: financeTransactions.amountYen,
        adjustedAmountYen: adjustedAmount.as("adjustedAmountYen"), category: financeTransactions.category, paymentMethod: financeTransactions.paymentMethod,
        payee: financeTransactions.payee, occurredAt: financeTransactions.occurredAt,
      }).from(financeTransactions).leftJoin(adjustmentsByTransaction, eq(adjustmentsByTransaction.transactionId, financeTransactions.id))
        .where(isNull(financeTransactions.deletedAt)).orderBy(desc(financeTransactions.occurredAt)).limit(1000),
      this.#database.select().from(financeAdjustments).orderBy(desc(financeAdjustments.createdAt)).limit(500),
      this.#database.select({ accountName: assetBalances.accountName, assetKind: assetBalances.assetKind, amountYen: assetBalances.amountYen, occurredAt: assetBalances.occurredAt })
        .from(assetBalances).orderBy(asc(assetBalances.occurredAt), asc(assetBalances.recordedAt)),
    ]));
    if (!result.ok) return err(appError.storage(result.error));
    const [totalRows, byCategory, byPaymentMethod, assetAllocation, transactions, adjustments, balanceHistoryRows] = result.value;
    const totals = totalRows[0]!;
    type BalanceHistoryRow = typeof balanceHistoryRows[number];
    const netWorthYen = assetAllocation.reduce((sum, entry) => {
      return sum + (entry.assetKind === "debt" ? -entry.amountYen : entry.amountYen);
    }, 0);
    const balancesByAccount = new Map<string, BalanceHistoryRow>();
    const balancesByOccurredAt = balanceHistoryRows.reduce((groups, balance) => {
      const existing = groups.get(balance.occurredAt);
      if (existing === undefined) groups.set(balance.occurredAt, [balance]);
      else existing.push(balance);
      return groups;
    }, new Map<string, Array<BalanceHistoryRow>>());
    const assetHistory = Array.from(balancesByOccurredAt.entries()).map(([occurredAt, balances]) => {
      balances.forEach((balance) => balancesByAccount.set(balance.accountName, balance));
      const historicalNetWorth = Array.from(balancesByAccount.values()).reduce((sum, current) => {
        return sum + (current.assetKind === "debt" ? -current.amountYen : current.amountYen);
      }, 0);
      return {
        occurredAt,
        netWorthYen: historicalNetWorth,
      };
    });
    return ok({
      incomeYen: totals.incomeYen,
      expenseYen: totals.expenseYen,
      netCashflowYen: totals.incomeYen - totals.expenseYen,
      netWorthYen,
      byCategory,
      byPaymentMethod,
      assetAllocation,
      transactions,
      adjustments,
      assetHistory,
    });
  }

  async createFinanceTransaction(id: string, input: CreateFinanceTransactionInput, now: string, sourceJobId?: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.insert(financeTransactions).values({ id, source: input.source,
      sourceTransactionId: input.sourceTransactionId, kind: input.kind, amountYen: input.amountYen, category: input.category,
      paymentMethod: input.paymentMethod, payee: input.payee, occurredAt: input.occurredAt, recordedAt: now, sourceJobId: sourceJobId ?? null,
    }).onConflictDoNothing().run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async createFinanceAdjustment(id: string, input: CreateFinanceAdjustmentInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.insert(financeAdjustments).values({ id, transactionId: input.transactionId, amountDeltaYen: input.amountDeltaYen, reason: input.reason, createdAt: now }).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async createAssetBalance(id: string, input: CreateAssetBalanceInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.insert(assetBalances).values({ id, accountName: input.accountName, assetKind: input.assetKind, amountYen: input.amountYen, occurredAt: input.occurredAt, recordedAt: now }).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async createNote(id: string, body: string, occurredAt: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.insert(notes).values({ id, body, occurredAt, recordedAt: now }).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async listRepositories(): Promise<Result<ReadonlyArray<Repository>, AppError>> {
    const result = await safeTry(() => this.#database.select({ id: repositories.id, name: repositories.name }).from(repositories).where(isNull(repositories.archivedAt)).orderBy(asc(repositories.name)).all());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value);
  }

  async listSourceRepositoryMappings(): Promise<Result<ReadonlyArray<SourceRepositoryMapping>, AppError>> {
    const result = await safeTry(() => this.#database.select(sourceMappingColumns).from(sourceRepositoryMappings)
      .innerJoin(repositories, and(eq(repositories.id, sourceRepositoryMappings.repositoryId), isNull(repositories.archivedAt)))
      .leftJoin(connectorStates, and(eq(connectorStates.connector, sourceRepositoryMappings.connector), eq(connectorStates.sourceId, sourceRepositoryMappings.sourceId))).where(eq(sourceRepositoryMappings.role, "work")).orderBy(asc(sourceRepositoryMappings.connector), sourceMappingColumns.sourceLabel).all());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value);
  }

  async getAgentJobContext(taskId: string, repositoryId: string): Promise<Result<AgentJobContext, AppError>> {
    const result = await safeTry(() => this.#database.select({ taskId: tasks.id, taskTitle: tasks.title, taskDescription: tasks.description,
      repositoryId: repositories.id, repositoryName: repositories.name, repositoryPath: repositories.localPath,
    }).from(tasks).innerJoin(repositories, eq(repositories.id, repositoryId))
      .where(and(eq(tasks.id, taskId), isNull(repositories.archivedAt))).get());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value === undefined) return err(appError.notFound("agent job のタスクまたはリポジトリが見つかりません。"));
    return ok(result.value);
  }

  async createRepository(id: string, name: string, localPath: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.insert(repositories).values({ id, name, localPath, archivedAt: null, createdAt: now, updatedAt: now }).onConflictDoNothing().run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async syncRepositories(input: SyncRepositoriesInput, ids: ReadonlyArray<string>, now: string): Promise<Result<number, AppError>> {
    const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [this.#database.update(repositories).set({ archivedAt: now, updatedAt: now }).where(isNull(repositories.archivedAt))];
    for (const [index, repository] of input.repositories.entries()) {
      statements.push(this.#database.insert(repositories).values({ id: ids[index]!, name: repository.name, localPath: repository.localPath, archivedAt: null, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: repositories.localPath, set: { name: repository.name, archivedAt: null, updatedAt: now } }));
    }
    const result = await safeTry(() => this.#database.batch(statements));
    return result.ok ? ok(input.repositories.length) : err(appError.storage(result.error));
  }

  async upsertSourceRepositoryMapping(input: UpsertSourceRepositoryMappingInput, now: string): Promise<Result<void, AppError>> {
    const mapping = this.#database.select({ connector: sql`${input.connector}`.as("connector"), sourceScope: sql`${input.sourceScope}`.as("sourceScope"),
      sourceId: sql`${input.sourceId}`.as("sourceId"), repositoryId: repositories.id, role: sql`'work'`.as("role"), createdAt: sql`${now}`.as("createdAt"), updatedAt: sql`${now}`.as("updatedAt"),
    }).from(repositories).where(and(eq(repositories.id, input.repositoryId), isNull(repositories.archivedAt)));
    const result = await safeTry(() => this.#database.batch([
      this.#database.delete(sourceRepositoryMappings).where(and(eq(sourceRepositoryMappings.connector, input.connector),
        eq(sourceRepositoryMappings.sourceScope, input.sourceScope), eq(sourceRepositoryMappings.sourceId, input.sourceId), eq(sourceRepositoryMappings.role, "work"))),
      this.#database.insert(sourceRepositoryMappings).select(mapping),
    ]));
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value[1].meta.changes === 0) return err(appError.notFound("リポジトリが見つかりません。"));
    return ok(undefined);
  }

  async assignTaskRepository(taskId: string, repositoryId: string, role: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.insert(taskRepositories).values({ taskId, repositoryId, role, createdAt: now })
      .onConflictDoUpdate({ target: [taskRepositories.taskId, taskRepositories.repositoryId, taskRepositories.role], set: { createdAt: now } }).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async registerRunner(input: RegisterRunnerInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.insert(runners).values({ id: input.runnerId, name: input.name, lastHeartbeatAt: now,
      tokenExpiresAt: input.tokenExpiresAt, orcaStatus: input.orcaStatus, lastErrorCode: null, createdAt: now, updatedAt: now,
    }).onConflictDoUpdate({ target: runners.id, set: { name: input.name, lastHeartbeatAt: now, tokenExpiresAt: input.tokenExpiresAt, orcaStatus: input.orcaStatus, updatedAt: now } }).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async heartbeatRunner(runnerId: string, orcaStatus: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.update(runners).set({ lastHeartbeatAt: now, orcaStatus, updatedAt: now }).where(eq(runners.id, runnerId)).run());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value.meta.changes === 0) return err(appError.notFound("runner が登録されていません。"));
    return ok(undefined);
  }

  async listRunners(): Promise<Result<ReadonlyArray<RunnerHealth>, AppError>> {
    const result = await safeTry(() => this.#database.select({ id: runners.id, name: runners.name, lastHeartbeatAt: runners.lastHeartbeatAt,
      tokenExpiresAt: runners.tokenExpiresAt, orcaStatus: runners.orcaStatus, lastErrorCode: runners.lastErrorCode,
    }).from(runners).orderBy(asc(runners.name)).all());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value);
  }

  async listConnectorHealth(): Promise<Result<ReadonlyArray<ConnectorHealth>, AppError>> {
    const result = await safeTry(() => this.#database.select({ connector: connectorStates.connector, sourceId: connectorStates.sourceId,
      sourceLabel: sql<string>`coalesce(${connectorStates.sourceLabel}, ${connectorStates.sourceId})`.as("sourceLabel"), watermark: connectorStates.watermark,
      lastSuccessAt: connectorStates.lastSuccessAt, nextRunAt: connectorStates.nextRunAt, lastErrorCode: connectorStates.lastErrorCode,
    }).from(connectorStates).orderBy(asc(connectorStates.connector), asc(connectorStates.sourceId)).all());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value);
  }

  async listJobs(): Promise<Result<ReadonlyArray<Job>, AppError>> {
    const result = await safeTry(() => this.#database.select(jobColumns).from(jobs).orderBy(desc(jobs.createdAt)).limit(100).all());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value);
  }

  async createJob(input: { readonly id: string; readonly kind: string; readonly idempotencyKey: string; readonly payloadJson: string; readonly now: string; readonly deadlineAt?: string; readonly scheduleId?: string; readonly taskId?: string; readonly repositoryId?: string; readonly provider?: string }): Promise<Result<Job, AppError>> {
    const pendingReply = this.#database.select({ id: jobs.id }).from(jobs).where(and(
      eq(jobs.kind, "conversation_reply"), inArray(jobs.status, pendingJobStatuses),
      eq(sql`json_extract(${jobs.payloadJson}, '$.conversationId')`, sql`json_extract(${input.payloadJson}, '$.conversationId')`),
    ));
    const existingMealId = sql`json_extract(${jobs.payloadJson}, '$.mealId')`;
    const requestedMealId = sql`json_extract(${input.payloadJson}, '$.mealId')`;
    const pendingNutrition = this.#database.select({ id: jobs.id }).from(jobs).where(and(
      eq(jobs.kind, "nutrition_analysis"), inArray(jobs.status, pendingJobStatuses),
      or(isNull(existingMealId), isNull(requestedMealId), eq(existingMealId, requestedMealId)),
    ));
    const selection = this.#database.select(queuedJobSelection({ ...input, createdAt: input.now, updatedAt: input.now }))
      .from(sql`(select 1)`).where(and(
        input.kind === "conversation_reply" ? notExists(pendingReply) : sql`1`,
        input.kind === "nutrition_analysis" ? notExists(pendingNutrition) : sql`1`,
      ));
    const result = await safeTry(() => this.#database.insert(jobs).select(selection).onConflictDoNothing().run());
    if (!result.ok) return err(appError.storage(result.error));
    if (input.kind === "conversation_reply" && result.value.meta.changes === 0) return err(appError.conflict("この会話への返信は既に実行待ち、または送信中です。"));
    if (input.kind === "nutrition_analysis" && result.value.meta.changes === 0) return err(appError.conflict("対象の食事は既に解析待ち、または解析中です。"));
    return this.getJobByIdempotencyKey(input.idempotencyKey);
  }

  async claimJob(runnerId: string, leaseToken: string, leaseExpiresAt: string, now: string): Promise<Result<Job | null, AppError>> {
    const candidate = this.#database.select({ id: jobs.id }).from(jobs).where(and(
      eq(jobs.status, "queued"), isNull(jobs.cancelRequestedAt),
      or(isNull(jobs.deadlineAt), gt(sql`julianday(${jobs.deadlineAt})`, sql`julianday(${now})`)),
    )).orderBy(asc(jobs.createdAt)).limit(1);
    const result = await safeTry(() => this.#database.update(jobs).set({ status: "claimed", runnerId, leaseToken, leaseExpiresAt,
      lastHeartbeatAt: now, startedAt: sql`coalesce(${jobs.startedAt}, ${now})`, attempt: sql`${jobs.attempt} + 1`, updatedAt: now,
    }).where(and(eq(jobs.id, candidate), eq(jobs.status, "queued"))).returning(jobColumns).get());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value ?? null);
  }

  async heartbeatJob(jobId: string, input: JobHeartbeatInput, leaseExpiresAt: string, now: string): Promise<Result<{ readonly cancelRequested: boolean }, AppError>> {
    const validLease = and(eq(jobs.id, jobId), eq(jobs.runnerId, input.runnerId), eq(jobs.leaseToken, input.leaseToken),
      inArray(jobs.status, activeJobStatuses), gt(sql`julianday(${jobs.leaseExpiresAt})`, sql`julianday(${now})`));
    const result = await safeTry(() => this.#database.batch([
      this.#database.insert(jobHeartbeatObservations).values({ jobId, runnerId: input.runnerId, receivedAt: now,
        accepted: exists(this.#database.select({ id: jobs.id }).from(jobs).where(validLease)),
      }),
      this.#database.update(jobs).set({ status: input.waitingForUser ? "waiting_for_user" : "running", leaseExpiresAt, lastHeartbeatAt: now,
        progressUpdatedAt: input.progressSummary === null ? jobs.progressUpdatedAt : now,
        summary: input.progressSummary === null ? jobs.summary : input.progressSummary, updatedAt: now,
      }).where(validLease).returning({ cancelRequestedAt: jobs.cancelRequestedAt }),
    ]));
    if (!result.ok) return err(appError.storage(result.error));
    const updated = result.value[1][0];
    if (updated === undefined) return err(appError.invalidLease());
    return ok({ cancelRequested: updated.cancelRequestedAt !== null });
  }

  async completeJob(jobId: string, input: CompleteJobInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.update(jobs).set({ status: input.outcome, summary: input.summary, errorCode: input.errorCode, finishedAt: now, leaseExpiresAt: null, updatedAt: now }).where(and(eq(jobs.runnerId, input.runnerId), and(eq(jobs.id, jobId), eq(jobs.leaseToken, input.leaseToken), inArray(jobs.status, activeJobStatuses),
      gt(sql`julianday(${jobs.leaseExpiresAt})`, sql`julianday(${now})`)))).run());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value.meta.changes === 0) return err(appError.invalidLease());
    return ok(undefined);
  }

  async completeJobByCapability(jobId: string, leaseToken: string, outcome: string, errorCode: string | null, summary: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.update(jobs).set({ status: outcome, summary, errorCode, finishedAt: now, leaseExpiresAt: null, updatedAt: now }).where(and(eq(jobs.id, jobId), eq(jobs.leaseToken, leaseToken), inArray(jobs.status, activeJobStatuses),
      gt(sql`julianday(${jobs.leaseExpiresAt})`, sql`julianday(${now})`))).run());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value.meta.changes === 0) return err(appError.invalidLease());
    return ok(undefined);
  }

  async requestJobCancel(jobId: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.update(jobs).set({ cancelRequestedAt: now, updatedAt: now,
      status: sql`case when ${jobs.status} = 'queued' then 'canceled' else ${jobs.status} end`,
      finishedAt: sql`case when ${jobs.status} = 'queued' then ${now} else ${jobs.finishedAt} end`,
    }).where(and(eq(jobs.id, jobId), inArray(jobs.status, pendingJobStatuses))).run());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value.meta.changes === 0) return err(appError.notFound("中止できる job が見つかりません。"));
    return ok(undefined);
  }

  async validateLease(jobId: string, leaseToken: string): Promise<Result<boolean, AppError>> {
    const result = await safeTry(() => this.#database.select({ count: count() }).from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.leaseToken, leaseToken),
      inArray(jobs.status, activeJobStatuses), gt(sql`julianday(${jobs.leaseExpiresAt})`, sql`julianday('now')`),
    )).get());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value!.count === 1);
  }

  async createSchedule(id: string, input: CreateScheduleInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.insert(schedules).values({ id, name: input.name, jobKind: input.jobKind,
      payloadJson: JSON.stringify(input.payload ?? {}), interval: input.interval, timezone: input.timezone, nextRunAt: input.nextRunAt,
      coalescing: input.coalescing, deadlineSeconds: input.deadlineSeconds, enabled: true, createdAt: now, updatedAt: now,
    }).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async enqueueDueSchedules(now: string): Promise<Result<number, AppError>> {
    // 自己参照する CTE の列は、再帰する SELECT からも同じ名前で参照する。
    const periodColumns = {
      scheduleId: sql<string>`schedule_id`.as("schedule_id"),
      jobKind: sql<string>`job_kind`.as("job_kind"),
      payloadJson: sql<string>`payload_json`.as("payload_json"),
      periodStart: sql<string>`period_start`.as("period_start"),
      interval: sql<string>`interval`.as("interval"),
      coalescing: sql<string>`coalescing`.as("coalescing"),
      deadlineSeconds: sql<number>`deadline_seconds`.as("deadline_seconds"),
    };
    const nextPeriod = sql<string>`case interval
      when 'hourly' then strftime('%Y-%m-%dT%H:%M:%fZ', period_start, '+1 hour')
      when 'daily' then strftime('%Y-%m-%dT%H:%M:%fZ', period_start, '+1 day')
      else strftime('%Y-%m-%dT%H:%M:%fZ', period_start, '+7 days') end`;
    const duePeriods = this.#database.$with("due_periods").as(
      this.#database.select({
        scheduleId: sql<string>`${schedules.id}`.as("schedule_id"),
        jobKind: sql<string>`${schedules.jobKind}`.as("job_kind"),
        payloadJson: sql<string>`${schedules.payloadJson}`.as("payload_json"),
        periodStart: sql<string>`${schedules.nextRunAt}`.as("period_start"),
        interval: sql<string>`${schedules.interval}`.as("interval"),
        coalescing: sql<string>`${schedules.coalescing}`.as("coalescing"),
        deadlineSeconds: sql<number>`${schedules.deadlineSeconds}`.as("deadline_seconds"),
      }).from(schedules).where(and(eq(schedules.enabled, true), lte(sql`julianday(${schedules.nextRunAt})`, sql`julianday(${now})`)))
        .unionAll(this.#database.select({ ...periodColumns, periodStart: nextPeriod.as("period_start") })
          .from(sql`due_periods`).where(lte(sql`julianday(${nextPeriod})`, sql`julianday(${now})`))),
    );
    const rankedPeriods = this.#database.$with("ranked_periods").as(this.#database.select({
      scheduleId: duePeriods.scheduleId, jobKind: duePeriods.jobKind, payloadJson: duePeriods.payloadJson,
      periodStart: duePeriods.periodStart, coalescing: duePeriods.coalescing, deadlineSeconds: duePeriods.deadlineSeconds,
      periodRank: sql<number>`row_number() over (partition by ${duePeriods.scheduleId} order by julianday(${duePeriods.periodStart}) desc)`.as("period_rank"),
    }).from(duePeriods));
    const pending = alias(jobs, "pending");
    // CTE の SQL 別名は自動で修飾されないため、内側の jobs.schedule_id との取り違えを防ぐ。
    const dueScheduleId = sql`${rankedPeriods}.${rankedPeriods.scheduleId}`;
    const dueJobs = this.#database.with(duePeriods, rankedPeriods).select(queuedJobSelection({
      id: sql`lower(hex(randomblob(16)))`, scheduleId: sql`${rankedPeriods.scheduleId}`, kind: sql`${rankedPeriods.jobKind}`,
      idempotencyKey: sql`${rankedPeriods.scheduleId} || ':' || ${rankedPeriods.periodStart}`, payloadJson: sql`${rankedPeriods.payloadJson}`,
      deadlineAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${rankedPeriods.periodStart}, '+' || ${rankedPeriods.deadlineSeconds} || ' seconds')`,
      createdAt: now, updatedAt: now,
    })).from(rankedPeriods).where(or(eq(rankedPeriods.coalescing, "queue_all"), and(eq(rankedPeriods.periodRank, 1),
      notExists(this.#database.select({ id: pending.id }).from(pending).where(and(eq(pending.scheduleId, dueScheduleId), inArray(pending.status, pendingJobStatuses)))),
    )));
    const futureRuns = this.#database.$with("future_runs").as(
      this.#database.select({
        id: sql<string>`${schedules.id}`.as("id"), interval: sql<string>`${schedules.interval}`.as("interval"),
        nextRunAt: sql<string>`${schedules.nextRunAt}`.as("next_run_at"),
      }).from(schedules).where(and(eq(schedules.enabled, true), lte(sql`julianday(${schedules.nextRunAt})`, sql`julianday(${now})`)))
        .unionAll(this.#database.select({
          id: sql<string>`id`.as("id"), interval: sql<string>`interval`.as("interval"),
          nextRunAt: sql<string>`case interval
            when 'hourly' then strftime('%Y-%m-%dT%H:%M:%fZ', next_run_at, '+1 hour')
            when 'daily' then strftime('%Y-%m-%dT%H:%M:%fZ', next_run_at, '+1 day')
            else strftime('%Y-%m-%dT%H:%M:%fZ', next_run_at, '+7 days') end`.as("next_run_at"),
        }).from(sql`future_runs`).where(lte(sql`julianday(next_run_at)`, sql`julianday(${now})`))),
    );
    const nextValues = this.#database.$with("next_values").as(this.#database.select({
      id: futureRuns.id, nextRunAt: sql<string>`min(${futureRuns.nextRunAt})`.as("next_run_at"),
    }).from(futureRuns).where(gt(sql`julianday(${futureRuns.nextRunAt})`, sql`julianday(${now})`)).groupBy(sql`${futureRuns.id}`));
    const updateSchedules = this.#database.with(futureRuns, nextValues).update(schedules).set({
      nextRunAt: sql`${this.#database.select({ nextRunAt: nextValues.nextRunAt }).from(nextValues).where(eq(nextValues.id, schedules.id))}`, updatedAt: now,
    }).where(inArray(schedules.id, this.#database.select({ id: nextValues.id }).from(nextValues)));
    const result = await safeTry(() => this.#database.batch([
      this.#database.insert(jobs).select(dueJobs).onConflictDoNothing(),
      updateSchedules,
      this.#database.insert(systemState).values({ key: "last_cron_success_at", value: now, updatedAt: now })
        .onConflictDoUpdate({ target: systemState.key, set: { value: now, updatedAt: now } }),
    ]));
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value[0].meta.changes);
  }

  async markExpiredAndLostJobs(now: string): Promise<Result<void, AppError>> {
    const expiredLease = and(inArray(jobs.status, activeJobStatuses), lte(sql`julianday(${jobs.leaseExpiresAt})`, sql`julianday(${now})`));
    const externalJobKinds = ["agent", "github_promotion", "conversation_reply"];
    const result = await safeTry(() => this.#database.batch([
      this.#database.update(jobs).set({ status: "expired", finishedAt: now, updatedAt: now })
        .where(and(eq(jobs.status, "queued"), isNotNull(jobs.deadlineAt), lte(sql`julianday(${jobs.deadlineAt})`, sql`julianday(${now})`))),
      this.#database.update(jobs).set({ status: "lost", finishedAt: now, errorCode: "lease_expired", updatedAt: now })
        .where(and(inArray(jobs.kind, externalJobKinds), expiredLease)),
      this.#database.update(jobs).set({
        status: sql`case when ${jobs.cancelRequestedAt} is null then 'queued' else 'canceled' end`,
        finishedAt: sql`case when ${jobs.cancelRequestedAt} is null then null else ${now} end`,
        runnerId: null, leaseToken: null, leaseExpiresAt: null, errorCode: "previous_lease_expired", updatedAt: now,
      }).where(and(notInArray(jobs.kind, externalJobKinds), expiredLease)),
    ]));
    return result.ok ? ok(undefined) : err(appError.storage(result.error));
  }

  async getDashboard(): Promise<Result<Dashboard, AppError>> {
    const [tasks, conversations, runners, connectors, jobs, finance, weights] = await Promise.all([
      this.listTasks(),
      this.listConversations({ connector: null, classification: null, since: null }),
      this.listRunners(),
      this.listConnectorHealth(),
      this.listJobs(),
      this.getFinanceSummary(),
      this.listWeights(),
    ]);
    if (!tasks.ok) return tasks;
    if (!conversations.ok) return conversations;
    if (!runners.ok) return runners;
    if (!connectors.ok) return connectors;
    if (!jobs.ok) return jobs;
    if (!finance.ok) return finance;
    if (!weights.ok) return weights;
    const activeTasks = tasks.value.filter((task) => task.status !== "done" && task.status !== "canceled");
    const unprocessed = conversations.value.filter((conversation) => conversation.classification === "unprocessed");
    const delayedJobCount = jobs.value.filter((job) => job.status === "queued" || job.status === "lost").length;
    return ok({
      todayTasks: activeTasks,
      conversations: unprocessed,
      runners: runners.value,
      connectors: connectors.value,
      recentJobs: jobs.value.slice(0, 12),
      delayedJobCount,
      finance: finance.value,
      weights: calculate7DayMovingAverage(weights.value),
    });
  }

  private async getTask(id: string): Promise<Result<Task, AppError>> {
    const result = await safeTry(() => this.#database.select(taskColumns).from(tasks)
      .leftJoin(taskRepositories, and(eq(taskRepositories.taskId, tasks.id), eq(taskRepositories.role, "work")))
      .leftJoin(repositories, and(eq(repositories.id, taskRepositories.repositoryId), isNull(repositories.archivedAt))).where(eq(tasks.id, id)).get());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value === undefined) return err(appError.notFound("タスクが見つかりません。"));
    return ok(result.value);
  }

  private async getJobByIdempotencyKey(idempotencyKey: string): Promise<Result<Job, AppError>> {
    const result = await safeTry(() => this.#database.select(jobColumns).from(jobs).where(eq(jobs.idempotencyKey, idempotencyKey)).get());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value === undefined) return err(appError.storage("job insert returned no row"));
    return ok(result.value);
  }
}
