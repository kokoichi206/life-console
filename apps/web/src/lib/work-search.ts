import type { Conversation, ReplyDraft } from "@life-console/contracts";

export type WorkSearch = {
  readonly view?: "inbox" | "tasks";
  readonly service?: "all" | "gmail" | "slack" | "chatwork" | "talknote";
  readonly period?: "24h" | "3d" | "7d" | "all";
  readonly status?: "pending" | "draft" | "review" | "all";
  readonly conversationId?: string;
  readonly taskId?: string;
  readonly create?: boolean;
};

export const parseWorkSearch = (search: Record<string, unknown>): WorkSearch => ({
  ...(search.view === "inbox" || search.view === "tasks" ? { view: search.view } : {}),
  ...(["all", "gmail", "slack", "chatwork", "talknote"].includes(String(search.service)) ? { service: search.service as NonNullable<WorkSearch["service"]> } : {}),
  ...(["24h", "3d", "7d", "all"].includes(String(search.period)) ? { period: search.period as NonNullable<WorkSearch["period"]> } : {}),
  ...(["pending", "draft", "review", "all"].includes(String(search.status)) ? { status: search.status as NonNullable<WorkSearch["status"]> } : {}),
  ...(typeof search.conversationId === "string" ? { conversationId: search.conversationId } : {}),
  ...(typeof search.taskId === "string" ? { taskId: search.taskId } : {}),
  ...(search.create === true && search.view === undefined ? { view: "tasks", create: true } : {}),
});

export const replyStatusLabels = { ready: "下書きあり", needs_review: "確認待ち", replied: "返信済み", no_action: "返信不要" } as const;
export const serviceLabels = { gmail: "Gmail", slack: "Slack", chatwork: "Chatwork", talknote: "Talknote" } as const;

export const matchesWorkStatus = (conversation: Conversation, draft: ReplyDraft | undefined, status: NonNullable<WorkSearch["status"]>): boolean => {
  if (status === "all") return true;
  if (draft?.status === "replied" || draft?.status === "no_action") return false;
  if (status === "draft") return draft !== undefined && draft.body.trim().length > 0;
  if (status === "review") return draft?.status === "needs_review";
  return conversation.classification !== "no_action" && conversation.classification !== "reference";
};
