import { describe, expect, it } from "vitest";

import { parseHealthSearch } from "./health-search";
import { constrainWeightWindow, gestureWeightWindow, WEIGHT_DAY_MS as day } from "./weight-window";

const bounds = { start: 0, end: 100 * day };
const window = { start: 40 * day, end: 60 * day };

describe("体重グラフの表示期間", () => {
  it("2 本指を広げると中心を維持して期間を狭める", () => {
    expect(gestureWeightWindow(window, bounds, [25, 75], [0, 100], 100)).toEqual({ start: 45 * day, end: 55 * day });
  });
  it("2 本指をそろえて移動すると同じ日数で過去へ移動する", () => {
    expect(gestureWeightWindow(window, bounds, [25, 75], [50, 100], 100)).toEqual({ start: 35 * day, end: 55 * day });
  });
  it("最小幅と記録範囲の端を越えない", () => {
    expect(constrainWeightWindow({ start: -10 * day, end: 10 * day }, bounds)).toEqual({ start: 0, end: 20 * day });
    expect(constrainWeightWindow({ start: 99 * day, end: 120 * day }, bounds)).toEqual({ start: 79 * day, end: 100 * day });
    expect(gestureWeightWindow(window, bounds, [49, 51], [0, 100], 100).end - gestureWeightWindow(window, bounds, [49, 51], [0, 100], 100).start).toBe(day);
  });
  it("期間と目標設定の URL を復元し、不正な日付や逆転期間を受け付けない", () => {
    expect(parseHealthSearch({ entry: "goal", range: "all", from: "2026-08-01", to: "2026-09-01" })).toEqual({ entry: "goal", range: "all", from: "2026-08-01", to: "2026-09-01" });
    expect(parseHealthSearch({ from: "2026-02-30", to: "2026-09-01" })).toEqual({});
    expect(parseHealthSearch({ from: "2026-09-01", to: "2026-08-01", range: "other" })).toEqual({});
  });
});
