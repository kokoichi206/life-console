import { nutritionQuantityBases, nutritionMemoRelations, type NutritionEstimateDetails } from "@life-console/domain";
import { z } from "zod";

export const nutritionFoodEstimateSchema = z.object({
  name: z.string().min(1),
  portionDescription: z.string().min(1),
  estimatedWeightGrams: z.number().positive().nullable(),
  quantityBasis: z.enum(nutritionQuantityBases),
  memoRelation: z.enum(nutritionMemoRelations),
  caloriesKcal: z.number().int().nonnegative(),
  proteinGrams: z.number().nonnegative(),
  fatGrams: z.number().nonnegative(),
  carbohydrateGrams: z.number().nonnegative(),
  estimationBasis: z.string().min(1),
});

export const nutritionFoodAnalysisSchema = z.object({
  items: z.array(nutritionFoodEstimateSchema).min(1),
  memoInterpretation: z.string(),
  assumptions: z.array(z.string()),
});

export const nutritionEstimateDetailsSchema: z.ZodType<NutritionEstimateDetails> = nutritionFoodAnalysisSchema.extend({
  promptVersion: z.string().min(1),
  input: z.object({ memo: z.string(), photoIds: z.array(z.string()) }),
});
