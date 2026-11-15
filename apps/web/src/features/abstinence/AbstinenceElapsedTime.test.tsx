import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AbstinenceElapsedTime } from "./AbstinenceElapsedTime";

const goal = { name: "夜更かし", startedAt: "2026-09-01T23:59:59+09:00", targetDays: 30, targetDate: null };
const event = (occurredAt: string) => ({ id: occurredAt, occurredAt, recordedAt: occurredAt, durationMinutes: null, memo: "" });
const elapsedText = (events: ReturnType<typeof event>[] = []) => renderToStaticMarkup(<AbstinenceElapsedTime goal={goal} events={events} />).replace(/<[^>]*>/g, "");

afterEach(() => vi.useRealTimers());

describe("禁欲の経過時間", () => {
  it("日付をまたいでも 24 時間未満は 0 日として秒まで表示する", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-02T00:00:00+09:00"));
    expect(elapsedText()).toBe("0 日0 時間0 分1 秒継続中");
  });

  it("開始前の中断を除き、並び順によらず最後の中断から計算する", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-05T13:02:03+09:00"));
    expect(elapsedText([event("2026-09-04T12:00:00+09:00"), event("2026-09-03T12:00:00+09:00"), event("2026-08-31T12:00:00+09:00")])).toBe("1 日1 時間2 分3 秒継続中");
  });

  it("開始から 24 時間で 1 日に繰り上がる", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-02T23:59:59+09:00"));
    expect(elapsedText([event("2026-08-31T12:00:00+09:00")])).toBe("1 日0 時間0 分0 秒継続中");
  });

  it("開始日時が未来なら経過時間は 0 秒", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-01T00:00:00+09:00"));
    expect(elapsedText()).toBe("0 日0 時間0 分0 秒継続中");
  });
});
