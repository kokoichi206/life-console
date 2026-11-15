import { describe, expect, it } from "vitest";

import { pfcGoalExample } from "./nutrition-summary";
import { pfcDifference, pfcReviewHints } from "./pfc-review";

const reference = pfcGoalExample(70, 2000);
describe("PFC の計算例との差と確認項目", () => {
  it("表示する量の差を使い、端数や負のゼロを出さない", () => {
    expect(pfcDifference(68, reference.fatGrams)).toBe(12.4);
    expect(pfcDifference(55.56, reference.fatGrams)).toBe(0);
    expect(pfcDifference(12.3 + 45.6, 140)).toBe(-82.1);
  });
  it("未解析がある日は、少ない項目から食事変更を提案しない", () => {
    const hints = pfcReviewHints({ proteinGrams: 30, fatGrams: 68, carbohydrateGrams: 80 }, reference, false);
    expect(hints.map((hint) => hint.key)).toEqual(["fatGrams"]);
    expect(hints[0]?.suggestion).toContain("ドレッシング");
  });
  it("解析済みの日は、差の割合が大きい項目を最大 2 件表示する", () => {
    expect(pfcReviewHints({ proteinGrams: 40, fatGrams: 68, carbohydrateGrams: 220 }, reference, true).map((hint) => hint.key)).toEqual(["proteinGrams", "fatGrams"]);
  });
  it("全て 0 g の記録から不足を補うヒントを作らない", () => {
    expect(pfcReviewHints({ proteinGrams: 0, fatGrams: 0, carbohydrateGrams: 0 }, reference, true)).toEqual([]);
  });
});
