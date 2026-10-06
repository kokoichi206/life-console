import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AbstinenceHistory } from "./AbstinenceHistory";

const goal = { name: "夜更かし", startedAt: "2026-09-01T23:59:59+09:00", targetDays: 30, targetDate: null };
const event = (occurredAt: string) => ({ id: occurredAt, occurredAt, recordedAt: occurredAt, durationMinutes: 20, memo: "" });
const historyMarkup = (events: ReturnType<typeof event>[]) => renderToStaticMarkup(<AbstinenceHistory goal={goal} events={events} />);

describe("中断までの継続時間", () => {
  it("入力の並び順によらず、前回の中断からの実時間を秒まで表示する", () => {
    const markup = historyMarkup([event("2026-09-02T00:00:00+09:00"), event("2026-09-04T01:02:03+09:00")]);
    expect(markup).toContain("2 日 1 時間 2 分 3 秒 継続");
    expect(markup).toContain("0 日 0 時間 0 分 1 秒 継続");
    expect(markup.indexOf("2026-09-04T01:02:03+09:00")).toBeLessThan(markup.indexOf("2026-09-02T00:00:00+09:00"));
  });

  it("開始日時より前の記録を起点にせず、最初の中断は目標の開始日時から計算する", () => {
    const markup = historyMarkup([event("2026-08-31T00:00:00+09:00"), event("2026-09-02T23:59:59+09:00")]);
    expect(markup).toContain("1 日 0 時間 0 分 0 秒 継続");
    expect(markup).toContain("現在の開始日時より前");
  });

  it("同じ日時の中断は継続時間を 0 秒とする", () => {
    const occurredAt = "2026-09-02T00:00:00+09:00";
    const markup = historyMarkup([event(occurredAt), { ...event(occurredAt), id: "second-event" }]);
    expect(markup).toContain("0 日 0 時間 0 分 0 秒 継続");
    expect(markup).toContain("0 日 0 時間 0 分 1 秒 継続");
  });
});
