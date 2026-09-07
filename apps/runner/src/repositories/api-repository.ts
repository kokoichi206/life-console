import { err, ok, safeTry, type Result, type Conversation, type CreateReplyDraftsInput, type SaveReplyDraftInput } from "@life-console/contracts";
import { z } from "zod";

import type { RunnerConfig } from "../config";
import { runnerError, type RunnerError } from "../errors";

const jobSchema = z.object({
  id: z.string(),
  taskId: z.string().nullable(),
  repositoryId: z.string().nullable(),
  kind: z.string(),
  status: z.string(),
  payloadJson: z.string(),
  leaseToken: z.string().nullable(),
  cancelRequestedAt: z.string().nullable(),
  provider: z.string().nullable(),
  summary: z.string().nullable(),
  errorCode: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const agentContextSchema = z.object({
  taskId: z.string(),
  taskTitle: z.string(),
  taskDescription: z.string(),
  repositoryId: z.string(),
  repositoryName: z.string(),
  repositoryPath: z.string(),
});

const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type RunnerJob = z.infer<typeof jobSchema>;
export type AgentJobContext = z.infer<typeof agentContextSchema>;

export interface ApiRepository {
  replyCandidates(input: CreateReplyDraftsInput): Promise<Result<Conversation[], RunnerError>>;
  saveReplyDraft(input: SaveReplyDraftInput): Promise<Result<null, RunnerError>>;
  registerRunner(orcaStatus: string): Promise<Result<void, RunnerError>>;
  heartbeatRunner(orcaStatus: string): Promise<Result<void, RunnerError>>;
  claimJob(): Promise<Result<RunnerJob | null, RunnerError>>;
  heartbeatJob(jobId: string, leaseToken: string, waitingForUser: boolean, progressSummary: string | null): Promise<Result<{ readonly cancelRequested: boolean }, RunnerError>>;
  completeJob(jobId: string, leaseToken: string, outcome: string, errorCode: string | null, summary: string): Promise<Result<void, RunnerError>>;
  validateLease(jobId: string, leaseToken: string): Promise<Result<boolean, RunnerError>>;
  importConversations(input: unknown): Promise<Result<number, RunnerError>>;
  importWeightCsv(csv: string): Promise<Result<number, RunnerError>>;
  createFinanceTransaction(input: unknown): Promise<Result<void, RunnerError>>;
  createRepository(input: { readonly name: string; readonly localPath: string }): Promise<Result<void, RunnerError>>;
  syncRepositories(input: ReadonlyArray<{ readonly name: string; readonly localPath: string }>): Promise<Result<number, RunnerError>>;
  getAgentContext(taskId: string, repositoryId: string): Promise<Result<AgentJobContext, RunnerError>>;
}

const responseEnvelope = <T extends z.ZodType>(schema: T) => z.object({ data: schema });

export const createApiRepository = (configuration: RunnerConfig): ApiRepository => {
  const request = async <T>(
    path: string,
    schema: z.ZodType<T>,
    init?: RequestInit,
  ): Promise<Result<T, RunnerError>> => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${configuration.runnerToken}`);
    if (configuration.cfAccessClientId !== undefined && configuration.cfAccessClientSecret !== undefined) {
      headers.set("CF-Access-Client-Id", configuration.cfAccessClientId);
      headers.set("CF-Access-Client-Secret", configuration.cfAccessClientSecret);
    }
    const fetched = await safeTry(() => fetch(`${configuration.apiUrl}${path}`, {
      ...init,
      headers,
      redirect: "manual",
    }));
    if (!fetched.ok) return err(runnerError("api_unreachable", "Life Console API に接続できません。", fetched.error));
    if (fetched.value.status >= 300 && fetched.value.status < 400) {
      return err(runnerError("access_session_required", "Cloudflare Access がログイン redirect を返しました。"));
    }
    const contentType = fetched.value.headers.get("Content-Type");
    if (contentType === null || !contentType.includes("application/json")) {
      return err(runnerError("invalid_api_content_type", "Life Console API が JSON 以外を返しました。"));
    }
    const json = await safeTry(() => fetched.value.json());
    if (!json.ok) return err(runnerError("invalid_api_json", "Life Console API の JSON を解析できません。", json.error));
    if (!fetched.value.ok) {
      const parsedError = apiErrorSchema.safeParse(json.value);
      if (!parsedError.success) return err(runnerError("invalid_api_error", "Life Console API のエラー形式が不正です。"));
      return err(runnerError(parsedError.data.error.code, parsedError.data.error.message));
    }
    const parsed = responseEnvelope(schema).safeParse(json.value);
    if (!parsed.success) return err(runnerError("invalid_api_response", "Life Console API の応答形式が不正です。", parsed.error));
    return ok(parsed.data.data);
  };

  const jsonRequest = <T>(path: string, schema: z.ZodType<T>, body: unknown) => request(path, schema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    replyCandidates: (input) => request(`/api/v1/runner/reply-candidates?${new URLSearchParams({ connector: input.connector, period: input.period,
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }) }).toString()}`, z.array(z.object({
      id: z.string(), connector: z.string(), sourceId: z.string(), externalMessageId: z.string(), authorLabel: z.string(),
      excerpt: z.string(), sourceUrl: z.string().nullable(), classification: z.string(), occurredAt: z.string(),
    }))),
    saveReplyDraft: (input) => jsonRequest("/api/v1/runner/reply-drafts", z.null(), input),
    registerRunner: async (orcaStatus) => {
      const result = await jsonRequest("/api/v1/runner/register", z.null(), {
        runnerId: configuration.runnerId,
        name: configuration.runnerName,
        tokenExpiresAt: null,
        orcaStatus,
      });
      if (!result.ok) return result;
      return ok(undefined);
    },
    async heartbeatRunner(orcaStatus) {
      const result = await jsonRequest("/api/v1/runner/heartbeat", z.null(), {
        runnerId: configuration.runnerId,
        orcaStatus,
      });
      if (!result.ok) return result;
      return ok(undefined);
    },
    claimJob: () => jsonRequest("/api/v1/runner/jobs/claim", jobSchema.nullable(), {
      runnerId: configuration.runnerId,
    }),
    heartbeatJob: (jobId, leaseToken, waitingForUser, progressSummary) => jsonRequest(
      `/api/v1/runner/jobs/${encodeURIComponent(jobId)}/heartbeat`,
      z.object({ cancelRequested: z.boolean() }),
      {
        runnerId: configuration.runnerId,
        leaseToken,
        progressSummary,
        waitingForUser,
      },
    ),
    async completeJob(jobId, leaseToken, outcome, errorCode, summary) {
      const result = await jsonRequest(
        `/api/v1/runner/jobs/${encodeURIComponent(jobId)}/complete`,
        z.null(),
        {
          runnerId: configuration.runnerId,
          leaseToken,
          outcome,
          errorCode,
          summary,
        },
      );
      if (!result.ok) return result;
      return ok(undefined);
    },
    validateLease: (jobId, leaseToken) => request(
      `/api/v1/runner/jobs/${encodeURIComponent(jobId)}/lease/${encodeURIComponent(leaseToken)}`,
      z.boolean(),
    ),
    importConversations: (input) => jsonRequest("/api/v1/runner/conversations/import", z.number(), input),
    importWeightCsv: (csv) => request("/api/v1/weights/import", z.number(), {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csv,
    }),
    async createFinanceTransaction(input) {
      const result = await jsonRequest("/api/v1/finance/transactions", z.null(), input);
      if (!result.ok) return result;
      return ok(undefined);
    },
    async createRepository(input) {
      const result = await jsonRequest("/api/v1/repositories", z.null(), input);
      if (!result.ok) return result;
      return ok(undefined);
    },
    syncRepositories: (repositories) => jsonRequest(
      "/api/v1/runner/repositories/sync",
      z.number(),
      { repositories },
    ),
    getAgentContext: (taskId, repositoryId) => request(
      `/api/v1/runner/agent-context?taskId=${encodeURIComponent(taskId)}&repositoryId=${encodeURIComponent(repositoryId)}`,
      agentContextSchema,
    ),
  };
};
