import type { Meal } from "@life-console/contracts";
import { describe, expect, it } from "vitest";

import { defaultMealKindFor } from "./meal-kind";

const meal = (mealKind: Meal["mealKind"], occurredAt: string): Meal => ({
  id: `${mealKind}-${occurredAt}`,
  photoId: null,
  memo: "",
  mealKind,
  occurredAt,
  recordedAt: occurredAt,
  tags: [],
});

describe("defaultMealKindFor", () => {
  const mealKindsByTime = [
    ["2026-09-08T04:59:00+09:00", "snack"],
    ["2026-09-08T05:00:00+09:00", "breakfast"],
    ["2026-09-08T10:59:00+09:00", "breakfast"],
    ["2026-09-08T11:00:00+09:00", "lunch"],
    ["2026-09-08T15:59:00+09:00", "lunch"],
    ["2026-09-08T16:00:00+09:00", "dinner"],
    ["2026-09-08T21:59:00+09:00", "dinner"],
    ["2026-09-08T22:00:00+09:00", "snack"],
  ] satisfies ReadonlyArray<readonly [string, Meal["mealKind"]]>;

  it.each(mealKindsByTime)("selects a meal kind by Tokyo time", (occurredAt, expected) => {
    expect(defaultMealKindFor(occurredAt, [])).toBe(expected);
  });

  it("uses snack when the default meal is already recorded in the same period", () => {
    expect(defaultMealKindFor("2026-09-08T08:30:00+09:00", [meal("breakfast", "2026-09-08T07:00:00+09:00")])).toBe("snack");
  });

  it("does not use a record from another day or period", () => {
    expect(defaultMealKindFor("2026-09-08T08:30:00+09:00", [
      meal("breakfast", "2026-09-07T07:00:00+09:00"),
      meal("breakfast", "2026-09-08T12:00:00+09:00"),
    ])).toBe("breakfast");
  });
});
