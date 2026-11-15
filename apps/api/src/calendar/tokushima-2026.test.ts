import { describe, expect, it } from "vitest";

import { tokushimaCollections } from "./tokushima-2026";

describe("徳島市 2026 年度の公式収集日", () => {
  it("D 地区の 10 月と年始の例外を公式表と照合する", () => {
    const events = tokushimaCollections("D");
    const dates = (title: string, month: string) => events.filter((event) => event.title === title && event.date.startsWith(month)).map((event) => event.date.slice(8));
    expect(dates("缶・びん", "2026-10")).toEqual(["01", "29"]);
    expect(dates("ペットボトル", "2026-10")).toEqual(["12", "26"]);
    expect(dates("古紙類", "2026-10")).toEqual(["15"]);
    expect(dates("燃やせないごみ", "2026-10")).toEqual(["28"]);
    expect(dates("燃やすしかないごみ", "2027-01")).toEqual(["05", "08", "12", "15", "19", "22", "26", "29"]);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
    expect(events.every((event) => event.date >= "2026-04-01" && event.date <= "2027-03-31")).toBe(true);
  });
  it("C 地区と D 地区の収集日を混ぜない", () => {
    expect(tokushimaCollections("C").filter((event) => event.title === "古紙類" && event.date.startsWith("2026-10")).map((event) => event.date)).toEqual(["2026-10-08"]);
    expect(tokushimaCollections("D").filter((event) => event.title === "古紙類" && event.date.startsWith("2026-10")).map((event) => event.date)).toEqual(["2026-10-15"]);
  });
});
