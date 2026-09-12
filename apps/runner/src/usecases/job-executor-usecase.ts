import { nutritionAnalysisPayloadSchema, createReplyDraftsSchema, weightObsidianExportPayloadSchema, type ReplyDraftDecision } from "@life-console/contracts";
import { ok, safeTry, type Result } from "@life-console/core";
import type { RunnerConfig } from "@runner/config";
import { runnerError, type RunnerError } from "@runner/errors";
import type { ApiRepository, RunnerJob } from "@runner/repositories/api-repository";
import type { BackupRepository } from "@runner/repositories/backup-repository";
import type { CapabilityRepository } from "@runner/repositories/capability-repository";
import type { Connector, ConversationReplyRepository } from "@runner/repositories/connectors";
import type { ImportRepository } from "@runner/repositories/import-repository";
import type { NutritionGenerator } from "@runner/repositories/nutrition-generator";
import type { OrcaRepository } from "@runner/repositories/orca-repository";
import type { ReplyCalendarRepository } from "@runner/repositories/reply-calendar-repository";
import type { ReplyContextRepository } from "@runner/repositories/reply-context-repository";
import type { ReplyDraftGenerator } from "@runner/repositories/reply-draft-generator";
import type { RepositoryScanner } from "@runner/repositories/repository-scanner";
import { z } from "zod";

import type { WeightObsidianExportUsecase } from "./weight-obsidian-export-usecase";

const agentPayloadSchema = z.object({
  taskId: z.string(),
  repositoryId: z.string(),
  provider: z.enum(["codex", "claude"]),
  executionMode: z.enum(["main_checkout", "new_worktree"]),
});

const promotionPayloadSchema = z.object({
  taskId: z.string(),
  repositoryId: z.string(),
  target: z.enum(["github_issue", "github_project"]),
});

const conversationReplyPayloadSchema = z.object({
  body: z.string(),
  connector: z.enum(["slack", "chatwork"]),
  conversationId: z.string(),
  externalMessageId: z.string(),
  sourceId: z.string(),
});

export type JobExecution = {
  readonly errorCode: string | null;
  readonly outcome: "succeeded" | "failed" | "canceled" | "skipped_precondition";
  readonly reportedExternally: boolean;
  readonly summary: string;
};

type Dependencies = {
  readonly api: ApiRepository;
  readonly nutritionGenerator: NutritionGenerator;
  readonly weightExport: WeightObsidianExportUsecase;
  readonly backup: BackupRepository;
  readonly capabilities: CapabilityRepository;
  readonly chatwork: Connector;
  readonly configuration: RunnerConfig;
  readonly conversationReplies: ConversationReplyRepository;
  readonly imports: ImportRepository;
  readonly orca: OrcaRepository;
  readonly repositoryScanner: RepositoryScanner;
  readonly slack: Connector;
  readonly gmail: Connector;
  readonly talknote: Connector;
  readonly replyContexts: ReplyContextRepository;
  readonly replyDraftGenerator: ReplyDraftGenerator;
  readonly replyCalendar: ReplyCalendarRepository;
};

const parsePayload = async <T>(job: RunnerJob, schema: z.ZodType<T>): Promise<Result<T, RunnerError>> => {
  const json = await safeTry(() => JSON.parse(job.payloadJson) as unknown);
  if (!json.ok) return { ok: false, error: runnerError("invalid_job_payload", "job payload が JSON ではありません。", json.error) };
  const parsed = schema.safeParse(json.value);
  if (!parsed.success) return { ok: false, error: runnerError("invalid_job_payload", "job payload の形式が不正です。", parsed.error) };
  return ok(parsed.data);
};

const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const succeeded = (summary: string): JobExecution => ({
  errorCode: null,
  outcome: "succeeded",
  reportedExternally: false,
  summary,
});

const failed = (error: RunnerError): JobExecution => ({
  errorCode: error.code,
  outcome: error.code === "skipped_precondition" ? "skipped_precondition" : "failed",
  reportedExternally: false,
  summary: error.summary,
});

