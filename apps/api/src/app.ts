import { zValidator } from "@hono/zod-validator";
import { pushEndpointInputSchema, pushSubscriptionSchema, assignRepositorySchema, agentReportSchema, claimJobSchema, classifyConversationSchema, completeJobSchema, createAgentJobSchema, createAssetBalanceSchema, createConnectorSyncSchema, createConversationReplySchema, createReplyDraftsSchema, editReplyDraftSchema, saveReplyDraftSchema, createFinanceAdjustmentSchema, createFinanceTransactionSchema, createMealSchema, createMealUploadSchema, createNoteSchema, createRepositorySchema, createScheduleSchema, createTaskSchema, createWeightSchema, importConversationsSchema, jobHeartbeatSchema, listConversationsQuerySchema, promoteTaskSchema, registerRunnerSchema, runnerHeartbeatSchema, syncRepositoriesSchema, upsertSourceRepositoryMappingSchema, updateTaskSchema, weightCsvRowSchema } from "@life-console/contracts";
import { err, type Result } from "@life-console/core";
import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

import { createLifeConsoleHandlers } from "./handlers/life-console-handlers";
import { D1LifeConsoleRepository } from "./repositories/d1-life-console-repository";
import { createPushSubscriptionRepository } from "./repositories/push-subscription-repository";
import { createWebPushRepository } from "./repositories/web-push-repository";
import type { AppError } from "./shared/app-error";
import { appError } from "./shared/app-error";
import { systemClock } from "./shared/clock";
import { parseApiEnvironment, type ApiEnvironment } from "./shared/environment";
import { cryptoIdGenerator } from "./shared/id-generator";
import { cloudLogger } from "./shared/logger";
import { createConversationUsecase } from "./usecases/conversation-usecase";
import { createDashboardUsecase } from "./usecases/dashboard-usecase";
import { createFinanceUsecase } from "./usecases/finance-usecase";
import { createHealthUsecase } from "./usecases/health-usecase";
import { createJobUsecase } from "./usecases/job-usecase";
import { createMealPhotoUsecase } from "./usecases/meal-photo-usecase";
import { createNoteUsecase } from "./usecases/note-usecase";
import { createPushNotificationUsecase } from "./usecases/push-notification-usecase";
import { createReplyDraftUsecase } from "./usecases/reply-draft-usecase";
import { createRepositoryUsecase } from "./usecases/repository-usecase";
import { createTaskUsecase } from "./usecases/task-usecase";

type HonoEnvironment = {
  Bindings: ApiEnvironment;
  Variables: { environment: ApiEnvironment };
};

const identifierParameterSchema = z.object({ id: z.string().min(1).max(128) });
const photoUploadQuerySchema = z.object({ token: z.string().uuid() });
const agentContextQuerySchema = z.object({
  taskId: z.string().min(1).max(128),
  repositoryId: z.string().min(1).max(128),
});
const jobReportParameterSchema = z.object({
  id: z.string().min(1).max(128),
  token: z.string().uuid(),
});

const createHandlers = (environment: ApiEnvironment) => {
  const repository = new D1LifeConsoleRepository(environment.DB);
  return createLifeConsoleHandlers({
    replyDrafts: createReplyDraftUsecase(repository, systemClock, cryptoIdGenerator),
    conversations: createConversationUsecase(repository, systemClock, cryptoIdGenerator),
    dashboard: createDashboardUsecase(repository),
    finance: createFinanceUsecase(repository, systemClock, cryptoIdGenerator),
    health: createHealthUsecase(repository, systemClock, cryptoIdGenerator),
    jobs: createJobUsecase(repository, systemClock, cryptoIdGenerator),
    mealPhotos: createMealPhotoUsecase(
      repository,
      environment.MEAL_PHOTOS,
      {
        mode: environment.PHOTO_UPLOAD_MODE,
        r2AccessKeyId: environment.R2_ACCESS_KEY_ID,
        r2AccountId: environment.R2_ACCOUNT_ID,
        r2BucketName: environment.R2_BUCKET_NAME,
        r2SecretAccessKey: environment.R2_SECRET_ACCESS_KEY,
      },
      systemClock,
      cryptoIdGenerator,
    ),
    notes: createNoteUsecase(repository, systemClock, cryptoIdGenerator),
    repositories: createRepositoryUsecase(repository, systemClock, cryptoIdGenerator),
    tasks: createTaskUsecase(repository, systemClock, cryptoIdGenerator),
  });
};

const createPushHandlers = (environment: ApiEnvironment) => createPushNotificationUsecase(
  createPushSubscriptionRepository(environment.DB),
  createWebPushRepository(environment.WEB_PUSH_PUBLIC_KEY === undefined
    ? null
    : {
        publicKey: environment.WEB_PUSH_PUBLIC_KEY,
        privateKey: environment.WEB_PUSH_PRIVATE_KEY!,
        subject: environment.WEB_PUSH_SUBJECT!,
      }),
  environment.WEB_PUSH_PUBLIC_KEY ?? null,
  systemClock,
);

