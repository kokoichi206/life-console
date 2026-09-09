import type { AppType } from "@life-console/api";
import type { MealNutrition, NutritionAnalysisPayload } from "@life-console/contracts";
import type { StravaActivityPage, StravaStatus, MonitorHistory, MonitoringSummary } from "@life-console/contracts";
import type {
  PushConfiguration,
  PushSubscriptionInput,
  Conversation,
  CreateConnectorSyncInput,
  CreateReplyDraftsInput,
  EditReplyDraftInput,
  ReplyDraft,
  Dashboard,
  FinanceSummary,
  Job,
  ListConversationsInput,
  Meal,
  Repository,
  SourceRepositoryMapping,
  Task,
  WeightPoint,
  WeightGoal,
} from "@life-console/contracts";
import { hc } from "hono/client";

const client = hc<AppType>("/");

type ErrorPayload = {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
};

type HttpResponse = {
  readonly headers: Headers;
  readonly redirected: boolean;
  readonly status: number;
  json(): Promise<unknown>;
};

const ensureJsonResponse = (response: HttpResponse): void => {
  const contentType = response.headers.get("Content-Type");
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    throw new Error("Cloudflare Access のセッションが切れています。再ログインしてください。");
  }
  if (contentType === null || !contentType.includes("application/json")) {
    throw new Error("API が JSON 以外を返しました。Cloudflare Access の状態を確認してください。");
  }
};

const unwrap = async <T>(response: HttpResponse): Promise<T> => {
  ensureJsonResponse(response);
  const payload = await response.json() as { readonly data?: T } | ErrorPayload;
  if ("error" in payload) throw new Error(payload.error.message);
  if (!("data" in payload)) throw new Error("API response に data がありません。");
  return payload.data as T;
};

