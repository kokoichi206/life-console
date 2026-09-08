import { describe, expect, it } from "vitest";

import { createScheduleSchema } from "./schemas";

const schedule = {
  name: "書き出し", jobKind: "weight_obsidian_export", interval: "hourly", timezone: "Asia/Tokyo",
  nextRunAt: "2026-09-08T00:00:00.000Z", coalescing: "skip_if_pending", deadlineSeconds: 7200,
};

describe("体重書き出しの定期設定", () => {
  it("vault 内の体重ディレクトリの相対パスを保存する", () => {
    expect(createScheduleSchema.parse({ ...schedule, payload: { dataDirectory: "data/weight" } })).toEqual({
      ...schedule, payload: { dataDirectory: "data/weight" },
    });
  });

  it.each(["/tmp/weight.md", "../weight.md", "health/../../weight.md", "health\\weight.md", ".obsidian/config.md", "health//weight.md"])("不正な出力先 %s を拒否する", (dataDirectory) => {
    expect(createScheduleSchema.safeParse({ ...schedule, payload: { dataDirectory } }).success).toBe(false);
  });

  it("出力先の未指定と、別のジョブへの書き出し設定の混入を拒否する", () => {
    expect(createScheduleSchema.safeParse(schedule).success).toBe(false);
    expect(createScheduleSchema.safeParse({ ...schedule, jobKind: "slack_sync", payload: { dataDirectory: "data/weight" } }).success).toBe(false);
  });

  it("既存の入力なしの定期設定を引き続き受け付ける", () => {
    const existing = { ...schedule, jobKind: "slack_sync" };
    expect(createScheduleSchema.parse(existing)).toEqual(existing);
  });
});
