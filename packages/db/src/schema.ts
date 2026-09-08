import type { MonitorOutcome, MonitorService, ReplyDraft, UpsertSourceRepositoryMappingInput } from "@life-console/contracts";
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(),
  dueAt: text("due_at"),
  completedAt: text("completed_at"),
  conversationId: text("conversation_id"),
  ...timestamps,
}, (table) => [
  index("tasks_status_due_idx").on(table.status, table.dueAt),
  uniqueIndex("tasks_conversation_uidx").on(table.conversationId),
]);

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  connector: text("connector").notNull(),
  sourceId: text("source_id").notNull(),
  externalMessageId: text("external_message_id").notNull(),
  authorLabel: text("author_label").notNull(),
  excerpt: text("excerpt").notNull(),
  sourceUrl: text("source_url"),
  classification: text("classification").notNull(),
  occurredAt: text("occurred_at").notNull(),
  recordedAt: text("recorded_at").notNull(),
}, (table) => [uniqueIndex("conversations_external_uidx").on(table.connector, table.sourceId, table.externalMessageId)]);

export const replyDrafts = sqliteTable("reply_drafts", {
  conversationId: text("conversation_id").primaryKey().references(() => conversations.id),
  status: text("status").$type<ReplyDraft["status"]>().notNull(),
  body: text("body").notNull(),
  reason: text("reason").notNull(),
  replyEvidenceId: text("reply_evidence_id"),
  checkedAt: text("checked_at").notNull(),
  editedAt: text("edited_at"),
  updatedAt: text("updated_at").notNull(),
});

export const connectorStates = sqliteTable("connector_states", {
  connector: text("connector").notNull(),
  sourceId: text("source_id").notNull(),
  sourceLabel: text("source_label"),
  watermark: text("watermark"),
  lastSuccessAt: text("last_success_at"),
  nextRunAt: text("next_run_at"),
  lastErrorCode: text("last_error_code"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.connector, table.sourceId] })]);

export const repositories = sqliteTable("repositories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  localPath: text("local_path").notNull(),
  archivedAt: text("archived_at"),
  ...timestamps,
}, (table) => [uniqueIndex("repositories_path_uidx").on(table.localPath)]);

export const taskRepositories = sqliteTable("task_repositories", {
  taskId: text("task_id").notNull(),
  repositoryId: text("repository_id").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.taskId, table.repositoryId, table.role] })]);

export const sourceRepositoryMappings = sqliteTable("source_repository_mappings", {
  connector: text("connector").$type<UpsertSourceRepositoryMappingInput["connector"]>().notNull(),
  sourceScope: text("source_scope").$type<UpsertSourceRepositoryMappingInput["sourceScope"]>().notNull(),
  sourceId: text("source_id").notNull(),
  repositoryId: text("repository_id").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.connector, table.sourceScope, table.sourceId, table.repositoryId, table.role] })]);

export const mealPhotos = sqliteTable("meal_photos", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  uploadTokenHash: text("upload_token_hash").notNull(),
  uploadExpiresAt: text("upload_expires_at").notNull(),
  uploadedAt: text("uploaded_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("meal_photos_client_uidx").on(table.clientId)]);

export const meals = sqliteTable("meals", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  photoId: text("photo_id"),
  memo: text("memo").notNull(),
  mealKind: text("meal_kind").notNull(),
  occurredAt: text("occurred_at").notNull(),
  recordedAt: text("recorded_at").notNull(),
  tagsJson: text("tags_json").notNull(),
  deletedAt: text("deleted_at"),
}, (table) => [uniqueIndex("meals_client_uidx").on(table.clientId)]);

export const nutritionEstimates = sqliteTable("nutrition_estimates", {
  id: text("id").primaryKey(),
  mealId: text("meal_id").notNull(),
  sourceJobId: text("source_job_id"),
  model: text("model").notNull(),
  analyzedAt: text("analyzed_at").notNull(),
  inputHash: text("input_hash").notNull(),
  caloriesKcal: integer("calories_kcal").notNull(),
  proteinGrams: integer("protein_grams").notNull(),
  fatGrams: integer("fat_grams").notNull(),
  carbohydrateGrams: integer("carbohydrate_grams").notNull(),
  createdAt: text("created_at").notNull(),
});

export const weights = sqliteTable("weights", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  sourceKey: text("source_key").notNull(),
  weightGrams: integer("weight_grams").notNull(),
  occurredAt: text("occurred_at").notNull(),
  recordedAt: text("recorded_at").notNull(),
  sourceJobId: text("source_job_id"),
  deletedAt: text("deleted_at"),
}, (table) => [uniqueIndex("weights_source_uidx").on(table.source, table.sourceKey)]);

export const financeTransactions = sqliteTable("finance_transactions", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  sourceTransactionId: text("source_transaction_id").notNull(),
  kind: text("kind").notNull(),
  amountYen: integer("amount_yen").notNull(),
  category: text("category").notNull(),
  paymentMethod: text("payment_method").notNull(),
  payee: text("payee").notNull(),
  occurredAt: text("occurred_at").notNull(),
  recordedAt: text("recorded_at").notNull(),
  sourceJobId: text("source_job_id"),
  deletedAt: text("deleted_at"),
}, (table) => [uniqueIndex("finance_source_uidx").on(table.source, table.sourceTransactionId)]);

