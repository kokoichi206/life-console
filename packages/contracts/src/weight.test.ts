import { describe, expect, it } from "vitest";

import type { WeightPoint } from "./models";
import { calculate7DayMovingAverage } from "./weight";

const point = (id: string, date: string, weightKg: number): WeightPoint => ({
  id,
  occurredAt: `${date}T00:00:00+09:00`,
  recordedAt: `${date}T00:01:00+09:00`,
  source: "csv",
  weightKg,
});

describe("calculate7DayMovingAverage", () => {
  it("日本時間の午前を UTC で保存しても CSV と同じ暦日窓で集計する", () => {
    const result = calculate7DayMovingAverage([
      point("outside", "2026-08-31", 100),
      point("csv", "2026-09-07", 80),
      { ...point("manual", "2026-09-07", 82), source: "manual", occurredAt: "2026-09-06T23:00:00.000Z" },
    ]);
    expect(result[1]?.movingAverage7DaysKg).toBe(81);
    expect(result[2]?.movingAverage7DaysKg).toBe(81);
    expect(result[2]?.movingAverageWindowSamples).toBe(2);
  });

  it("直近7件ではなく当日を含む7暦日で平均する", () => {
    const result = calculate7DayMovingAverage([
      point("1", "2026-05-13", 92),
      point("2", "2026-05-14", 92),
      point("3", "2026-05-17", 91),
      point("4", "2026-05-18", 91.4),
      point("5", "2026-05-19", 91),
      point("6", "2026-05-20", 90.6),
      point("7", "2026-05-22", 91.4),
      point("8", "2026-05-25", 91),
    ]);

    expect(result[4]?.movingAverage7DaysKg).toBe(91.48);
    expect(result[4]?.movingAverageWindowSamples).toBe(5);
    expect(result[7]?.movingAverage7DaysKg).toBe(91);
    expect(result[7]?.movingAverageWindowSamples).toBe(4);
  });

  it("時刻やタイムゾーンではなく日付単位で7暦日を判定する", () => {
    const result = calculate7DayMovingAverage([
      {
        ...point("1", "2026-05-13", 90),
        occurredAt: "2026-05-13T23:30:00+09:00",
      },
      {
        ...point("2", "2026-05-19", 92),
        occurredAt: "2026-05-19T06:00:00+09:00",
      },
    ]);

    expect(result[1]?.movingAverage7DaysKg).toBe(91);
    expect(result[1]?.movingAverageWindowSamples).toBe(2);
  });
});