const statusForError = (error: AppError): 400 | 401 | 403 | 404 | 409 | 500 | 502 => {
  switch (error.code) {
    case "validation_error":
      return 400;
    case "unauthorized":
      return 401;
    case "forbidden":
    case "invalid_lease":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "storage_error":
      return 500;
    case "upstream_error":
      return 502;
  }
};

const respond = <T>(context: Context<HonoEnvironment>, result: Result<T, AppError>) => {
  if (result.ok) return context.json({ data: result.value === undefined ? null : result.value });
  return context.json({
    error: {
      code: result.error.code,
      message: result.error.message,
    },
  }, statusForError(result.error));
};

const runnerAuthentication = createMiddleware<HonoEnvironment>(async (context, next) => {
  const authorization = context.req.header("Authorization");
  const expectedToken = context.get("environment").RUNNER_TOKEN ?? (context.get("environment").APP_ENV === "local" ? "local-runner-token" : undefined);
  if (expectedToken === undefined || authorization !== `Bearer ${expectedToken}`) {
    return respond(context, err(appError.unauthorized()));
  }
  return next();
});

const parseWeightCsv = (csv: string): Result<ReadonlyArray<z.infer<typeof createWeightSchema>>, AppError> => {
  const lines = csv.trim().split(/\r?\n/u);
  const header = lines[0];
  if (header !== "date,weight_kg,ma7_kg,window_samples") {
    return err(appError.validation("CSV header は date,weight_kg,ma7_kg,window_samples である必要があります。"));
  }
  const weights = lines.slice(1).map((line) => {
    const [date, weightKg] = line.split(",");
    const parsed = weightCsvRowSchema.safeParse({ date, weightKg: Number(weightKg) });
    if (!parsed.success) return null;
    return {
      source: "csv" as const,
      sourceKey: parsed.data.date,
      weightKg: parsed.data.weightKg,
      occurredAt: `${parsed.data.date}T00:00:00+09:00`,
    };
  });
  if (weights.some((weight) => weight === null)) {
    return err(appError.validation("CSV に不正な日付または体重があります。"));
  }
  return { ok: true, value: weights.filter((weight) => weight !== null) };
};

const app = new Hono<HonoEnvironment>();

app.onError((error, context) => {
  cloudLogger.error({
    event: "unhandled_request_error",
    requestId: context.req.header("cf-ray") ?? "local-request",
    timestamp: new Date().toISOString(),
  });
  return context.json({
    error: {
      code: "internal_error",
      message: "予期しないエラーが発生しました。",
    },
  }, 500);
});

app.use("/api/*", async (context, next) => {
  context.set("environment", parseApiEnvironment(context.env));
  await next();
});

app.use("/api/v1/runner/*", runnerAuthentication);

