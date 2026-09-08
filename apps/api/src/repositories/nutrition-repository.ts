import type { MealNutrition, NutritionAnalysisPayload, NutritionCandidate, NutritionEstimate, SaveNutritionEstimateInput } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";

import { appError, type AppError } from "../shared/app-error";

export interface NutritionRepository {
  list(): Promise<Result<ReadonlyArray<MealNutrition>, AppError>>;
  candidates(input: NutritionAnalysisPayload): Promise<Result<ReadonlyArray<NutritionCandidate>, AppError>>;
  save(id: string, input: SaveNutritionEstimateInput, now: string): Promise<Result<void, AppError>>;
}

export const createNutritionRepository = (database: D1Database): NutritionRepository => ({
  async list() {
    type Row = Omit<MealNutrition, "estimate"> & { readonly estimateJson: string | null };
    const result = await safeTry(() => database.prepare(`
      SELECT m.id AS mealId, m.photo_id AS photoId, m.occurred_at AS occurredAt,
        CASE WHEN n.id IS NULL THEN NULL ELSE json_object(
          'model', n.model, 'analyzedAt', n.analyzed_at, 'inputHash', n.input_hash,
          'caloriesKcal', n.calories_kcal, 'proteinGrams', n.protein_grams,
          'fatGrams', n.fat_grams, 'carbohydrateGrams', n.carbohydrate_grams
        ) END AS estimateJson,
        CASE WHEN n.source_job_id = j.id THEN 'succeeded' ELSE j.status END AS analysisStatus,
        j.summary AS analysisSummary
      FROM meals m
      LEFT JOIN nutrition_estimates n ON n.id = (
        SELECT id FROM nutrition_estimates WHERE meal_id = m.id ORDER BY analyzed_at DESC, rowid DESC LIMIT 1
      )
      LEFT JOIN jobs j ON j.id = (
        SELECT id FROM jobs WHERE kind = 'nutrition_analysis'
          AND (json_extract(payload_json, '$.mealId') = m.id
            OR (json_extract(payload_json, '$.mealId') IS NULL AND m.photo_id IS NOT NULL
              AND created_at >= m.recorded_at AND (n.id IS NULL OR n.source_job_id = jobs.id)))
        ORDER BY created_at DESC, rowid DESC LIMIT 1
      )
      WHERE m.deleted_at IS NULL ORDER BY m.occurred_at DESC
    `).all<Row>());
    if (!result.ok) return err(appError.storage(result.error));
    return ok(result.value.results.map(({ estimateJson, ...row }) => ({
      ...row, estimate: estimateJson === null ? null : JSON.parse(estimateJson) as NutritionEstimate,
    })));
  },
  async candidates(input) {
    const result = await safeTry(() => database.prepare(`
      SELECT id, photo_id AS photoId, memo, meal_kind AS mealKind FROM meals m
      WHERE deleted_at IS NULL AND photo_id IS NOT NULL
        AND (? IS NULL OR id = ?)
        AND (? IS NOT NULL OR (NOT EXISTS (SELECT 1 FROM nutrition_estimates WHERE meal_id = m.id)
          AND NOT EXISTS (SELECT 1 FROM jobs WHERE kind = 'nutrition_analysis'
            AND status IN ('queued', 'claimed', 'running', 'waiting_for_user')
            AND json_extract(payload_json, '$.mealId') = m.id)))
      ORDER BY occurred_at ASC
    `).bind(input.mealId ?? null, input.mealId ?? null, input.mealId ?? null).all<NutritionCandidate>());
    if (!result.ok) return err(appError.storage(result.error));
    if (input.mealId !== undefined && result.value.results.length === 0) return err(appError.notFound("写真付きの食事記録が見つかりません。"));
    return ok(result.value.results);
  },
  async save(id, input, now) {
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
});