export const financeAdjustments = sqliteTable("finance_adjustments", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull(),
  amountDeltaYen: integer("amount_delta_yen").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
});

export const assetBalances = sqliteTable("asset_balances", {
  id: text("id").primaryKey(),
  accountName: text("account_name").notNull(),
  assetKind: text("asset_kind").notNull(),
  amountYen: integer("amount_yen").notNull(),
  occurredAt: text("occurred_at").notNull(),
  recordedAt: text("recorded_at").notNull(),
});

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  body: text("body").notNull(),
  occurredAt: text("occurred_at").notNull(),
  recordedAt: text("recorded_at").notNull(),
});

export const runners = sqliteTable("runners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  lastHeartbeatAt: text("last_heartbeat_at").notNull(),
  tokenExpiresAt: text("token_expires_at"),
  orcaStatus: text("orca_status").notNull(),
  lastErrorCode: text("last_error_code"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  jobKind: text("job_kind").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  interval: text("interval").notNull(),
  timezone: text("timezone").notNull(),
  nextRunAt: text("next_run_at").notNull(),
  coalescing: text("coalescing").notNull(),
  deadlineSeconds: integer("deadline_seconds").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("schedules_due_idx").on(table.enabled, table.nextRunAt)]);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  scheduleId: text("schedule_id"),
  taskId: text("task_id"),
  repositoryId: text("repository_id"),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  payloadJson: text("payload_json").notNull(),
  runnerId: text("runner_id"),
  leaseToken: text("lease_token"),
  leaseExpiresAt: text("lease_expires_at"),
  lastHeartbeatAt: text("last_heartbeat_at"),
  progressUpdatedAt: text("progress_updated_at"),
  cancelRequestedAt: text("cancel_requested_at"),
  deadlineAt: text("deadline_at"),
  attempt: integer("attempt").notNull(),
  provider: text("provider"),
  summary: text("summary"),
  errorCode: text("error_code"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("jobs_idempotency_uidx").on(table.idempotencyKey),
  index("jobs_claim_idx").on(table.status, table.createdAt),
]);

export const promotions = sqliteTable("promotions", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  target: text("target").notNull(),
  externalUrl: text("external_url"),
  externalId: text("external_id"),
  sourceJobId: text("source_job_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const systemState = sqliteTable("system_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const monitorTargets = sqliteTable("monitor_targets", {
  id: text("id").primaryKey(), runnerId: text("runner_id").notNull(), service: text("service").$type<MonitorService>().notNull(), account: text("account").notNull(),
  registeredAt: text("registered_at").notNull(), receivedAt: text("received_at"), outcome: text("outcome").$type<MonitorOutcome>(),
  failures: integer("failures").notNull().default(0), revision: integer("revision").notNull().default(0),
});
export const monitorObservations = sqliteTable("monitor_observations", {
  sequence: integer("sequence").primaryKey({ autoIncrement: true }), id: text("id").notNull(), targetId: text("target_id").notNull(),
  observedAt: text("observed_at").notNull(), receivedAt: text("received_at").notNull(), outcome: text("outcome").$type<MonitorOutcome>().notNull(), historical: integer("historical").notNull(),
}, (table) => [uniqueIndex("monitor_event_uidx").on(table.id), index("monitor_history_idx").on(table.targetId, table.sequence)]);
export const monitorIncidents = sqliteTable("monitor_incidents", {
  id: text("id").primaryKey(), targetId: text("target_id").notNull(), openedAt: text("opened_at").notNull(), resolvedAt: text("resolved_at"),
  reason: text("reason").notNull(),
}, (table) => [uniqueIndex("monitor_open_incident_uidx").on(table.targetId).where(sql`resolved_at IS NULL`)]);
export const monitorNotifications = sqliteTable("monitor_notifications", {
  id: text("id").primaryKey(), incidentId: text("incident_id").notNull(), endpoint: text("endpoint").notNull(),
  kind: text("kind").notNull(), slot: integer("slot").notNull(), body: text("body").notNull(),
  status: text("status").notNull(), attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: text("next_attempt_at").notNull(), leaseToken: text("lease_token"), leaseExpiresAt: text("lease_expires_at"),
  acceptedAt: text("accepted_at"), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("monitor_delivery_uidx").on(table.incidentId, table.kind, table.slot, table.endpoint), index("monitor_delivery_due_idx").on(table.status, table.nextAttemptAt)]);
export const monitorDeliveryAttempts = sqliteTable("monitor_delivery_attempts", {
  id: text("id").primaryKey(), notificationId: text("notification_id").notNull(), startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"), outcome: text("outcome"),
});
export const jobHeartbeatObservations = sqliteTable("job_heartbeat_observations", {
  id: integer("id").primaryKey({ autoIncrement: true }), jobId: text("job_id").notNull(), runnerId: text("runner_id").notNull(),
  receivedAt: text("received_at").notNull(), accepted: integer("accepted").notNull(),
});

export const weightGoal = sqliteTable("weight_goal", {
  id: integer("id").primaryKey(),
  startWeightGrams: integer("start_weight_grams").notNull(),
  targetWeightGrams: integer("target_weight_grams").notNull(),
  targetDate: text("target_date"),
});

export const stravaConnection = sqliteTable("strava_connection", {
  id: integer("id").primaryKey(),
  credentials: text("credentials"),
  leaseToken: text("lease_token"),
  leaseExpiresAt: integer("lease_expires_at"),
});
