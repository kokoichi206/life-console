export const taskAreas = ["work", "personal"] as const;
export type TaskArea = typeof taskAreas[number];

export const taskStatuses = ["inbox", "todo", "doing", "done", "canceled"] as const;
export type TaskStatus = typeof taskStatuses[number];

export const conversationClassifications = ["unprocessed", "task_candidate", "reference", "no_action"] as const;
export type ConversationClassification = typeof conversationClassifications[number];

export const connectorKinds = ["slack", "chatwork", "talknote", "gmail"] as const;
export type ConnectorKind = typeof connectorKinds[number];

export const repositoryRoles = ["work", "context", "default_work", "always_read"] as const;
export type RepositoryRole = typeof repositoryRoles[number];

export const sourceScopes = ["channel", "room"] as const;
export type SourceScope = typeof sourceScopes[number];

export const sourceMappingConnectors = ["slack", "chatwork"] as const;
export type SourceMappingConnector = typeof sourceMappingConnectors[number];

export const jobStatuses = ["queued", "claimed", "running", "waiting_for_user", "succeeded", "failed", "canceled", "lost", "expired", "skipped_precondition"] as const;
export type JobStatus = typeof jobStatuses[number];

export const jobKinds = ["slack_sync", "chatwork_sync", "gmail_sync", "talknote_sync", "reply_drafts", "conversation_reply", "weight_import", "weight_obsidian_export", "finance_import", "nutrition_analysis", "agent", "github_promotion", "backup", "repository_scan"] as const;
export type JobKind = typeof jobKinds[number];

export const agentProviders = ["codex", "claude"] as const;
export type AgentProvider = typeof agentProviders[number];

export const scheduleIntervals = ["hourly", "daily", "weekly"] as const;

export const scheduleCoalescingModes = ["skip_if_pending", "queue_all"] as const;

export const financeEntryKinds = ["income", "expense"] as const;

export const assetKinds = ["cash", "investment", "debt"] as const;

export const replyDraftStatuses = ["ready", "replied", "no_action", "needs_review"] as const;
export type ReplyDraftStatus = typeof replyDraftStatuses[number];

export const mealPhotoContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type MealPhotoContentType = typeof mealPhotoContentTypes[number];

export const weightSources = ["manual", "csv"] as const;

export const orcaStatuses = ["healthy", "unreachable", "unknown"] as const;
export type OrcaStatus = typeof orcaStatuses[number];

export const jobCompletionOutcomes = ["succeeded", "failed", "canceled", "skipped_precondition"] as const;
export type JobCompletionOutcome = typeof jobCompletionOutcomes[number];

export const agentExecutionModes = ["main_checkout", "new_worktree"] as const;

export const promotionTargets = ["github_issue", "github_project"] as const;

export const monitorServices = ["runner", "slack", "chatwork", "talknote", "gmail", "calendar", "orca"] as const;
export type MonitorService = typeof monitorServices[number];

export const monitorOutcomes = ["healthy", "auth_required", "permission_denied", "unavailable", "timeout", "invalid_response", "not_configured"] as const;
export type MonitorOutcome = typeof monitorOutcomes[number];

export const monitorNotificationKinds = ["alert", "recovery"] as const;
export type MonitorNotificationKind = typeof monitorNotificationKinds[number];

export const monitorNotificationStatuses = ["pending", "sending", "accepted", "expired", "canceled"] as const;

export const monitorDeliveryOutcomes = ["accepted", "expired", "failed"] as const;
export type MonitorDeliveryOutcome = typeof monitorDeliveryOutcomes[number];