const agentPrompt = (
  taskTitle: string,
  taskDescription: string,
  reportCommand: string,
): string => `Life Console の次のタスクを実行してください。

タイトル: ${taskTitle}
説明:
${taskDescription}

調査や確認は自分で進め、本人の判断や文案への修正指示が必要なときは、次のコマンドを実行してください。
質問: ${reportCommand} ask "背景・確認した内容・本人に決めてほしいこと"
コマンドは Life Console に質問を保存し、本人が画面で回答するまで待ちます。標準出力の回答を読み、同じタスクを続けてください。
この質問への回答を、人への文章送信を一律に許可するものとして扱わないでください。

作業が完了したら、必ず次のどちらかを実行して明示的に報告してください。
成功: ${reportCommand} succeeded "個人情報を含まない240文字以内の要約"
失敗: ${reportCommand} failed "個人情報を含まない240文字以内の要約" error_code

プロセス終了や idle だけでは完了になりません。session と worktree は削除しないでください。`;

export interface JobExecutorUsecase {
  execute(job: RunnerJob, signal: AbortSignal): Promise<JobExecution>;
}

export const createJobExecutorUsecase = (dependencies: Dependencies): JobExecutorUsecase => {
  const executeConnector = async (connector: Connector, signal: AbortSignal): Promise<JobExecution> => {
    const fetched = await connector.fetch(signal);
    if (!fetched.ok) return failed(fetched.error);
    let importedCount = 0;
    for (const batch of fetched.value) {
      const imported = await dependencies.api.importConversations(batch);
      if (!imported.ok) return failed(imported.error);
      importedCount += imported.value;
    }
    return succeeded(`${String(importedCount)} 件の会話を同期しました（更新を含む）。`);
  };

  const executeAgent = async (
    job: RunnerJob,
    input: z.infer<typeof agentPayloadSchema>,
    signal: AbortSignal,
    promotionTarget?: string,
  ): Promise<JobExecution> => {
    if (job.leaseToken === null) return failed(runnerError("missing_lease_token", "agent job に lease token がありません。"));
    const context = await dependencies.api.getAgentContext(input.taskId, input.repositoryId);
    if (!context.ok) return failed(context.error);
    const capability = await dependencies.capabilities.createReportCommand(
      dependencies.configuration.apiUrl,
      job.id,
      job.leaseToken,
    );
    if (!capability.ok) return failed(capability.error);
    const basePrompt = agentPrompt(context.value.taskTitle, context.value.taskDescription, capability.value);
    const prompt = promotionTarget === undefined
      ? basePrompt
      : `${basePrompt}\n\nGitHub 昇格では ${dependencies.configuration.promotionSkillPath} を最初に読み、${promotionTarget} へ一方向に昇格してください。Life Console task ID は ${context.value.taskId} です。`;
    const launched = await dependencies.orca.launchAgent({
      executionMode: input.executionMode,
      jobId: job.id,
      prompt,
      provider: input.provider,
      repositoryPath: context.value.repositoryPath,
    }, signal);
    if (!launched.ok) return failed(launched.error);
    while (!signal.aborted) {
      await wait(5_000);
      const valid = await dependencies.api.validateLease(job.id, job.leaseToken);
      if (!valid.ok) return failed(valid.error);
      if (!valid.value) {
        return {
          errorCode: null,
          outcome: "succeeded",
          reportedExternally: true,
          summary: "agent が完了を報告しました。",
        };
      }
    }
    return {
      errorCode: null,
      outcome: "canceled",
      reportedExternally: false,
      summary: "中止要求を受け取りました。",
    };
  };

  return {
    async execute(job, signal) {
      switch (job.kind) {
        case "slack_sync":
          return executeConnector(dependencies.slack, signal);
        case "chatwork_sync":
          return executeConnector(dependencies.chatwork, signal);
        case "gmail_sync":
          return executeConnector(dependencies.gmail, signal);
        case "talknote_sync":
          return executeConnector(dependencies.talknote, signal);
        case "reply_drafts": {
          const payload = await parsePayload(job, createReplyDraftsSchema);
          if (!payload.ok) return failed(payload.error);
          if (job.leaseToken === null) return failed(runnerError("missing_lease_token", "下書き job に lease token がありません。"));
          if (payload.value.conversationId === undefined) {
            const synced = await executeConnector(dependencies[payload.value.connector], signal);
            if (synced.outcome !== "succeeded") return synced;
          }
          const candidates = await dependencies.api.replyCandidates(payload.value);
          if (!candidates.ok) return failed(candidates.error);
          const calendar = payload.value.calendar === undefined ? ok(undefined) : await dependencies.replyCalendar.read(payload.value.calendar, signal);
          if (!calendar.ok) return failed(calendar.error);
          const counts = { ready: 0, replied: 0, no_action: 0, needs_review: 0 };
          const leaseToken = job.leaseToken;
          let errorCount = 0;
          let bodyCount = 0;
          const processCandidate = async (conversation: typeof candidates.value[number]) => {
            const checkedAt = new Date().toISOString();
            const context = await dependencies.replyContexts.read(conversation, signal);
            const generated = context.ok
              ? await dependencies.replyDraftGenerator.generate(conversation, context.value, signal, calendar.value)
              : context;
            const decision: ReplyDraftDecision = generated.ok
              ? generated.value
              : {
                  status: "needs_review", body: "", reason: generated.error.summary, replyEvidenceId: null,
                };
            if (!generated.ok) errorCount += 1;
            const saved = await dependencies.api.saveReplyDraft({ conversationId: conversation.id, checkedAt,
              decision, jobId: job.id, leaseToken });
            if (!saved.ok) return saved;
            counts[decision.status] += 1;
            if (decision.body.trim().length > 0) bodyCount += 1;
            return ok(undefined);
          };
          for (let offset = 0; offset < candidates.value.length; offset += 3) {
            if (signal.aborted) return failed(runnerError("draft_generation_canceled", "下書きの作成を中止しました。"));
            const results = await Promise.all(candidates.value.slice(offset, offset + 3).map(processCandidate));
            for (const result of results) if (!result.ok) return failed(result.error);
          }
          const summary = `本文あり ${String(bodyCount)} 件（要確認を含む）、確認待ち ${String(counts.needs_review)} 件、返信済み ${String(counts.replied)} 件、返信不要 ${String(counts.no_action)} 件。`;
          return errorCount === 0 ? succeeded(summary) : failed(runnerError("draft_generation_partial", `${summary}うち ${String(errorCount)} 件で取得・生成に失敗しました。`));
        }
        case "conversation_reply": {
          const payload = await parsePayload(job, conversationReplyPayloadSchema);
          if (!payload.ok) return failed(payload.error);
          const sent = await dependencies.conversationReplies.send(payload.value, signal);
          return sent.ok ? succeeded("会話へ返信しました。") : failed(sent.error);
        }
        case "weight_obsidian_export": {
          const payload = await parsePayload(job, weightObsidianExportPayloadSchema);
          if (!payload.ok) return failed(payload.error);
          const exported = await dependencies.weightExport.execute(payload.value, signal);
          if (signal.aborted) return { errorCode: null, outcome: "canceled", reportedExternally: false, summary: "書き出しを中止しました。" };
          if (!exported.ok) return failed(exported.error);
          return succeeded(exported.value.changed
            ? `DB の ${String(exported.value.synchronizedDays)} 日分を反映し、過去分を含む ${String(exported.value.totalMeasuredDays)} 日分の体重グラフを更新しました。`
            : "体重 CSV とグラフ用データに変更はありません。");
        }
        case "weight_import": {
          if (dependencies.configuration.weightCsvPath === undefined) return failed(runnerError("skipped_precondition", "WEIGHT_CSV_PATH が未設定です。"));
          const read = await dependencies.imports.readWeightCsv(dependencies.configuration.weightCsvPath);
          if (!read.ok) return failed(read.error);
          const imported = await dependencies.api.importWeightCsv(read.value);
          return imported.ok ? succeeded(`${String(imported.value)} 件の体重を取り込みました。`) : failed(imported.error);
        }
        case "finance_import": {
          if (dependencies.configuration.financeCsvPath === undefined) return failed(runnerError("skipped_precondition", "FINANCE_CSV_PATH が未設定です。"));
          const read = await dependencies.imports.readFinanceCsv(dependencies.configuration.financeCsvPath);
          if (!read.ok) return failed(read.error);
          for (const transaction of read.value) {
            const created = await dependencies.api.createFinanceTransaction(transaction);
            if (!created.ok) return failed(created.error);
          }
          return succeeded(`${String(read.value.length)} 件の金融取引を取り込みました。`);
        }
        case "repository_scan": {
          const scanned = await dependencies.repositoryScanner.scan(signal);
          if (!scanned.ok) return failed(scanned.error);
          const synchronized = await dependencies.api.syncRepositories(scanned.value);
          return synchronized.ok
            ? succeeded(`${String(synchronized.value)} 件のリポジトリを同期しました。`)
            : failed(synchronized.error);
        }
        case "backup": {
          const backup = await dependencies.backup.backup(signal);
          return backup.ok ? succeeded("D1 dump と R2 object 一覧を保存しました。") : failed(backup.error);
        }
        case "agent": {
          const payload = await parsePayload(job, agentPayloadSchema);
          return payload.ok ? executeAgent(job, payload.value, signal) : failed(payload.error);
        }
        case "github_promotion": {
          const payload = await parsePayload(job, promotionPayloadSchema);
          if (!payload.ok) return failed(payload.error);
          return executeAgent(job, {
            taskId: payload.value.taskId,
            repositoryId: payload.value.repositoryId,
            provider: "codex",
            executionMode: "main_checkout",
          }, signal, payload.value.target);
        }
        case "nutrition_analysis": {
          const payload = await parsePayload(job, nutritionAnalysisPayloadSchema);
          if (!payload.ok) return failed(payload.error);
          if (job.leaseToken === null) return failed(runnerError("missing_lease_token", "栄養解析 job に lease token がありません。"));
          const candidates = await dependencies.api.nutritionCandidates(payload.value, signal);
          if (!candidates.ok) return failed(candidates.error);
          let analyzedCount = 0;
          const failures: RunnerError[] = [];
          for (const meal of candidates.value) {
            if (signal.aborted) return { outcome: "canceled", errorCode: null, reportedExternally: false, summary: "栄養解析を中止しました。" };
            const estimate = await dependencies.nutritionGenerator.generate(meal, signal);
            if (signal.aborted) return { outcome: "canceled", errorCode: null, reportedExternally: false, summary: "栄養解析を中止しました。" };
            if (!estimate.ok) {
              failures.push(estimate.error);
              continue;
            }
            const saved = await dependencies.api.saveNutritionEstimate({ ...estimate.value, mealId: meal.id, jobId: job.id, leaseToken: job.leaseToken }, signal);
            if (signal.aborted) return { outcome: "canceled", errorCode: null, reportedExternally: false, summary: "栄養解析を中止しました。" };
            if (!saved.ok) return failed(saved.error);
            analyzedCount += 1;
          }
          if (failures.length > 0) return failed(runnerError("nutrition_analysis_partial", `${String(analyzedCount)} 件を保存、${String(failures.length)} 件の解析に失敗しました。${failures[0]!.summary}`));
          return succeeded(`${String(analyzedCount)} 件の食事に推定カロリーと栄養素を保存しました。`);
        }
        default:
          return failed(runnerError("unknown_job_kind", `未対応の job kind: ${job.kind}`));
      }
    },
  };
};
