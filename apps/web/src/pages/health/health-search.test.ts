import { describe, expect, it } from "vitest";

import { parseHealthSearch, parseSharedHealthSearch } from "./health-search";

describe("カロリー収支の表示日数", () => {
  it("共有と本人の URL で 7 日単位の追加表示を復元する", () => {
    expect(parseHealthSearch({ calories: "14" })).toEqual({ calories: 14 });
    expect(parseHealthSearch({ calories: 14 })).toEqual({ calories: 14 });
    expect(parseSharedHealthSearch({ calories: "21", entry: "meal" })).toEqual({ calories: 21 });
    expect(parseSharedHealthSearch({ calories: 21, entry: "meal" })).toEqual({ calories: 21 });
  });
  it.each(["all", "7", "8", "-14", "14.5", "Infinity"])("不正な表示日数 %s を除外する", (calories) => {
    expect(parseHealthSearch({ calories })).toEqual({});
  });
  it.each([
    { calories: [14] },
    { calories: [[14]] },
    { calories: { toString: null } },
    { calories: null },
    { calories: true },
  ])("数値と文字列以外の表示日数 $calories を除外する", ({ calories }) => {
    expect(parseHealthSearch({ calories, range: "d90" })).toEqual({ range: "d90" });
    expect(parseSharedHealthSearch({ calories, range: "d90" })).toEqual({ range: "d90" });
  });
});
