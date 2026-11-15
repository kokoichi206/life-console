import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WeightGoalProgress } from "./WeightGoalProgress";

const goal = { startDate: "2026-09-01", startWeightKg: 90, targetWeightKg: 80, targetDate: "2026-09-11" };
const render = (overrides: Partial<typeof goal> = {}) => renderToStaticMarkup(<WeightGoalProgress goal={{ ...goal, ...overrides }} latestWeight={88} onEdit={() => undefined} />);

afterEach(() => vi.useRealTimers());

describe("体重と日付の進捗", () => {
  it("日本時間の今日から日付の経過率を計算し、体重の達成率と区別する", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-05T15:00:00Z"));
    expect(render()).toContain("aria-label=\"体重 20% 達成、日付 50% 経過\"");
    expect(render()).toContain("2026/09/06");
  });

  it.each([
    ["2026-08-31T00:00:00+09:00", 0],
    ["2026-09-12T00:00:00+09:00", 100],
  ])("期間外の %s では日付の進捗を %s%% に留める", (now, progress) => {
    vi.useFakeTimers().setSystemTime(new Date(now));
    expect(render()).toContain(`日付 ${progress}% 経過`);
  });

  it("開始日と期限が同じなら当日に 100% とする", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-01T00:00:00+09:00"));
    expect(render({ targetDate: goal.startDate })).toContain("日付 100% 経過");
  });

  it("期限が未設定なら日付の経過率を表示しない", () => {
    const html = renderToStaticMarkup(<WeightGoalProgress goal={{ ...goal, targetDate: null }} latestWeight={88} onEdit={() => undefined} />);
    expect(html).toContain("体重 20% 達成、日付 未設定");
  });

  it.each([goal.targetDate, null])("開始日が未設定で期限が %s なら従来の体重ゲージだけを表示する", (targetDate) => {
    const html = renderToStaticMarkup(<WeightGoalProgress goal={{ ...goal, startDate: null, targetDate }} latestWeight={88} onEdit={() => undefined} />);
    expect(html).toContain("目標の達成率 20%");
    expect(html.match(/<path /g)).toHaveLength(2);
    expect(html).not.toContain("日付");
    expect(html).not.toContain("開始日");
    expect(html).not.toContain("今日");
    expect(html).not.toContain("未設定");
    if (targetDate !== null) expect(html).toContain("期限 2026/09/11");
    else expect(html).not.toContain("期限");
  });
});
