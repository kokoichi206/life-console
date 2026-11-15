import { describe, expect, it } from "vitest";

import { createApiStorage } from "./support/d1-storage";

const now = "2026-09-07T12:30:00.000Z";

describe("体重の保存と取得", () => {
  it("UTC の手入力とオフセット付き CSV の体重を実際の計測順で取得する", async () => {
    const { database, repository } = createApiStorage();
    await repository.createWeight("csv", { source: "csv", sourceKey: "2026-09-07", weightKg: 80, occurredAt: "2026-09-07T00:00:00+09:00" }, now);
    await repository.createWeight("manual", { source: "manual", sourceKey: "manual", weightKg: 82, occurredAt: "2026-09-06T23:00:00.000Z" }, now);
    const result = await repository.listWeights();
    expect(result.ok && result.value.map((point) => point.id)).toEqual(["csv", "manual"]);
    database.close();
  });

  it("画面と書き出しは 730 件を超える最新の記録を含め、削除済みを除外する", async () => {
    const { database, repository } = createApiStorage();
    for (let index = 0; index < 735; index += 1) {
      const occurredAt = new Date(Date.parse("2024-01-01T00:00:00Z") + index * 86_400_000).toISOString();
      await repository.createWeight(`weight-${String(index)}`, { source: "manual", sourceKey: String(index), weightKg: 70,
        occurredAt }, now);
    }
    database.prepare("UPDATE weights SET deleted_at = ? WHERE id = ?").run(now, "weight-1");
    const listed = await repository.listWeights();
    expect(listed.ok && listed.value.length).toBe(734);
    expect(listed.ok && listed.value.at(-1)?.id).toBe("weight-734");
    const exported = await repository.listWeightsForExport();
    expect(exported.ok && exported.value.length).toBe(734);
    expect(exported.ok && exported.value.at(-1)?.id).toBe("weight-734");
    expect(exported.ok && exported.value.some((point) => point.id === "weight-1")).toBe(false);
    database.close();
  });
});