export const api = {
  stravaStatus: async () => unwrap<StravaStatus>(await client.api.v1.strava.status.$get()),
  authorizeStrava: async () => unwrap<string>(await client.api.v1.strava.authorize.$post()),
  disconnectStrava: async () => unwrap<null>(await client.api.v1.strava.connection.$delete()),
  stravaActivities: async (from: string, to: string, page: number, signal: AbortSignal) => unwrap<StravaActivityPage>(await client.api.v1.strava.activities.$get({ query: { from, to, page: String(page) } }, { init: { signal } })),
  mealsForPeriod: async (from: string, to: string) => unwrap<ReadonlyArray<Meal>>(await client.api.v1.meals.$get({ query: { from, to } })),
  nutrition: async () => unwrap<ReadonlyArray<MealNutrition>>(await client.api.v1.nutrition.$get()),
  saveMealCalories: async (input: { readonly mealId: string; readonly caloriesKcal: number }) => unwrap<void>(await client.api.v1.nutrition[":id"].calories.$put({ param: { id: input.mealId }, json: { caloriesKcal: input.caloriesKcal } })),
  analyzeNutrition: async (input: NutritionAnalysisPayload) => unwrap<Job>(await client.api.v1.nutrition.analyze.$post({ json: input })),
  monitoring: async () => unwrap<MonitoringSummary>(await client.api.v1.monitoring.$get()),
  monitoringHistory: async (targetId?: string, before?: number) => unwrap<MonitorHistory[]>(await client.api.v1.monitoring.history.$get({ query: {
    ...(targetId === undefined ? {} : { targetId }), ...(before === undefined ? {} : { before: String(before) }),
  } })),
  pushConfiguration: async () => unwrap<PushConfiguration>(await client.api.v1.push.configuration.$get()),
  pushSubscriptionStatus: async (endpoint: string) => unwrap<{ readonly registered: boolean }>(await client.api.v1.push.subscription.status.$post({ json: { endpoint } })),
  subscribePush: async (input: PushSubscriptionInput) => unwrap<null>(await client.api.v1.push.subscription.$put({ json: input })),
  unsubscribePush: async (endpoint: string) => unwrap<null>(await client.api.v1.push.subscription.$delete({ json: { endpoint } })),
  testPush: async (endpoint: string) => unwrap<null>(await client.api.v1.push.test.$post({ json: { endpoint } })),
  replyDrafts: async () => unwrap<ReadonlyArray<ReplyDraft>>(await client.api.v1["reply-drafts"].$get()),
  generateReplyDrafts: async (input: CreateReplyDraftsInput) => unwrap<Job>(await client.api.v1["reply-drafts"].generate.$post({ json: input })),
  editReplyDraft: async (id: string, input: EditReplyDraftInput) => unwrap<null>(await client.api.v1["reply-drafts"][":id"].$patch({ param: { id }, json: input })),
  dashboard: async () => unwrap<Dashboard>(await client.api.v1.dashboard.$get()),
  tasks: async () => unwrap<ReadonlyArray<Task>>(await client.api.v1.tasks.$get()),
  createTask: async (input: Parameters<typeof client.api.v1.tasks.$post>[0]["json"]) => unwrap<Task>(await client.api.v1.tasks.$post({ json: input })),
  updateTask: async (id: string, input: Parameters<typeof client.api.v1.tasks[":id"]["$patch"]>[0]["json"]) => unwrap<Task>(await client.api.v1.tasks[":id"].$patch({ param: { id }, json: input })),
  conversations: async (input: ListConversationsInput) => unwrap<ReadonlyArray<Conversation>>(await client.api.v1.conversations.$get({ query: input })),
  classifyConversation: async (id: string, classification: "task_candidate" | "reference" | "no_action") => unwrap<null>(await client.api.v1.conversations[":id"].classification.$post({
    param: { id },
    json: { classification },
  })),
  createTaskFromConversation: async (id: string) => unwrap<Task>(await client.api.v1.conversations[":id"].tasks.$post({ param: { id } })),
  replyConversation: async (id: string, body: string) => unwrap<Job>(await client.api.v1.conversations[":id"].replies.$post({
    param: { id },
    json: { body },
  })),
  syncConnector: async (connector: CreateConnectorSyncInput["connector"]) => unwrap<Job>(await client.api.v1.connectors.sync.$post({
    json: { connector },
  })),
  meals: async () => unwrap<ReadonlyArray<Meal>>(await client.api.v1.meals.$get({ query: {} })),
  createMealUpload: async (input: { readonly clientId: string; readonly contentType: "image/jpeg" | "image/png" | "image/webp" }) => unwrap<{ readonly photoId: string; readonly uploadUrl: string; readonly expiresAt: string; readonly requiredHeaders: Readonly<Record<string, string>> }>(await client.api.v1["meal-photos"].upload.$post({ json: input })),
  createMeal: async (input: Parameters<typeof client.api.v1.meals.$post>[0]["json"]) => unwrap<Meal>(await client.api.v1.meals.$post({ json: input })),
  weightGoal: async () => unwrap<WeightGoal | null>(await client.api.v1["weight-goal"].$get()),
  saveWeightGoal: async (input: WeightGoal | null) => unwrap<null>(await client.api.v1["weight-goal"].$put({ json: input })),
  weights: async () => unwrap<ReadonlyArray<WeightPoint>>(await client.api.v1.weights.$get()),
  createWeight: async (input: Parameters<typeof client.api.v1.weights.$post>[0]["json"]) => unwrap<null>(await client.api.v1.weights.$post({ json: input })),
  importWeightCsv: async (csv: string) => unwrap<number>(await fetch("/api/v1/weights/import", {
    method: "POST",
    headers: { "Content-Type": "text/csv" },
    body: csv,
  })),
  financeSummary: async () => unwrap<FinanceSummary>(await client.api.v1.finance.summary.$get()),
  createFinanceTransaction: async (input: Parameters<typeof client.api.v1.finance.transactions.$post>[0]["json"]) => unwrap<null>(await client.api.v1.finance.transactions.$post({ json: input })),
  createFinanceAdjustment: async (input: Parameters<typeof client.api.v1.finance.adjustments.$post>[0]["json"]) => unwrap<null>(await client.api.v1.finance.adjustments.$post({ json: input })),
  createAssetBalance: async (input: Parameters<typeof client.api.v1.finance["asset-balances"]["$post"]>[0]["json"]) => unwrap<null>(await client.api.v1.finance["asset-balances"].$post({ json: input })),
  createNote: async (input: Parameters<typeof client.api.v1.notes.$post>[0]["json"]) => unwrap<null>(await client.api.v1.notes.$post({ json: input })),
  repositories: async () => unwrap<ReadonlyArray<Repository>>(await client.api.v1.repositories.$get()),
  syncRepositories: async () => unwrap<Job>(await client.api.v1.repositories.sync.$post()),
  sourceRepositoryMappings: async () => unwrap<ReadonlyArray<SourceRepositoryMapping>>(await client.api.v1["source-repository-mappings"].$get()),
  upsertSourceRepositoryMapping: async (input: Parameters<typeof client.api.v1["source-repository-mappings"]["$put"]>[0]["json"]) => unwrap<null>(await client.api.v1["source-repository-mappings"].$put({ json: input })),
  jobs: async () => unwrap<ReadonlyArray<Job>>(await client.api.v1.jobs.$get()),
  createAgentJob: async (taskId: string, input: { readonly repositoryId: string; readonly provider: "codex" | "claude"; readonly executionMode: "main_checkout" | "new_worktree" }) => unwrap<Job>(await client.api.v1.tasks[":id"]["agent-jobs"].$post({
    param: { id: taskId },
    json: input,
  })),
  promoteTask: async (taskId: string, input: { readonly repositoryId: string; readonly target: "github_issue" | "github_project" }) => unwrap<Job>(await client.api.v1.tasks[":id"].promotions.$post({
    param: { id: taskId },
    json: input,
  })),
  cancelJob: async (id: string) => unwrap<null>(await client.api.v1.jobs[":id"].cancel.$post({ param: { id } })),
};
