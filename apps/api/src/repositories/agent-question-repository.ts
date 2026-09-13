import type { AgentQuestion } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";
import { agentQuestions, jobs, tasks } from "@life-console/db";
import { and, asc, eq, exists, gt, inArray, isNull, notExists, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { appError, type AppError } from "../shared/app-error";

export interface AgentQuestionRepository {
  create(id: string, jobId: string, leaseToken: string, question: string, now: string): Promise<Result<{ readonly id: string }, AppError>>;
  listPending(now: string): Promise<Result<ReadonlyArray<AgentQuestion>, AppError>>;
  get(id: string, jobId: string, leaseToken: string, now: string): Promise<Result<AgentQuestion, AppError>>;
  answer(id: string, answer: string, now: string): Promise<Result<void, AppError>>;
}

const questionColumns = {
  id: agentQuestions.id, jobId: agentQuestions.jobId, taskId: tasks.id, taskTitle: tasks.title,
  question: agentQuestions.question, answer: agentQuestions.answer, createdAt: agentQuestions.createdAt, answeredAt: agentQuestions.answeredAt,
};
const activeJob = (now: string) => and(inArray(jobs.status, ["claimed", "running", "waiting_for_user"]),
  isNull(jobs.cancelRequestedAt), gt(sql`julianday(${jobs.leaseExpiresAt})`, sql`julianday(${now})`));
const matchingQuestionLease = and(eq(jobs.id, agentQuestions.jobId), eq(jobs.leaseToken, agentQuestions.leaseToken));

export const createAgentQuestionRepository = (database: D1Database): AgentQuestionRepository => {
  const db = drizzle(database);
  const pendingQuestion = db.select({ id: agentQuestions.id }).from(agentQuestions)
    .where(and(matchingQuestionLease, isNull(agentQuestions.answer)));
  return {
    async create(id, jobId, leaseToken, question, now) {
      const selection = db.select({
        id: sql`${id}`.as("id"), jobId: jobs.id, leaseToken: jobs.leaseToken,
        question: sql`${question}`.as("question"), answer: sql`null`.as("answer"),
        createdAt: sql`${now}`.as("created_at"), answeredAt: sql`null`.as("answered_at"),
      }).from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.leaseToken, leaseToken), inArray(jobs.kind, ["agent", "github_promotion"]),
        activeJob(now), notExists(pendingQuestion)));
      const result = await safeTry(() => db.batch([
        db.insert(agentQuestions).select(selection),
        db.update(jobs).set({ status: "waiting_for_user", updatedAt: now }).where(and(eq(jobs.id, jobId),
          exists(db.select({ id: agentQuestions.id }).from(agentQuestions).where(and(eq(agentQuestions.id, id), eq(agentQuestions.jobId, jobs.id)))))),
      ]));
      if (!result.ok) return err(appError.storage(result.error));
      if (result.value[0].meta.changes === 0) return err(appError.conflict("この実行には質問を追加できません。実行状態または未回答の質問を確認してください。"));
      return ok({ id });
    },
    async listPending(now) {
      const result = await safeTry(() => db.select(questionColumns).from(agentQuestions)
        .innerJoin(jobs, eq(jobs.id, agentQuestions.jobId)).innerJoin(tasks, eq(tasks.id, jobs.taskId))
        .where(and(isNull(agentQuestions.answer), matchingQuestionLease, activeJob(now))).orderBy(asc(agentQuestions.createdAt)).all());
      return result.ok ? ok(result.value) : err(appError.storage(result.error));
    },
    async get(id, jobId, leaseToken, now) {
      const result = await safeTry(() => db.select(questionColumns).from(agentQuestions)
        .innerJoin(jobs, eq(jobs.id, agentQuestions.jobId)).innerJoin(tasks, eq(tasks.id, jobs.taskId))
        .where(and(eq(agentQuestions.id, id), eq(agentQuestions.jobId, jobId), eq(agentQuestions.leaseToken, leaseToken),
          matchingQuestionLease, activeJob(now))).get());
      if (!result.ok) return err(appError.storage(result.error));
      return result.value === undefined ? err(appError.invalidLease()) : ok(result.value);
    },
    async answer(id, answer, now) {
      const result = await safeTry(() => db.batch([
        db.update(agentQuestions).set({ answer, answeredAt: now }).where(and(eq(agentQuestions.id, id), isNull(agentQuestions.answer),
          exists(db.select({ id: jobs.id }).from(jobs).where(and(matchingQuestionLease, activeJob(now)))))),
        db.update(jobs).set({ status: "running", updatedAt: now }).where(and(eq(jobs.status, "waiting_for_user"), notExists(pendingQuestion),
          exists(db.select({ id: agentQuestions.id }).from(agentQuestions)
            .where(and(eq(agentQuestions.id, id), matchingQuestionLease, eq(agentQuestions.answeredAt, now)))))),
      ]));
      if (!result.ok) return err(appError.storage(result.error));
      if (result.value[0].meta.changes === 0) return err(appError.conflict("回答済み、または実行が終了・中止・期限切れになっています。"));
      return ok(undefined);
    },
  };
};
