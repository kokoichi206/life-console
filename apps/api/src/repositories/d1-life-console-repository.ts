import type { CompleteJobInput, CreateAssetBalanceInput, CreateFinanceAdjustmentInput, CreateFinanceTransactionInput, CreateMealInput, CreateScheduleInput, CreateTaskInput, CreateWeightInput, JobHeartbeatInput, RegisterRunnerInput, CreateReplyDraftsInput, SaveReplyDraftInput, EditReplyDraftInput, ReplyDraft, SyncRepositoriesInput, UpsertSourceRepositoryMappingInput, UpdateTaskInput } from "@life-console/contracts";
import { calculate7DayMovingAverage } from "@life-console/contracts";
import type { Result } from "@life-console/core";
import { err, ok, safeTry } from "@life-console/core";

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

const taskColumns = `
  t.id,
  t.title,
  t.description,
  t.status,
  t.due_at AS dueAt,
  t.completed_at AS completedAt,
  t.conversation_id AS conversationId,
  r.id AS repositoryId,
  r.name AS repositoryName,
  t.created_at AS createdAt,
  t.updated_at AS updatedAt
`;

const jobColumns = `
  id,
  task_id AS taskId,
  repository_id AS repositoryId,
  kind,
  status,
  payload_json AS payloadJson,
  lease_token AS leaseToken,
  cancel_requested_at AS cancelRequestedAt,
  provider,
  summary,
  error_code AS errorCode,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

const toStorageError = <T>(result: Result<T, unknown>): Result<T, AppError> => {
  if (!result.ok) return err(appError.storage(result.error));
  return ok(result.value);
};

export class D1LifeConsoleRepository implements LifeConsoleRepository {
  readonly #database: D1Database;

  constructor(database: D1Database) {
    this.#database = database;
  }

  async listReplyDrafts(): Promise<Result<ReadonlyArray<ReplyDraft>, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT d.conversation_id AS conversationId, c.connector, c.author_label AS authorLabel,
        c.excerpt, c.source_url AS sourceUrl, c.occurred_at AS occurredAt,
        d.status, d.body, d.reason, d.reply_evidence_id AS replyEvidenceId,
        d.checked_at AS checkedAt, d.edited_at AS editedAt, d.updated_at AS updatedAt
      FROM reply_drafts d JOIN conversations c ON c.id = d.conversation_id
      ORDER BY c.occurred_at DESC
    `).all<ReplyDraft>());
    return result.ok ? ok(result.value.results) : err(appError.storage(result.error));
  }

  async listReplyCandidates(input: CreateReplyDraftsInput, since: string): Promise<Result<ReadonlyArray<Conversation>, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT id, connector, source_id AS sourceId, external_message_id AS externalMessageId,
        author_label AS authorLabel, excerpt, source_url AS sourceUrl, classification, occurred_at AS occurredAt
      FROM conversations WHERE connector = ? AND occurred_at >= ? ORDER BY occurred_at DESC
    `).bind(input.connector, since).all<Conversation>());
    return result.ok ? ok(result.value.results) : err(appError.storage(result.error));
  }

  async saveReplyDraft(input: SaveReplyDraftInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      INSERT INTO reply_drafts (conversation_id, status, body, reason, reply_evidence_id, checked_at, edited_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, NULL, ? WHERE EXISTS (
        SELECT 1 FROM jobs WHERE id = ? AND lease_token = ? AND kind = 'reply_drafts'
          AND status IN ('claimed', 'running') AND lease_expires_at > ? AND cancel_requested_at IS NULL
      )
      ON CONFLICT(conversation_id) DO UPDATE SET
        status = excluded.status,
        body = CASE WHEN reply_drafts.edited_at IS NOT NULL THEN reply_drafts.body ELSE excluded.body END,
        reason = excluded.reason, reply_evidence_id = excluded.reply_evidence_id,
        checked_at = excluded.checked_at, updated_at = excluded.updated_at
      WHERE excluded.checked_at >= reply_drafts.checked_at
    `).bind(input.conversationId, input.decision.status, input.decision.body, input.decision.reason,
      input.decision.replyEvidenceId, input.checkedAt, now, input.jobId, input.leaseToken, now).run());
    if (!result.ok) return err(appError.storage(result.error));
    return result.value.meta.changes > 0 ? ok(undefined) : err(appError.conflict("下書きの保存権限が失効したか、新しい確認結果があります。"));
  }

  async editReplyDraft(id: string, input: EditReplyDraftInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      UPDATE reply_drafts SET body = ?, edited_at = ?, updated_at = ?
      WHERE conversation_id = ? AND updated_at = ? AND status IN ('ready', 'needs_review')
    `).bind(input.body, now, now, id, input.updatedAt).run());
    if (!result.ok) return err(appError.storage(result.error));
    return result.value.meta.changes > 0 ? ok(undefined) : err(appError.conflict("下書きが更新されています。再読み込みして確認してください。"));
  }

  async listTasks(): Promise<Result<ReadonlyArray<Task>, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT ${taskColumns}
      FROM tasks t
      LEFT JOIN task_repositories tr ON tr.task_id = t.id AND tr.role = 'work'
      LEFT JOIN repositories r ON r.id = tr.repository_id AND r.archived_at IS NULL
      ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'inbox' THEN 2 ELSE 3 END,
               t.due_at IS NULL,
               t.due_at,
               t.created_at DESC
    `).all<Task>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.results);
  }

  async createTask(id: string, input: CreateTaskInput, now: string): Promise<Result<Task, AppError>> {
    const inserted = await safeTry(() => this.#database.prepare(`
      INSERT INTO tasks (
        id, title, description, status, due_at, completed_at, conversation_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'todo', ?, NULL, ?, ?, ?)
    `).bind(id, input.title, input.description, input.dueAt, input.conversationId, now, now).run());
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
    const updated = await safeTry(() => this.#database.prepare(`
      UPDATE tasks
      SET title = ?, description = ?, status = ?, due_at = ?, completed_at = ?,
          conversation_id = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      input.title ?? task.title,
      input.description ?? task.description,
      status,
      input.dueAt === undefined ? task.dueAt : input.dueAt,
      completedAt,
      input.conversationId === undefined ? task.conversationId : input.conversationId,
      now,
      id,
    ).run());
    if (!updated.ok) return err(appError.storage(updated.error));

    if (input.repositoryId !== undefined && input.repositoryId !== task.repositoryId) {
      const cleared = await safeTry(() => this.#database.prepare(
        "DELETE FROM task_repositories WHERE task_id = ? AND role = 'work'",
      ).bind(id).run());
      if (!cleared.ok) return err(appError.storage(cleared.error));
      if (input.repositoryId !== null) {
        const assigned = await this.assignTaskRepository(id, input.repositoryId, "work", now);
        if (!assigned.ok) return assigned;
      }
    }
    return this.getTask(id);
  }

  async listConversations(filter: ConversationListFilter): Promise<Result<ReadonlyArray<Conversation>, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT id, connector, source_id AS sourceId, external_message_id AS externalMessageId,
             author_label AS authorLabel, excerpt,
             source_url AS sourceUrl, classification, occurred_at AS occurredAt
      FROM conversations
      WHERE (? IS NULL OR connector = ?)
        AND (? IS NULL OR classification = ?)
        AND (? IS NULL OR occurred_at >= ?)
      ORDER BY occurred_at DESC
    `).bind(
      filter.connector,
      filter.connector,
      filter.classification,
      filter.classification,
      filter.since,
      filter.since,
    ).all<Conversation>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.results);
  }

  async getConversation(id: string): Promise<Result<Conversation, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT id, connector, source_id AS sourceId, external_message_id AS externalMessageId,
             author_label AS authorLabel, excerpt,
             source_url AS sourceUrl, classification, occurred_at AS occurredAt
      FROM conversations
      WHERE id = ?
    `).bind(id).first<Conversation>());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value === null) return err(appError.notFound("会話が見つかりません。"));
    return ok(result.value);
  }

  async getSourceRepositoryMapping(connector: string, sourceId: string): Promise<Result<SourceRepositoryMapping | null, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT m.connector, m.source_scope AS sourceScope, m.source_id AS sourceId,
             COALESCE(cs.source_label, m.source_id) AS sourceLabel,
             r.id AS repositoryId, r.name AS repositoryName
      FROM source_repository_mappings m
      JOIN repositories r ON r.id = m.repository_id AND r.archived_at IS NULL
      LEFT JOIN connector_states cs ON cs.connector = m.connector AND cs.source_id = m.source_id
      WHERE m.connector = ? AND m.source_id = ? AND m.role = 'work'
      LIMIT 1
    `).bind(connector, sourceId).first<SourceRepositoryMapping>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value);
  }

  async classifyConversation(id: string, classification: string, _now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(
      "UPDATE conversations SET classification = ? WHERE id = ?",
    ).bind(classification, id).run());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value.meta.changes === 0) return err(appError.notFound("会話が見つかりません。"));
    return ok(undefined);
  }

  async createTaskFromConversation(id: string, input: CreateTaskInput, conversationId: string, now: string): Promise<Result<Task, AppError>> {
    const statements = [this.#database.prepare(`
      INSERT INTO tasks (
        id, title, description, status, due_at, completed_at, conversation_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'todo', ?, NULL, ?, ?, ?)
    `).bind(id, input.title, input.description, input.dueAt, conversationId, now, now)];
    if (input.repositoryId !== null) {
      statements.push(this.#database.prepare(`
        INSERT INTO task_repositories (task_id, repository_id, role, created_at)
        VALUES (?, ?, 'work', ?)
      `).bind(id, input.repositoryId, now));
    }
    statements.push(this.#database.prepare(
      "UPDATE conversations SET classification = 'task_candidate' WHERE id = ?",
    ).bind(conversationId));
    const result = await safeTry(() => this.#database.batch(statements));
    if (!result.ok) return err(appError.storage(result.error));
    return this.getTask(id);
  }

  async saveConversations(conversations: ReadonlyArray<NewConversation>, sourceLabel: string, watermark: string, now: string): Promise<Result<number, AppError>> {
    const statements = conversations.map((conversation) => this.#database.prepare(`
      INSERT INTO conversations (
        id, connector, source_id, external_message_id, author_label, excerpt,
        source_url, classification, occurred_at, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(connector, source_id, external_message_id) DO UPDATE SET
        author_label = excluded.author_label, excerpt = excluded.excerpt,
        source_url = excluded.source_url, occurred_at = excluded.occurred_at
    `).bind(
      conversation.id,
      conversation.connector,
      conversation.sourceId,
      conversation.externalMessageId,
      conversation.authorLabel,
      conversation.excerpt,
      conversation.sourceUrl,
      conversation.classification,
      conversation.occurredAt,
      now,
    ));
    const state = conversations[0];
    if (state === undefined) return ok(0);
    statements.push(this.#database.prepare(`
      INSERT INTO connector_states (
        connector, source_id, source_label, watermark, last_success_at, next_run_at, last_error_code, updated_at
      ) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+1 hour'), NULL, ?)
      ON CONFLICT (connector, source_id) DO UPDATE SET
        source_label = excluded.source_label,
        watermark = excluded.watermark,
        last_success_at = excluded.last_success_at,
        next_run_at = excluded.next_run_at,
        last_error_code = NULL,
        updated_at = excluded.updated_at
    `).bind(state.connector, state.sourceId, sourceLabel, watermark, now, now, now));
    const result = await safeTry(() => this.#database.batch(statements));
    if (!result.ok) return err(appError.storage(result.error));
    const insertedCount = result.value.slice(0, -1).reduce((count, entry) => count + entry.meta.changes, 0);
    return ok(insertedCount);
  }

  async listMeals(): Promise<Result<ReadonlyArray<Meal>, AppError>> {
    type MealRow = Omit<Meal, "tags"> & { readonly tagsJson: string };
    const result = await safeTry(() => this.#database.prepare(`
      SELECT id, photo_id AS photoId, memo, meal_kind AS mealKind,
             occurred_at AS occurredAt, recorded_at AS recordedAt, tags_json AS tagsJson
      FROM meals
      WHERE deleted_at IS NULL
      ORDER BY occurred_at DESC
      LIMIT 100
    `).all<MealRow>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.results.map((row) => ({
      ...row,
      tags: JSON.parse(row.tagsJson) as ReadonlyArray<string>,
    })));
  }

  async createMeal(id: string, input: CreateMealInput, now: string): Promise<Result<Meal, AppError>> {
    const inserted = await safeTry(() => this.#database.prepare(`
      INSERT OR IGNORE INTO meals (
        id, client_id, photo_id, memo, meal_kind, occurred_at, recorded_at, tags_json, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).bind(
      id,
      input.clientId,
      input.photoId,
      input.memo,
      input.mealKind,
      input.occurredAt,
      now,
      JSON.stringify(input.tags),
    ).run());
    if (!inserted.ok) return err(appError.storage(inserted.error));
    const selected = await safeTry(() => this.#database.prepare(`
      SELECT id, photo_id AS photoId, memo, meal_kind AS mealKind,
             occurred_at AS occurredAt, recorded_at AS recordedAt, tags_json AS tagsJson
      FROM meals WHERE client_id = ?
    `).bind(input.clientId).first<Omit<Meal, "tags"> & { readonly tagsJson: string }>());
    if (!selected.ok) return err(appError.storage(selected.error));
    if (selected.value === null) return err(appError.storage("meal insert returned no row"));
    return ok({ ...selected.value, tags: JSON.parse(selected.value.tagsJson) as ReadonlyArray<string> });
  }

  async createMealPhoto(input: { readonly id: string; readonly clientId: string; readonly contentType: string; readonly objectKey: string; readonly tokenHash: string; readonly expiresAt: string; readonly now: string }): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      INSERT OR IGNORE INTO meal_photos (
        id, client_id, object_key, content_type, upload_token_hash,
        upload_expires_at, uploaded_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
    `).bind(
      input.id,
      input.clientId,
      input.objectKey,
      input.contentType,
      input.tokenHash,
      input.expiresAt,
      input.now,
    ).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async getMealPhoto(id: string): Promise<Result<{ readonly contentType: string; readonly objectKey: string; readonly tokenHash: string; readonly expiresAt: string; readonly uploadedAt: string | null }, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT content_type AS contentType, object_key AS objectKey,
             upload_token_hash AS tokenHash, upload_expires_at AS expiresAt,
             uploaded_at AS uploadedAt
      FROM meal_photos WHERE id = ?
    `).bind(id).first<{ readonly contentType: string; readonly objectKey: string; readonly tokenHash: string; readonly expiresAt: string; readonly uploadedAt: string | null }>());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value === null) return err(appError.notFound("写真アップロードが見つかりません。"));
    return ok(result.value);
  }

  async markMealPhotoUploaded(id: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(
      "UPDATE meal_photos SET uploaded_at = ? WHERE id = ?",
    ).bind(now, id).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  listWeights(): Promise<Result<ReadonlyArray<WeightPoint>, AppError>> {
    return this.#readWeights(730);
  }

  listWeightsForExport(): Promise<Result<ReadonlyArray<WeightPoint>, AppError>> {
    return this.#readWeights(-1);
  }

  async #readWeights(limit: number): Promise<Result<ReadonlyArray<WeightPoint>, AppError>> {
    type WeightRow = Omit<WeightPoint, "weightKg"> & { readonly weightGrams: number };
    const result = await safeTry(() => this.#database.prepare(`
      SELECT id, source, weight_grams AS weightGrams,
             occurred_at AS occurredAt, recorded_at AS recordedAt
      FROM weights
      WHERE deleted_at IS NULL
      ORDER BY julianday(occurred_at) ASC, id ASC
      LIMIT ?
    `).bind(limit).all<WeightRow>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.results.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      recordedAt: row.recordedAt,
      source: row.source,
      weightKg: row.weightGrams / 1_000,
    })));
  }

  async createWeight(id: string, input: CreateWeightInput, now: string, sourceJobId?: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      INSERT OR IGNORE INTO weights (
        id, source, source_key, weight_grams, occurred_at, recorded_at, source_job_id, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `).bind(
      id,
      input.source,
      input.sourceKey,
      Math.round(input.weightKg * 1_000),
      input.occurredAt,
      now,
      sourceJobId ?? null,
    ).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async getFinanceSummary(): Promise<Result<FinanceSummary, AppError>> {
    type TotalsRow = { readonly incomeYen: number; readonly expenseYen: number };
    type CategoryRow = { readonly category: string; readonly amountYen: number };
    type PaymentRow = { readonly paymentMethod: string; readonly amountYen: number };
    type AssetRow = { readonly assetKind: string; readonly amountYen: number };
    type TransactionRow = FinanceSummary["transactions"][number];
    type AdjustmentRow = FinanceSummary["adjustments"][number];
    type BalanceHistoryRow = { readonly accountName: string; readonly assetKind: string; readonly amountYen: number; readonly occurredAt: string };
    const result = await safeTry(() => this.#database.batch([
      this.#database.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN ft.kind = 'income' THEN ft.amount_yen + COALESCE(a.delta, 0) ELSE 0 END), 0) AS incomeYen,
          COALESCE(SUM(CASE WHEN ft.kind = 'expense' THEN ft.amount_yen + COALESCE(a.delta, 0) ELSE 0 END), 0) AS expenseYen
        FROM finance_transactions ft
        LEFT JOIN (
          SELECT transaction_id, SUM(amount_delta_yen) AS delta
          FROM finance_adjustments GROUP BY transaction_id
        ) a ON a.transaction_id = ft.id
        WHERE ft.deleted_at IS NULL
      `),
      this.#database.prepare(`
        SELECT ft.category, SUM(ft.amount_yen + COALESCE(a.delta, 0)) AS amountYen
        FROM finance_transactions ft
        LEFT JOIN (
          SELECT transaction_id, SUM(amount_delta_yen) AS delta
          FROM finance_adjustments GROUP BY transaction_id
        ) a ON a.transaction_id = ft.id
        WHERE ft.deleted_at IS NULL AND ft.kind = 'expense'
        GROUP BY ft.category ORDER BY amountYen DESC
      `),
      this.#database.prepare(`
        SELECT ft.payment_method AS paymentMethod,
               SUM(ft.amount_yen + COALESCE(a.delta, 0)) AS amountYen
        FROM finance_transactions ft
        LEFT JOIN (
          SELECT transaction_id, SUM(amount_delta_yen) AS delta
          FROM finance_adjustments GROUP BY transaction_id
        ) a ON a.transaction_id = ft.id
        WHERE ft.deleted_at IS NULL AND ft.kind = 'expense'
        GROUP BY ft.payment_method ORDER BY amountYen DESC
      `),
      this.#database.prepare(`
        SELECT asset_kind AS assetKind, SUM(amount_yen) AS amountYen
        FROM asset_balances current
        WHERE occurred_at = (
          SELECT MAX(latest.occurred_at) FROM asset_balances latest
          WHERE latest.account_name = current.account_name
        )
        GROUP BY asset_kind ORDER BY amountYen DESC
      `),
      this.#database.prepare(`
        SELECT ft.id, ft.kind, ft.amount_yen AS amountYen,
               ft.amount_yen + COALESCE(a.delta, 0) AS adjustedAmountYen,
               ft.category, ft.payment_method AS paymentMethod, ft.payee,
               ft.occurred_at AS occurredAt
        FROM finance_transactions ft
        LEFT JOIN (
          SELECT transaction_id, SUM(amount_delta_yen) AS delta
          FROM finance_adjustments GROUP BY transaction_id
        ) a ON a.transaction_id = ft.id
        WHERE ft.deleted_at IS NULL
        ORDER BY ft.occurred_at DESC
        LIMIT 1000
      `),
      this.#database.prepare(`
        SELECT id, transaction_id AS transactionId, amount_delta_yen AS amountDeltaYen,
               reason, created_at AS createdAt
        FROM finance_adjustments ORDER BY created_at DESC LIMIT 500
      `),
      this.#database.prepare(`
        SELECT account_name AS accountName, asset_kind AS assetKind,
               amount_yen AS amountYen, occurred_at AS occurredAt
        FROM asset_balances ORDER BY occurred_at ASC, recorded_at ASC
      `),
    ]));
    if (!result.ok) return err(appError.storage(result.error));
    const totals = result.value[0]?.results[0] as TotalsRow | undefined;
    const byCategory = result.value[1]?.results as ReadonlyArray<CategoryRow> | undefined;
    const byPaymentMethod = result.value[2]?.results as ReadonlyArray<PaymentRow> | undefined;
    const assetAllocation = result.value[3]?.results as ReadonlyArray<AssetRow> | undefined;
    const transactions = result.value[4]?.results as ReadonlyArray<TransactionRow> | undefined;
    const adjustments = result.value[5]?.results as ReadonlyArray<AdjustmentRow> | undefined;
    const balanceHistoryRows = result.value[6]?.results as ReadonlyArray<BalanceHistoryRow> | undefined;
    if (totals === undefined || byCategory === undefined || byPaymentMethod === undefined || assetAllocation === undefined || transactions === undefined || adjustments === undefined || balanceHistoryRows === undefined) {
      return err(appError.storage("finance aggregate returned incomplete result"));
    }
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
    const result = await safeTry(() => this.#database.prepare(`
      INSERT OR IGNORE INTO finance_transactions (
        id, source, source_transaction_id, kind, amount_yen, category, payment_method,
        payee, occurred_at, recorded_at, source_job_id, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).bind(
      id,
      input.source,
      input.sourceTransactionId,
      input.kind,
      input.amountYen,
      input.category,
      input.paymentMethod,
      input.payee,
      input.occurredAt,
      now,
      sourceJobId ?? null,
    ).run());
    const normalized = toStorageError(result);
    if (!normalized.ok) return normalized;
    return ok(undefined);
  }

  async createFinanceAdjustment(id: string, input: CreateFinanceAdjustmentInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      INSERT INTO finance_adjustments (id, transaction_id, amount_delta_yen, reason, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, input.transactionId, input.amountDeltaYen, input.reason, now).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async createAssetBalance(id: string, input: CreateAssetBalanceInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      INSERT INTO asset_balances (
        id, account_name, asset_kind, amount_yen, occurred_at, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, input.accountName, input.assetKind, input.amountYen, input.occurredAt, now).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async createNote(id: string, body: string, occurredAt: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      INSERT INTO notes (id, body, occurred_at, recorded_at) VALUES (?, ?, ?, ?)
    `).bind(id, body, occurredAt, now).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async listRepositories(): Promise<Result<ReadonlyArray<Repository>, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT id, name FROM repositories WHERE archived_at IS NULL ORDER BY name
    `).all<Repository>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.results);
  }

  async listSourceRepositoryMappings(): Promise<Result<ReadonlyArray<SourceRepositoryMapping>, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT m.connector, m.source_scope AS sourceScope, m.source_id AS sourceId,
             COALESCE(cs.source_label, m.source_id) AS sourceLabel,
             r.id AS repositoryId, r.name AS repositoryName
      FROM source_repository_mappings m
      JOIN repositories r ON r.id = m.repository_id AND r.archived_at IS NULL
      LEFT JOIN connector_states cs ON cs.connector = m.connector AND cs.source_id = m.source_id
      WHERE m.role = 'work'
      ORDER BY m.connector, sourceLabel
    `).all<SourceRepositoryMapping>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.results);
  }

  async getAgentJobContext(taskId: string, repositoryId: string): Promise<Result<AgentJobContext, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT t.id AS taskId, t.title AS taskTitle, t.description AS taskDescription,
             r.id AS repositoryId, r.name AS repositoryName, r.local_path AS repositoryPath
      FROM tasks t CROSS JOIN repositories r
      WHERE t.id = ? AND r.id = ? AND r.archived_at IS NULL
    `).bind(taskId, repositoryId).first<AgentJobContext>());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value === null) return err(appError.notFound("agent job のタスクまたはリポジトリが見つかりません。"));
    return ok(result.value);
  }

  async createRepository(id: string, name: string, localPath: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      INSERT OR IGNORE INTO repositories (id, name, local_path, archived_at, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?)
    `).bind(id, name, localPath, now, now).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async syncRepositories(input: SyncRepositoriesInput, ids: ReadonlyArray<string>, now: string): Promise<Result<number, AppError>> {
    const statements = [this.#database.prepare(`
      UPDATE repositories SET archived_at = ?, updated_at = ? WHERE archived_at IS NULL
    `).bind(now, now)];
    for (const [index, repository] of input.repositories.entries()) {
      statements.push(this.#database.prepare(`
        INSERT INTO repositories (id, name, local_path, archived_at, created_at, updated_at)
        VALUES (?, ?, ?, NULL, ?, ?)
        ON CONFLICT(local_path) DO UPDATE SET
          name = excluded.name,
          archived_at = NULL,
          updated_at = excluded.updated_at
      `).bind(ids[index], repository.name, repository.localPath, now, now));
    }
    const result = await safeTry(() => this.#database.batch(statements));
    if (!result.ok) return err(appError.storage(result.error));
    return ok(input.repositories.length);
  }

  async upsertSourceRepositoryMapping(input: UpsertSourceRepositoryMappingInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.batch([
      this.#database.prepare(`
        DELETE FROM source_repository_mappings
        WHERE connector = ? AND source_scope = ? AND source_id = ? AND role = 'work'
      `).bind(input.connector, input.sourceScope, input.sourceId),
      this.#database.prepare(`
        INSERT INTO source_repository_mappings (
          connector, source_scope, source_id, repository_id, role, created_at, updated_at
        )
        SELECT ?, ?, ?, id, 'work', ?, ?
        FROM repositories WHERE id = ? AND archived_at IS NULL
      `).bind(input.connector, input.sourceScope, input.sourceId, now, now, input.repositoryId),
    ]));
    if (!result.ok) return err(appError.storage(result.error));
    if ((result.value[1]?.meta.changes ?? 0) === 0) return err(appError.notFound("リポジトリが見つかりません。"));
    return ok(undefined);
  }

  async assignTaskRepository(taskId: string, repositoryId: string, role: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      INSERT OR REPLACE INTO task_repositories (task_id, repository_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(taskId, repositoryId, role, now).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async registerRunner(input: RegisterRunnerInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      INSERT INTO runners (
        id, name, last_heartbeat_at, token_expires_at, orca_status,
        last_error_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        name = excluded.name,
        last_heartbeat_at = excluded.last_heartbeat_at,
        token_expires_at = excluded.token_expires_at,
        orca_status = excluded.orca_status,
        updated_at = excluded.updated_at
    `).bind(input.runnerId, input.name, now, input.tokenExpiresAt, input.orcaStatus, now, now).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async heartbeatRunner(runnerId: string, orcaStatus: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      UPDATE runners SET last_heartbeat_at = ?, orca_status = ?, updated_at = ? WHERE id = ?
    `).bind(now, orcaStatus, now, runnerId).run());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value.meta.changes === 0) return err(appError.notFound("runner が登録されていません。"));
    return ok(undefined);
  }

  async listRunners(): Promise<Result<ReadonlyArray<RunnerHealth>, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT id, name, last_heartbeat_at AS lastHeartbeatAt,
             token_expires_at AS tokenExpiresAt, orca_status AS orcaStatus,
             last_error_code AS lastErrorCode
      FROM runners ORDER BY name
    `).all<RunnerHealth>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.results);
  }

  async listConnectorHealth(): Promise<Result<ReadonlyArray<ConnectorHealth>, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT connector, source_id AS sourceId, COALESCE(source_label, source_id) AS sourceLabel, watermark,
             last_success_at AS lastSuccessAt, next_run_at AS nextRunAt,
             last_error_code AS lastErrorCode
      FROM connector_states ORDER BY connector, source_id
    `).all<ConnectorHealth>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.results);
  }

  async listJobs(): Promise<Result<ReadonlyArray<Job>, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT ${jobColumns} FROM jobs ORDER BY created_at DESC LIMIT 100
    `).all<Job>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.results);
  }

  async createJob(input: { readonly id: string; readonly kind: string; readonly idempotencyKey: string; readonly payloadJson: string; readonly now: string; readonly deadlineAt?: string; readonly scheduleId?: string; readonly taskId?: string; readonly repositoryId?: string; readonly provider?: string }): Promise<Result<Job, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      INSERT OR IGNORE INTO jobs (
        id, schedule_id, task_id, repository_id, kind, status, idempotency_key,
        payload_json, runner_id, lease_token, lease_expires_at, last_heartbeat_at,
        progress_updated_at, cancel_requested_at, deadline_at, attempt, provider,
        summary, error_code, started_at, finished_at, created_at, updated_at
      ) SELECT ?, ?, ?, ?, ?, 'queued', ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, 0, ?, NULL, NULL, NULL, NULL, ?, ?
      WHERE ? != 'conversation_reply' OR NOT EXISTS (
        SELECT 1 FROM jobs
        WHERE kind = 'conversation_reply' AND status IN ('queued', 'claimed', 'running', 'waiting_for_user')
          AND json_extract(payload_json, '$.conversationId') = json_extract(?, '$.conversationId')
      )
    `).bind(
      input.id,
      input.scheduleId ?? null,
      input.taskId ?? null,
      input.repositoryId ?? null,
      input.kind,
      input.idempotencyKey,
      input.payloadJson,
      input.deadlineAt ?? null,
      input.provider ?? null,
      input.now,
      input.now,
      input.kind,
      input.payloadJson,
    ).run());
    if (!result.ok) return err(appError.storage(result.error));
    if (input.kind === "conversation_reply" && result.value.meta.changes === 0) {
      return err(appError.conflict("この会話への返信は既に実行待ち、または送信中です。"));
    }
    const selected = await this.getJobByIdempotencyKey(input.idempotencyKey);
    return selected;
  }

  async claimJob(runnerId: string, leaseToken: string, leaseExpiresAt: string, now: string): Promise<Result<Job | null, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      UPDATE jobs
      SET status = 'claimed', runner_id = ?, lease_token = ?, lease_expires_at = ?,
          last_heartbeat_at = ?, started_at = COALESCE(started_at, ?),
          attempt = attempt + 1, updated_at = ?
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'queued' AND cancel_requested_at IS NULL
          AND (deadline_at IS NULL OR julianday(deadline_at) > julianday(?))
        ORDER BY created_at ASC LIMIT 1
      ) AND status = 'queued'
      RETURNING ${jobColumns}
    `).bind(runnerId, leaseToken, leaseExpiresAt, now, now, now, now).first<Job>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value);
  }

  async heartbeatJob(jobId: string, input: JobHeartbeatInput, leaseExpiresAt: string, now: string): Promise<Result<{ readonly cancelRequested: boolean }, AppError>> {
    const status = input.waitingForUser ? "waiting_for_user" : "running";
    const result = await safeTry(() => this.#database.prepare(`
      UPDATE jobs
      SET status = ?, lease_expires_at = ?, last_heartbeat_at = ?,
          progress_updated_at = CASE WHEN ? IS NULL THEN progress_updated_at ELSE ? END,
          summary = CASE WHEN ? IS NULL THEN summary ELSE ? END,
          updated_at = ?
      WHERE id = ? AND runner_id = ? AND lease_token = ?
        AND status IN ('claimed', 'running', 'waiting_for_user')
        AND julianday(lease_expires_at) > julianday(?)
      RETURNING cancel_requested_at AS cancelRequestedAt
    `).bind(
      status,
      leaseExpiresAt,
      now,
      input.progressSummary,
      now,
      input.progressSummary,
      input.progressSummary,
      now,
      jobId,
      input.runnerId,
      input.leaseToken,
      now,
    ).first<{ readonly cancelRequestedAt: string | null }>());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value === null) return err(appError.invalidLease());
    return ok({ cancelRequested: result.value.cancelRequestedAt !== null });
  }

  async completeJob(jobId: string, input: CompleteJobInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      UPDATE jobs
      SET status = ?, summary = ?, error_code = ?, finished_at = ?,
          lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND runner_id = ? AND lease_token = ?
        AND status IN ('claimed', 'running', 'waiting_for_user')
        AND julianday(lease_expires_at) > julianday(?)
    `).bind(
      input.outcome,
      input.summary,
      input.errorCode,
      now,
      now,
      jobId,
      input.runnerId,
      input.leaseToken,
      now,
    ).run());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value.meta.changes === 0) return err(appError.invalidLease());
    return ok(undefined);
  }

  async completeJobByCapability(jobId: string, leaseToken: string, outcome: string, errorCode: string | null, summary: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      UPDATE jobs
      SET status = ?, summary = ?, error_code = ?, finished_at = ?,
          lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND lease_token = ?
        AND status IN ('claimed', 'running', 'waiting_for_user')
        AND julianday(lease_expires_at) > julianday(?)
    `).bind(outcome, summary, errorCode, now, now, jobId, leaseToken, now).run());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value.meta.changes === 0) return err(appError.invalidLease());
    return ok(undefined);
  }

  async requestJobCancel(jobId: string, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      UPDATE jobs SET cancel_requested_at = ?, updated_at = ?,
        status = CASE WHEN status = 'queued' THEN 'canceled' ELSE status END,
        finished_at = CASE WHEN status = 'queued' THEN ? ELSE finished_at END
      WHERE id = ? AND status IN ('queued', 'claimed', 'running', 'waiting_for_user')
    `).bind(now, now, now, jobId).run());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value.meta.changes === 0) return err(appError.notFound("中止できる job が見つかりません。"));
    return ok(undefined);
  }

  async validateLease(jobId: string, leaseToken: string): Promise<Result<boolean, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT COUNT(*) AS count FROM jobs
      WHERE id = ? AND lease_token = ? AND status IN ('claimed', 'running', 'waiting_for_user')
        AND julianday(lease_expires_at) > julianday('now')
    `).bind(jobId, leaseToken).first<{ readonly count: number }>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value?.count === 1);
  }

  async createSchedule(id: string, input: CreateScheduleInput, now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      INSERT INTO schedules (
        id, name, job_kind, payload_json, interval, timezone, next_run_at, coalescing,
        deadline_seconds, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      id,
      input.name,
      input.jobKind,
      JSON.stringify(input.payload ?? {}),
      input.interval,
      input.timezone,
      input.nextRunAt,
      input.coalescing,
      input.deadlineSeconds,
      now,
      now,
    ).run());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
  }

  async enqueueDueSchedules(now: string): Promise<Result<number, AppError>> {
    const result = await safeTry(() => this.#database.batch([
      this.#database.prepare(`
        INSERT OR IGNORE INTO jobs (
          id, schedule_id, task_id, repository_id, kind, status, idempotency_key,
          payload_json, runner_id, lease_token, lease_expires_at, last_heartbeat_at,
          progress_updated_at, cancel_requested_at, deadline_at, attempt, provider,
          summary, error_code, started_at, finished_at, created_at, updated_at
        )
        WITH RECURSIVE due_periods AS (
          SELECT id AS schedule_id, job_kind, payload_json, next_run_at AS period_start,
                 interval, coalescing, deadline_seconds
          FROM schedules WHERE enabled = 1 AND julianday(next_run_at) <= julianday(?)
          UNION ALL
          SELECT schedule_id, job_kind, payload_json,
                 CASE interval
                   WHEN 'hourly' THEN strftime('%Y-%m-%dT%H:%M:%fZ', period_start, '+1 hour')
                   WHEN 'daily' THEN strftime('%Y-%m-%dT%H:%M:%fZ', period_start, '+1 day')
                   ELSE strftime('%Y-%m-%dT%H:%M:%fZ', period_start, '+7 days')
                 END,
                 interval, coalescing, deadline_seconds
          FROM due_periods
          WHERE CASE interval
            WHEN 'hourly' THEN julianday(period_start, '+1 hour')
            WHEN 'daily' THEN julianday(period_start, '+1 day')
            ELSE julianday(period_start, '+7 days')
          END <= julianday(?)
        ), ranked_periods AS (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY schedule_id ORDER BY julianday(period_start) DESC
          ) AS period_rank FROM due_periods
        )
        SELECT lower(hex(randomblob(16))), due.schedule_id, NULL, NULL, due.job_kind,
               'queued', due.schedule_id || ':' || due.period_start, due.payload_json,
               NULL, NULL, NULL, NULL, NULL, NULL,
               strftime('%Y-%m-%dT%H:%M:%fZ', due.period_start, '+' || due.deadline_seconds || ' seconds'),
               0, NULL, NULL, NULL, NULL, NULL, ?, ?
        FROM ranked_periods due
        WHERE due.coalescing = 'queue_all' OR (due.period_rank = 1 AND NOT EXISTS (
          SELECT 1 FROM jobs pending
          WHERE pending.schedule_id = due.schedule_id
            AND pending.status IN ('queued', 'claimed', 'running', 'waiting_for_user')
        ))
      `).bind(now, now, now, now),
      this.#database.prepare(`
        WITH RECURSIVE future_runs AS (
          SELECT id, interval, next_run_at
          FROM schedules WHERE enabled = 1 AND julianday(next_run_at) <= julianday(?)
          UNION ALL
          SELECT id, interval,
                 CASE interval
                   WHEN 'hourly' THEN strftime('%Y-%m-%dT%H:%M:%fZ', next_run_at, '+1 hour')
                   WHEN 'daily' THEN strftime('%Y-%m-%dT%H:%M:%fZ', next_run_at, '+1 day')
                   ELSE strftime('%Y-%m-%dT%H:%M:%fZ', next_run_at, '+7 days')
                 END
          FROM future_runs WHERE julianday(next_run_at) <= julianday(?)
        ), next_values AS (
          SELECT id, MIN(next_run_at) AS next_run_at
          FROM future_runs WHERE julianday(next_run_at) > julianday(?) GROUP BY id
        )
        UPDATE schedules
        SET next_run_at = (SELECT next_run_at FROM next_values WHERE next_values.id = schedules.id),
            updated_at = ?
        WHERE id IN (SELECT id FROM next_values)
      `).bind(now, now, now, now),
      this.#database.prepare(`
        INSERT INTO system_state (key, value, updated_at) VALUES ('last_cron_success_at', ?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).bind(now, now),
    ]));
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value[0]?.meta.changes ?? 0);
  }

  async markExpiredAndLostJobs(now: string): Promise<Result<void, AppError>> {
    const result = await safeTry(() => this.#database.batch([
      this.#database.prepare(`
        UPDATE jobs SET status = 'expired', finished_at = ?, updated_at = ?
        WHERE status = 'queued' AND deadline_at IS NOT NULL AND julianday(deadline_at) <= julianday(?)
      `).bind(now, now, now),
      this.#database.prepare(`
        UPDATE jobs SET status = 'lost', finished_at = ?, error_code = 'lease_expired', updated_at = ?
        WHERE kind IN ('agent', 'github_promotion', 'conversation_reply') AND status IN ('claimed', 'running', 'waiting_for_user')
          AND julianday(lease_expires_at) <= julianday(?)
      `).bind(now, now, now),
      this.#database.prepare(`
        UPDATE jobs
        SET status = CASE WHEN cancel_requested_at IS NULL THEN 'queued' ELSE 'canceled' END,
            finished_at = CASE WHEN cancel_requested_at IS NULL THEN NULL ELSE ? END,
            runner_id = NULL, lease_token = NULL,
            lease_expires_at = NULL, error_code = 'previous_lease_expired', updated_at = ?
        WHERE kind NOT IN ('agent', 'github_promotion', 'conversation_reply') AND status IN ('claimed', 'running', 'waiting_for_user')
          AND julianday(lease_expires_at) <= julianday(?)
      `).bind(now, now, now),
    ]));
    if (!result.ok) return err(appError.storage(result.error));
    return ok(undefined);
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
    const result = await safeTry(() => this.#database.prepare(`
      SELECT ${taskColumns}
      FROM tasks t
      LEFT JOIN task_repositories tr ON tr.task_id = t.id AND tr.role = 'work'
      LEFT JOIN repositories r ON r.id = tr.repository_id AND r.archived_at IS NULL
      WHERE t.id = ?
    `).bind(id).first<Task>());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value === null) return err(appError.notFound("タスクが見つかりません。"));
    return ok(result.value);
  }

  private async getJobByIdempotencyKey(idempotencyKey: string): Promise<Result<Job, AppError>> {
    const result = await safeTry(() => this.#database.prepare(`
      SELECT ${jobColumns} FROM jobs WHERE idempotency_key = ?
    `).bind(idempotencyKey).first<Job>());
    if (!result.ok) return err(appError.storage(result.error));
    if (result.value === null) return err(appError.storage("job insert returned no row"));
    return ok(result.value);
  }
}
