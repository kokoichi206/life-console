import type { PfcGrams } from "./nutrition-summary";

export const pfcDifference = (actual: number, reference: number): number =>
  (Math.round(actual * 10) - Math.round(reference * 10)) / 10;

const reviewTopics = [
  { key: "proteinGrams", label: "たんぱく質", above: "主菜やプロテインの量を記録と照らし合わせる。計算例を超えた分だけ減らす必要はありません。", below: "各食に魚・肉・卵・大豆製品などの主菜があるか確認する。" },
  { key: "fatGrams", label: "脂質", above: "油・ドレッシングの量や、揚げ物が重なっていないか確認する。", below: "食材や調理に使った油の記録漏れがないか確認する。" },
  { key: "carbohydrateGrams", label: "炭水化物", above: "ご飯・パン・麺の量と、甘い飲み物・間食を確認する。", below: "主食の量と記録漏れを確認する。炭水化物を抜く前提にしない。" },
] as const;

export const pfcReviewHints = (actual: PfcGrams, reference: PfcGrams, complete: boolean) => {
  if (actual.proteinGrams + actual.fatGrams + actual.carbohydrateGrams === 0) return [];
  return reviewTopics.map((topic) => ({
    ...topic,
    difference: pfcDifference(actual[topic.key], reference[topic.key]),
    relativeDifference: Math.abs(actual[topic.key] / reference[topic.key] - 1),
  }))
    .filter((topic) => topic.difference > 0 || (complete && topic.difference < 0))
    .sort((a, b) => b.relativeDifference - a.relativeDifference)
    .slice(0, 2)
    .map((topic) => ({ key: topic.key, label: topic.label, difference: topic.difference, suggestion: topic.difference > 0 ? topic.above : topic.below }));
};