const _routes = app
  .get("/api/v1/push/configuration", (context) => respond(context, createPushHandlers(context.get("environment")).configuration()))
  .post("/api/v1/push/subscription/status", zValidator("json", pushEndpointInputSchema), async (context) => respond(context, await createPushHandlers(context.get("environment")).status(context.req.valid("json").endpoint)))
  .put("/api/v1/push/subscription", zValidator("json", pushSubscriptionSchema), async (context) => respond(context, await createPushHandlers(context.get("environment")).subscribe(context.req.valid("json"))))
  .delete("/api/v1/push/subscription", zValidator("json", pushEndpointInputSchema), async (context) => respond(context, await createPushHandlers(context.get("environment")).unsubscribe(context.req.valid("json").endpoint)))
  .post("/api/v1/push/test", zValidator("json", pushEndpointInputSchema), async (context) => respond(context, await createPushHandlers(context.get("environment")).sendTest(context.req.valid("json").endpoint)))
  .get("/api/v1/reply-drafts", async (context) => respond(context, await createHandlers(context.get("environment")).listReplyDrafts()))
  .post("/api/v1/reply-drafts/generate", zValidator("json", createReplyDraftsSchema), async (context) => respond(
    context, await createHandlers(context.get("environment")).generateReplyDrafts(context.req.valid("json")),
  ))
  .patch("/api/v1/reply-drafts/:id", zValidator("param", identifierParameterSchema), zValidator("json", editReplyDraftSchema), async (context) => respond(
    context, await createHandlers(context.get("environment")).editReplyDraft(context.req.valid("param").id, context.req.valid("json")),
  ))
  .get("/api/v1/runner/reply-candidates", zValidator("query", createReplyDraftsSchema), async (context) => respond(
    context, await createHandlers(context.get("environment")).replyCandidates(context.req.valid("query")),
  ))
  .post("/api/v1/runner/reply-drafts", zValidator("json", saveReplyDraftSchema), async (context) => respond(
    context, await createHandlers(context.get("environment")).saveReplyDraft(context.req.valid("json")),
  ))
  .get("/api/v1/health", (context) => context.json({ data: { status: "ok" as const } }))
  .get("/api/v1/dashboard", async (context) => respond(context, await createHandlers(context.get("environment")).dashboard()))
  .get("/api/v1/tasks", async (context) => respond(context, await createHandlers(context.get("environment")).listTasks()))
  .post("/api/v1/tasks", zValidator("json", createTaskSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).createTask(context.req.valid("json")));
  })
  .patch("/api/v1/tasks/:id", zValidator("param", identifierParameterSchema), zValidator("json", updateTaskSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).updateTask(
      context.req.valid("param").id,
      context.req.valid("json"),
    ));
  })
  .get("/api/v1/conversations", zValidator("query", listConversationsQuerySchema), async (context) => respond(
    context,
    await createHandlers(context.get("environment")).listConversations(context.req.valid("query")),
  ))
  .post("/api/v1/conversations/:id/classification", zValidator("param", identifierParameterSchema), zValidator("json", classifyConversationSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).classifyConversation(
      context.req.valid("param").id,
      context.req.valid("json").classification,
    ));
  })
  .post("/api/v1/conversations/:id/replies", zValidator("param", identifierParameterSchema), zValidator("json", createConversationReplySchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).createConversationReplyJob(
      context.req.valid("param").id,
      context.req.valid("json"),
    ));
  })
  .post("/api/v1/conversations/:id/tasks", zValidator("param", identifierParameterSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).createTaskFromConversation(context.req.valid("param").id));
  })
  .post("/api/v1/connectors/sync", zValidator("json", createConnectorSyncSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).createConnectorSyncJob(context.req.valid("json")));
  })
  .get("/api/v1/meals", async (context) => respond(context, await createHandlers(context.get("environment")).listMeals()))
  .post("/api/v1/meal-photos/upload", zValidator("json", createMealUploadSchema), async (context) => {
    const input = context.req.valid("json");
    return respond(context, await createHandlers(context.get("environment")).createMealPhotoUpload(
      input.clientId,
      input.contentType,
    ));
  })
  .put("/api/v1/meal-photos/:id/content", zValidator("param", identifierParameterSchema), zValidator("query", photoUploadQuerySchema), async (context) => {
    const body = context.req.raw.body;
    const contentType = context.req.header("Content-Type");
    if (body === null || contentType === undefined) return respond(context, err(appError.validation("写真データがありません。")));
    return respond(context, await createHandlers(context.get("environment")).uploadMealPhoto(
      context.req.valid("param").id,
      context.req.valid("query").token,
      contentType,
      body,
    ));
  })
  .get("/api/v1/meal-photos/:id/content", zValidator("param", identifierParameterSchema), async (context) => {
    const result = await createHandlers(context.get("environment")).readMealPhoto(context.req.valid("param").id);
    if (!result.ok) return respond(context, result);
    return new Response(result.value.body, {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Type": result.value.contentType,
        "ETag": result.value.etag,
      },
    });
  })
  .post("/api/v1/meals", zValidator("json", createMealSchema), async (context) => {
    const input = context.req.valid("json");
    const handlers = createHandlers(context.get("environment"));
    if (input.photoId !== null) {
      const confirmed = await handlers.confirmMealPhotoUploaded(input.photoId);
      if (!confirmed.ok) return respond(context, confirmed);
    }
    return respond(context, await handlers.createMeal(input));
  })
  .get("/api/v1/weights", async (context) => respond(context, await createHandlers(context.get("environment")).listWeights()))
  .post("/api/v1/weights", zValidator("json", createWeightSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).createWeight(context.req.valid("json")));
  })
  .post("/api/v1/weights/import", async (context) => {
    const parsed = parseWeightCsv(await context.req.text());
    if (!parsed.ok) return respond(context, parsed);
    return respond(context, await createHandlers(context.get("environment")).importWeights(parsed.value));
  })
  .get("/api/v1/finance/summary", async (context) => respond(context, await createHandlers(context.get("environment")).financeSummary()))
  .post("/api/v1/finance/transactions", zValidator("json", createFinanceTransactionSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).createFinanceTransaction(context.req.valid("json")));
  })
  .post("/api/v1/finance/adjustments", zValidator("json", createFinanceAdjustmentSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).createFinanceAdjustment(context.req.valid("json")));
  })
  .post("/api/v1/finance/asset-balances", zValidator("json", createAssetBalanceSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).createAssetBalance(context.req.valid("json")));
  })
  .post("/api/v1/notes", zValidator("json", createNoteSchema), async (context) => {
    const input = context.req.valid("json");
    return respond(context, await createHandlers(context.get("environment")).createNote(input.body, input.occurredAt));
  })
  .get("/api/v1/repositories", async (context) => respond(context, await createHandlers(context.get("environment")).listRepositories()))
  .post("/api/v1/repositories/sync", async (context) => respond(context, await createHandlers(context.get("environment")).createRepositorySyncJob()))
  .post("/api/v1/repositories", zValidator("json", createRepositorySchema), async (context) => {
    const input = context.req.valid("json");
    return respond(context, await createHandlers(context.get("environment")).createRepository(input.name, input.localPath));
  })
  .post("/api/v1/tasks/:id/repositories", zValidator("param", identifierParameterSchema), zValidator("json", assignRepositorySchema), async (context) => {
    const input = context.req.valid("json");
    return respond(context, await createHandlers(context.get("environment")).assignRepository(
      context.req.valid("param").id,
      input.repositoryId,
      input.role,
    ));
  })
  .get("/api/v1/source-repository-mappings", async (context) => respond(context, await createHandlers(context.get("environment")).listSourceRepositoryMappings()))
  .put("/api/v1/source-repository-mappings", zValidator("json", upsertSourceRepositoryMappingSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).upsertSourceRepositoryMapping(context.req.valid("json")));
  })
  .post("/api/v1/tasks/:id/agent-jobs", zValidator("param", identifierParameterSchema), zValidator("json", createAgentJobSchema.omit({ taskId: true })), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).createAgentJob({
      ...context.req.valid("json"),
      taskId: context.req.valid("param").id,
    }));
  })
  .post("/api/v1/tasks/:id/promotions", zValidator("param", identifierParameterSchema), zValidator("json", promoteTaskSchema), async (context) => {
    const input = context.req.valid("json");
    return respond(context, await createHandlers(context.get("environment")).createPromotionJob(
      context.req.valid("param").id,
      input.repositoryId,
      input.target,
    ));
  })
  .get("/api/v1/jobs", async (context) => respond(context, await createHandlers(context.get("environment")).listJobs()))
  .post("/api/v1/jobs/:id/cancel", zValidator("param", identifierParameterSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).cancelJob(context.req.valid("param").id));
  })
  .post("/api/v1/job-reports/:id/:token", zValidator("param", jobReportParameterSchema), zValidator("json", agentReportSchema), async (context) => {
    const parameters = context.req.valid("param");
    return respond(context, await createHandlers(context.get("environment")).reportJob(
      parameters.id,
      parameters.token,
      context.req.valid("json"),
    ));
  })
  .post("/api/v1/schedules", zValidator("json", createScheduleSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).createSchedule(context.req.valid("json")));
  })
  .get("/api/v1/runner/weights/export", async (context) => respond(context, await createHandlers(context.get("environment")).listWeightsForExport()))
  .get("/api/v1/runner/runners", async (context) => respond(context, await createHandlers(context.get("environment")).listRunners()))
  .post("/api/v1/runner/register", zValidator("json", registerRunnerSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).registerRunner(context.req.valid("json")));
  })
  .post("/api/v1/runner/heartbeat", zValidator("json", runnerHeartbeatSchema), async (context) => {
    const input = context.req.valid("json");
    return respond(context, await createHandlers(context.get("environment")).heartbeatRunner(input.runnerId, input.orcaStatus));
  })
  .post("/api/v1/runner/repositories/sync", zValidator("json", syncRepositoriesSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).syncRepositories(context.req.valid("json")));
  })
  .post("/api/v1/runner/jobs/claim", zValidator("json", claimJobSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).claimJob(context.req.valid("json").runnerId));
  })
  .post("/api/v1/runner/jobs/:id/heartbeat", zValidator("param", identifierParameterSchema), zValidator("json", jobHeartbeatSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).heartbeatJob(
      context.req.valid("param").id,
      context.req.valid("json"),
    ));
  })
  .post("/api/v1/runner/jobs/:id/complete", zValidator("param", identifierParameterSchema), zValidator("json", completeJobSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).completeJob(
      context.req.valid("param").id,
      context.req.valid("json"),
    ));
  })
  .get("/api/v1/runner/jobs/:id/lease/:token", async (context) => {
    return respond(context, await createHandlers(context.get("environment")).validateLease(
      context.req.param("id"),
      context.req.param("token"),
    ));
  })
  .get("/api/v1/runner/agent-context", zValidator("query", agentContextQuerySchema), async (context) => {
    const query = context.req.valid("query");
    return respond(context, await createHandlers(context.get("environment")).getAgentJobContext(query.taskId, query.repositoryId));
  })
  .post("/api/v1/runner/conversations/import", zValidator("json", importConversationsSchema), async (context) => {
    return respond(context, await createHandlers(context.get("environment")).importConversations(context.req.valid("json")));
  });

export type AppType = typeof _routes;
export { app, createHandlers };
