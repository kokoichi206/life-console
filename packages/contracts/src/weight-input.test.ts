import { describe, expect, it } from "vitest";

import { createWeightSchema } from "./schemas";

const measurement = {
  source: "manual",
  sourceKey: "test-measurement",
  weightKg: 81.4,
  occurredAt: "2026-10-07T00:00:00Z",
};

describe("体重記録の入力範囲", () => {
  it.each([0, 29.9, 110.1, Number.NaN, Number.POSITIVE_INFINITY])("体重 %s を拒否する", (weightKg) => {
    expect(createWeightSchema.safeParse({ ...measurement, weightKg }).success).toBe(false);
  });
  it.each([0, 4.9, 40.1, Number.NaN, Number.POSITIVE_INFINITY])("体脂肪率 %s を拒否する", (bodyFatPercent) => {
    expect(createWeightSchema.safeParse({ ...measurement, bodyFatPercent }).success).toBe(false);
  });
  it.each([30, 110])("体重 %s と体脂肪率の上下限・空欄を許可する", (weightKg) => {
    for (const bodyFatPercent of [5, 40, undefined]) {
      expect(createWeightSchema.safeParse({ ...measurement, weightKg, bodyFatPercent }).success).toBe(true);
    }
  });
});
