import { z } from "zod";

import { createNutritionEstimateSchema } from "./schemas";

export const nutritionAnalysisPayloadSchema = z.object({ mealId: z.string().min(1).max(128).optional() });
export const nutritionCandidateSchema = z.object({
  id: z.string(), photoId: z.string(), memo: z.string(), mealKind: z.string(),
});
export const saveNutritionEstimateSchema = createNutritionEstimateSchema.extend({
  mealId: z.string().min(1).max(128), jobId: z.string().min(1).max(128), leaseToken: z.uuid(),
});
export type NutritionAnalysisPayload = z.infer<typeof nutritionAnalysisPayloadSchema>;
export type NutritionCandidate = z.infer<typeof nutritionCandidateSchema>;
export type NutritionEstimate = z.infer<typeof createNutritionEstimateSchema>;
export type SaveNutritionEstimateInput = z.infer<typeof saveNutritionEstimateSchema>;
export type MealNutrition = {
  readonly mealId: string;
  readonly photoId: string | null;
  readonly occurredAt: string;
  readonly estimate: NutritionEstimate | null;
  readonly analysisStatus: string | null;
  readonly analysisSummary: string | null;
};
