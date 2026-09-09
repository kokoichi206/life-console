import type { MealNutrition, NutritionAnalysisPayload, NutritionCandidate, SaveNutritionEstimateInput } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";
import { jobs, meals, nutritionEstimates } from "@life-console/db";
import { and, asc, desc, eq, exists, gt, gte, inArray, isNotNull, isNull, notExists, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";

import { appError, type AppError } from "../shared/app-error";

export interface NutritionRepository {
  saveManualCalories(mealId: string, caloriesKcal: number, now: string): Promise<Result<void, AppError>>;
  list(): Promise<Result<ReadonlyArray<MealNutrition>, AppError>>;
  candidates(input: NutritionAnalysisPayload): Promise<Result<ReadonlyArray<NutritionCandidate>, AppError>>;
  save(id: string, input: SaveNutritionEstimateInput, now: string): Promise<Result<void, AppError>>;
}

export const createNutritionRepository = (database: D1Database): NutritionRepository => {
  const db = drizzle(database);
  return {
    async saveManualCalories(mealId, caloriesKcal, now) {
      const targetMeal = and(eq(meals.id, mealId), isNull(meals.deletedAt));
      const result = await safeTry(() => db.batch([
        db.update(meals).set({ manualCaloriesKcal: caloriesKcal }).where(targetMeal),
        db.update(jobs).set({
          cancelRequestedAt: now, updatedAt: now,
          status: sql`case when ${jobs.status} = 'queued' then 'canceled' else ${jobs.status} end`,
          finishedAt: sql`case when ${jobs.status} = 'queued' then ${now} else ${jobs.finishedAt} end`,
        }).where(and(
          eq(jobs.kind, "nutrition_analysis"), eq(sql`json_extract(${jobs.payloadJson}, '$.mealId')`, mealId),
          inArray(jobs.status, ["queued", "claimed", "running", "waiting_for_user"]),
          exists(db.select({ id: meals.id }).from(meals).where(targetMeal)),
        )),
      ]));
      if (!result.ok) return err(appError.storage(result.error));
      return result.value[0].meta.changes > 0 ? ok(undefined) : err(appError.notFound("食事記録が見つかりません。"));
    },
    async list() {
      const estimate = alias(nutritionEstimates, "latest_estimate");
      const analysisJob = alias(jobs, "latest_analysis_job");
      const latestEstimateId = db.select({ id: nutritionEstimates.id }).from(nutritionEstimates)
        .where(eq(nutritionEstimates.mealId, meals.id))
        .orderBy(desc(nutritionEstimates.analyzedAt), desc(sql`${nutritionEstimates}.rowid`)).limit(1);
      const jobMealId = sql`json_extract(${jobs.payloadJson}, '$.mealId')`;
      const latestJobId = db.select({ id: jobs.id }).from(jobs).where(and(
        eq(jobs.kind, "nutrition_analysis"),
        or(and(eq(jobMealId, meals.id), or(isNull(meals.manualCaloriesKcal), inArray(jobs.status, ["queued", "claimed", "running", "waiting_for_user"]))), and(
          isNull(meals.manualCaloriesKcal),
          isNull(jobMealId), isNotNull(meals.photoId), gte(jobs.createdAt, meals.recordedAt),
          or(isNull(estimate.id), eq(estimate.sourceJobId, jobs.id)),
        )),
      )).orderBy(desc(jobs.createdAt), desc(sql`${jobs}.rowid`)).limit(1);
      const listQuery = db.select({
        mealId: meals.id, photoId: meals.photoId, occurredAt: meals.occurredAt, manualCaloriesKcal: meals.manualCaloriesKcal,
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
        analysisStatus: meal.manualCaloriesKcal === null && sourceJobId !== null && sourceJobId === jobId ? "succeeded" : meal.analysisStatus,
      })));
    },
    async candidates(input) {
      const candidatesQuery = db.select({
        id: meals.id, photoId: meals.photoId, memo: meals.memo, mealKind: meals.mealKind, manualCaloriesKcal: meals.manualCaloriesKcal,
      }).from(meals).where(and(
        isNull(meals.deletedAt), isNotNull(meals.photoId),
        input.mealId !== undefined
          ? eq(meals.id, input.mealId)
          : and(
              isNull(meals.manualCaloriesKcal),
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
      return ok(result.value.filter((meal) => meal.manualCaloriesKcal === null)
        .map(({ manualCaloriesKcal: _manualCaloriesKcal, ...meal }) => ({ ...meal, photoId: meal.photoId! })));
    },
    async save(id, input, now) {
      const validExecution = exists(db.select({ id: jobs.id }).from(jobs).where(and(
        eq(jobs.id, input.jobId), eq(jobs.leaseToken, input.leaseToken), eq(jobs.kind, "nutrition_analysis"),
        eq(jobs.status, "running"), gt(jobs.leaseExpiresAt, now),
        or(isNull(sql`json_extract(${jobs.payloadJson}, '$.mealId')`), eq(sql`json_extract(${jobs.payloadJson}, '$.mealId')`, input.mealId)),
      )));
      // 確認と保存の間の lease 更新や重複保存を防ぐため、同じ SQL 文で評価する。
      const selection = db.select({
        id: sql`${id}`.as("id"), mealId: sql`${input.mealId}`.as("mealId"), sourceJobId: sql`${input.jobId}`.as("sourceJobId"), model: sql`${input.model}`.as("model"),
        analyzedAt: sql`${input.analyzedAt}`.as("analyzedAt"), inputHash: sql`${input.inputHash}`.as("inputHash"), caloriesKcal: sql`${input.caloriesKcal}`.as("caloriesKcal"),
        proteinGrams: sql`${input.proteinGrams}`.as("proteinGrams"), fatGrams: sql`${input.fatGrams}`.as("fatGrams"), carbohydrateGrams: sql`${input.carbohydrateGrams}`.as("carbohydrateGrams"), createdAt: sql`${now}`.as("createdAt"),
      }).from(meals).where(and(eq(meals.id, input.mealId), isNull(meals.deletedAt), isNotNull(meals.photoId), isNull(meals.manualCaloriesKcal),
        validExecution,
        exists(db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, input.jobId), isNull(jobs.cancelRequestedAt)))),
        notExists(db.select({ id: nutritionEstimates.id }).from(nutritionEstimates).where(and(
          eq(nutritionEstimates.sourceJobId, input.jobId), eq(nutritionEstimates.mealId, input.mealId),
        ))),
      ));
      const result = await safeTry(() => db.insert(nutritionEstimates).select(selection).run());
      if (!result.ok) return err(appError.storage(result.error));
      if (result.value.meta.changes > 0) return ok(undefined);
      const manualMeal = await safeTry(() => db.select({ id: meals.id }).from(meals).where(and(
        eq(meals.id, input.mealId), isNull(meals.deletedAt), isNotNull(meals.manualCaloriesKcal), validExecution,
      )).get());
      if (!manualMeal.ok) return err(appError.storage(manualMeal.error));
      if (manualMeal.value !== undefined) return err(appError.nutritionManualCalories());
      return err(appError.conflict("解析結果は保存されませんでした。実行権限・対象の食事・保存済みの結果を確認してください。"));
    },
  };
};
