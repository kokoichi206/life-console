import type { ConversationUsecase } from "@api/usecases/conversation-usecase";
import type { DashboardUsecase } from "@api/usecases/dashboard-usecase";
import type { FinanceUsecase } from "@api/usecases/finance-usecase";
import type { HealthUsecase } from "@api/usecases/health-usecase";
import type { JobUsecase } from "@api/usecases/job-usecase";
import type { MealPhotoUsecase } from "@api/usecases/meal-photo-usecase";
import type { NoteUsecase } from "@api/usecases/note-usecase";
import type { ReplyDraftUsecase } from "@api/usecases/reply-draft-usecase";
import type { RepositoryUsecase } from "@api/usecases/repository-usecase";
import type { TaskUsecase } from "@api/usecases/task-usecase";
import type {
  WeightGoal,
  CompleteJobInput,
  CreateReplyDraftsInput,
  EditReplyDraftInput,
  SaveReplyDraftInput,
  CreateAgentJobInput,
  CreateAssetBalanceInput,
  CreateConnectorSyncInput,
  CreateConversationReplyInput,
  CreateFinanceAdjustmentInput,
  CreateFinanceTransactionInput,
  CreateMealInput,
  CreateScheduleInput,
  CreateTaskInput,
  CreateWeightInput,
  ImportConversationsInput,
  JobHeartbeatInput,
  ListConversationsInput,
  RegisterRunnerInput,
  SyncRepositoriesInput,
  UpsertSourceRepositoryMappingInput,
  UpdateTaskInput,
} from "@life-console/contracts";
import type { ConversationClassification, RepositoryRole, OrcaStatus, JobCompletionOutcome, MealPhotoContentType } from "@life-console/domain";

type Dependencies = {
  readonly replyDrafts: ReplyDraftUsecase;
  readonly conversations: ConversationUsecase;
  readonly dashboard: DashboardUsecase;
  readonly finance: FinanceUsecase;
  readonly health: HealthUsecase;
  readonly jobs: JobUsecase;
  readonly mealPhotos: MealPhotoUsecase;
  readonly notes: NoteUsecase;
  readonly repositories: RepositoryUsecase;
  readonly tasks: TaskUsecase;
};

