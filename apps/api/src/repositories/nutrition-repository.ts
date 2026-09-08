import type { MealNutrition, NutritionAnalysisPayload, NutritionCandidate, SaveNutritionEstimateInput } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";
import { jobs, meals, nutritionEstimates } from "@life-console/db";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, notExists, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";

import { appError, type AppError } from "../shared/app-error";

export interface NutritionRepository {
  list(): Promise<Result<ReadonlyArray<MealNutrition>, AppError>>;
  candidates(input: NutritionAnalysisPayload): Promise<Result<ReadonlyArray<NutritionCandidate>, AppError>>;
  save(id: string, input: SaveNutritionEstimateInput, now: string): Promise<Result<void, AppError>>;
}

export const createNutritionRepository = (database: D1Database): NutritionRepository => {
  const db = drizzle(database);
  return {
    async list() {
      const estimate = alias(nutritionEstimates, "latest_estimate");
      const analysisJob = alias(jobs, "latest_analysis_job");
      const latestEstimateId = db.select({ id: nutritionEstimates.id }).from(nutritionEstimates)
        .where(eq(nutritionEstimates.mealId, meals.id))
        .orderBy(desc(nutritionEstimates.analyzedAt), desc(sql`${nutritionEstimates}.rowid`)).limit(1);
      const jobMealId = sql`json_extract(${jobs.payloadJson}, '$.mealId')`;
      const latestJobId = db.select({ id: jobs.id }).from(jobs).where(and(
        eq(jobs.kind, "nutrition_analysis"),
        or(eq(jobMealId, meals.id), and(
          isNull(jobMealId), isNotNull(meals.photoId), gte(jobs.createdAt, meals.recordedAt),
          or(isNull(estimate.id), eq(estimate.sourceJobId, jobs.id)),
        )),
      )).orderBy(desc(jobs.createdAt), desc(sql`${jobs}.rowid`)).limit(1);
      const listQuery = db.select({
        mealId: meals.id, photoId: meals.photoId, occurredAt: meals.occurredAt,
        estimate: {
          model: estimate.model, analyzedAt: estimate.analyzedAt, inputHash: estimate.inputHash,
          caloriesKcal: estimate.caloriesKcal, proteinGrams: estimate.proteinGrams,
          fatGrams: estimate.fatGrams, carbohydrateGrams: estimate.carbohydrateGrams,
        },
        sourceJobId: estimate.sourceJobId, jobId: analysisJob.id,
        analysisStatus: analysisJob.status, analysisSummary: analysisJob.summary,
      }).from(meals)
        .leftJoin(estimate, eq(estimate.id, latestEstimateId))
        .leftJoin(analysisJob, eq(analysisJob.id, latestJobId))
        .where(isNull(meals.deletedAt)).orderBy(desc(meals.occurredAt));
      const result = await safeTry(() => listQuery.all());
      if (!result.ok) return err(appError.storage(result.error));
      return ok(result.value.map(({ sourceJobId, jobId, ...meal }) => ({
        ...meal,
        analysisStatus: sourceJobId !== null && sourceJobId === jobId ? "succeeded" : meal.analysisStatus,
      })));
    },
    async candidates(input) {
      const candidatesQuery = db.select({
        id: meals.id, photoId: meals.photoId, memo: meals.memo, mealKind: meals.mealKind,
      }).from(meals).where(and(
        isNull(meals.deletedAt), isNotNull(meals.photoId),
        input.mealId !== undefined
          ? eq(meals.id, input.mealId)
          : and(
              notExists(db.select({ id: nutritionEstimates.id }).from(nutritionEstimates)
                .where(eq(nutritionEstimates.mealId, meals.id))),
              notExists(db.select({ id: jobs.id }).from(jobs).where(and(
                eq(jobs.kind, "nutrition_analysis"),
                inArray(jobs.status, ["queued", "claimed", "running", "waiting_for_user"]),
                eq(sql`json_extract(${jobs.payloadJson}, '$.mealId')`, meals.id),
              ))),
            ),
      )).orderBy(asc(meals.occurredAt));
      const result = await safeTry(() => candidatesQuery.all());
      if (!result.ok) return err(appError.storage(result.error));
      if (input.mealId !== undefined && result.value.length === 0) return err(appError.notFound("写真付きの食事記録が見つかりません。"));
      return ok(result.value.map((meal) => ({ ...meal, photoId: meal.photoId! })));
    },
    async save(id, input, now) {
      // 確認と保存の間の lease 更新や重複保存を防ぐため、同じ SQL 文で評価する。
      const result = await safeTry(() => database.prepare(`
        INSERT INTO nutrition_estimates (id, meal_id, source_job_id, model, analyzed_at, input_hash,
          calories_kcal, protein_grams, fat_grams, carbohydrate_grams, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM jobs WHERE id = ? AND lease_token = ? AND kind = 'nutrition_analysis'
            AND status = 'running' AND lease_expires_at > ? AND cancel_requested_at IS NULL
            AND (json_extract(payload_json, '$.mealId') IS NULL OR json_extract(payload_json, '$.mealId') = ?)
        ) AND EXISTS (SELECT 1 FROM meals WHERE id = ? AND deleted_at IS NULL AND photo_id IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM nutrition_estimates WHERE source_job_id = ? AND meal_id = ?)
      `).bind(id, input.mealId, input.jobId, input.model, input.analyzedAt, input.inputHash,
        input.caloriesKcal, input.proteinGrams, input.fatGrams, input.carbohydrateGrams, now,
        input.jobId, input.leaseToken, now, input.mealId, input.mealId, input.jobId, input.mealId).run());
      if (!result.ok) return err(appError.storage(result.error));
      return result.value.meta.changes > 0 ? ok(undefined) : err(appError.conflict("解析結果は保存されませんでした。実行権限・対象の食事・保存済みの結果を確認してください。"));
    },
  };
};