export const createLifeConsoleHandlers = (dependencies: Dependencies) => ({
  listReplyDrafts: () => dependencies.replyDrafts.list(),
  replyCandidates: (input: CreateReplyDraftsInput) => dependencies.replyDrafts.candidates(input),
  saveReplyDraft: (input: SaveReplyDraftInput) => dependencies.replyDrafts.save(input),
  editReplyDraft: (id: string, input: EditReplyDraftInput) => dependencies.replyDrafts.edit(id, input),
  generateReplyDrafts: (input: CreateReplyDraftsInput) => dependencies.replyDrafts.generate(input),
  dashboard: () => dependencies.dashboard.get(),
  listTasks: () => dependencies.tasks.list(),
  createTask: (input: CreateTaskInput) => dependencies.tasks.create(input),
  updateTask: (id: string, input: UpdateTaskInput) => dependencies.tasks.update(id, input),
  listConversations: (input: ListConversationsInput) => dependencies.conversations.list(input),
  classifyConversation: (id: string, classification: ConversationClassification) => dependencies.conversations.classify(id, classification),
  createTaskFromConversation: (id: string) => dependencies.conversations.createTask(id),
  importConversations: (input: ImportConversationsInput) => dependencies.conversations.import(input),
  listMeals: (period?: { readonly from: string; readonly to: string }) => dependencies.health.listMeals(period),
  createMeal: (input: CreateMealInput) => dependencies.health.createMeal(input),
  createMealPhotoUpload: (clientId: string, contentType: MealPhotoContentType) => dependencies.mealPhotos.createUpload(clientId, contentType),
  confirmMealPhotoUploaded: (photoId: string) => dependencies.mealPhotos.confirmUploaded(photoId),
  uploadMealPhoto: (photoId: string, token: string, contentType: string, body: ReadableStream) => dependencies.mealPhotos.uploadViaWorker(photoId, token, contentType, body),
  readMealPhoto: (photoId: string) => dependencies.mealPhotos.read(photoId),
  getWeightGoal: () => dependencies.health.getWeightGoal(),
  saveWeightGoal: (input: WeightGoal | null) => dependencies.health.saveWeightGoal(input),
  listWeights: () => dependencies.health.listWeights(),
  listWeightsForExport: () => dependencies.health.listWeightsForExport(),
  createWeight: (input: CreateWeightInput) => dependencies.health.createWeight(input),
  importWeights: (inputs: ReadonlyArray<CreateWeightInput>) => dependencies.health.importWeights(inputs),
  financeSummary: () => dependencies.finance.summary(),
  createFinanceTransaction: (input: CreateFinanceTransactionInput) => dependencies.finance.createTransaction(input),
  createFinanceAdjustment: (input: CreateFinanceAdjustmentInput) => dependencies.finance.createAdjustment(input),
  createAssetBalance: (input: CreateAssetBalanceInput) => dependencies.finance.createAssetBalance(input),
  createNote: (body: string, occurredAt: string) => dependencies.notes.create(body, occurredAt),
  listRepositories: () => dependencies.repositories.list(),
  listSourceRepositoryMappings: () => dependencies.repositories.listMappings(),
  createRepository: (name: string, localPath: string) => dependencies.repositories.create(name, localPath),
  syncRepositories: (input: SyncRepositoriesInput) => dependencies.repositories.sync(input),
  upsertSourceRepositoryMapping: (input: UpsertSourceRepositoryMappingInput) => dependencies.repositories.upsertMapping(input),
  assignRepository: (taskId: string, repositoryId: string, role: RepositoryRole) => dependencies.repositories.assign(taskId, repositoryId, role),
  listJobs: () => dependencies.jobs.list(),
  listRunners: () => dependencies.jobs.listRunners(),
  registerRunner: (input: RegisterRunnerInput) => dependencies.jobs.registerRunner(input),
  heartbeatRunner: (runnerId: string, orcaStatus: OrcaStatus) => dependencies.jobs.heartbeatRunner(runnerId, orcaStatus),
  claimJob: (runnerId: string) => dependencies.jobs.claim(runnerId),
  heartbeatJob: (jobId: string, input: JobHeartbeatInput) => dependencies.jobs.heartbeat(jobId, input),
  completeJob: (jobId: string, input: CompleteJobInput) => dependencies.jobs.complete(jobId, input),
  reportJob: (jobId: string, leaseToken: string, input: { readonly outcome: JobCompletionOutcome; readonly errorCode: string | null; readonly summary: string }) => dependencies.jobs.report(jobId, leaseToken, input),
  validateLease: (jobId: string, leaseToken: string) => dependencies.jobs.validateLease(jobId, leaseToken),
  cancelJob: (jobId: string) => dependencies.jobs.cancel(jobId),
  createAgentJob: (input: CreateAgentJobInput) => dependencies.jobs.createAgentJob(input),
  createConnectorSyncJob: (input: CreateConnectorSyncInput) => dependencies.jobs.createConnectorSyncJob(input),
  createRepositorySyncJob: () => dependencies.jobs.createRepositorySyncJob(),
  createConversationReplyJob: (conversationId: string, input: CreateConversationReplyInput) => dependencies.jobs.createConversationReplyJob(conversationId, input),
  createPromotionJob: (taskId: string, repositoryId: string, target: string) => dependencies.jobs.createPromotionJob(taskId, repositoryId, target),
  createSchedule: (input: CreateScheduleInput) => dependencies.jobs.createSchedule(input),
  getAgentJobContext: (taskId: string, repositoryId: string) => dependencies.jobs.getAgentJobContext(taskId, repositoryId),
  runScheduledMaintenance: () => dependencies.jobs.runScheduledMaintenance(),
});
