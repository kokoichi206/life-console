import { describe, expect, it } from "vitest";

import { createNutritionRepository } from "../apps/api/src/repositories/nutrition-repository";
import { createNutritionUsecase } from "../apps/api/src/usecases/nutrition-usecase";
import type { SaveNutritionEstimateInput } from "../packages/contracts/src/index";

import { createJobStorage } from "./support/d1-storage";

const now = "2026-09-09T00:00:00.000Z";
const estimate: SaveNutritionEstimateInput = { mealId: "meal", jobId: "job", leaseToken: "11111111-1111-4111-8111-111111111111",
  model: "test-model", analyzedAt: now, inputHash: "a".repeat(64), caloriesKcal: 600, proteinGrams: 25.5, fatGrams: 15.2, carbohydrateGrams: 80 };
const setup = async () => {
  const storage = createJobStorage();
  await storage.repository.createMealAndQueueNutrition("meal", { clientId: "meal-client", photoId: "photo", memo: "食事メモ", mealKind: "lunch", occurredAt: now, tags: [] }, now);
  storage.database.exec("DELETE FROM jobs");
  storage.database.prepare(`INSERT INTO jobs (id, kind, status, idempotency_key, payload_json, lease_token, lease_expires_at, attempt, created_at, updated_at)
    VALUES ('job', 'nutrition_analysis', 'running', 'job', '{"mealId":"meal"}', ?, '2026-09-09T01:00:00.000Z', 1, ?, ?)`).run(estimate.leaseToken, now, now);
  return { ...storage, nutrition: createNutritionRepository(storage.binding) };
};

describe("食事の栄養推定の保存", () => {
  it("元の記録を保ち、再解析は履歴を追加して最新結果を返す", async () => {
    const { database, nutrition } = await setup();
    try {
      expect(await nutrition.save("estimate-1", estimate, now)).toEqual({ ok: true, value: undefined });
      expect(await nutrition.candidates({})).toEqual({ ok: true, value: [] });
      expect(await nutrition.candidates({ mealId: "meal" })).toMatchObject({ ok: true, value: [{ id: "meal" }] });
      expect((await nutrition.save("duplicate", estimate, now)).ok).toBe(false);
      database.exec("UPDATE jobs SET id = 'job-2', idempotency_key = 'job-2'");
      expect((await nutrition.save("estimate-2", { ...estimate, jobId: "job-2", caloriesKcal: 700 }, now)).ok).toBe(true);
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{ mealId: "meal", estimate: { caloriesKcal: 700, proteinGrams: 25.5 } }] });
      expect(database.prepare("SELECT count(*) AS count FROM nutrition_estimates").get()?.count).toBe(2);
      expect(database.prepare("SELECT memo, photo_id FROM meals").get()).toMatchObject({ memo: "食事メモ", photo_id: "photo" });
    } finally { database.close(); }
  });
  it.each([
    "UPDATE jobs SET lease_token = 'expired'", "UPDATE jobs SET lease_expires_at = '2026-09-08T00:00:00Z'",
    "UPDATE jobs SET cancel_requested_at = '2026-09-09T00:00:00Z'", "UPDATE jobs SET status = 'succeeded'",
    "UPDATE jobs SET kind = 'backup'", `UPDATE jobs SET payload_json = '{"mealId":"other"}'`,
    "UPDATE meals SET deleted_at = '2026-09-09T00:00:00Z'",
  ])("失効した実行・別の対象には保存しない: %s", async (sql) => {
    const { database, nutrition } = await setup();
    try {
      database.exec(sql);
      expect((await nutrition.save("estimate", estimate, now)).ok).toBe(false);
      expect(database.prepare("SELECT count(*) AS count FROM nutrition_estimates").get()?.count).toBe(0);
    } finally { database.close(); }
  });
  it("写真のない食事・削除済みを解析せず、100 件より前も集計対象にする", async () => {
    const { database, repository, nutrition } = await setup();
    try {
      for (let index = 0; index < 101; index += 1) await repository.createMealAndQueueNutrition(`memo-${index}`, { clientId: `client-${index}`, photoId: null,
        memo: "メモのみ", mealKind: "snack", occurredAt: now, tags: [] }, now);
      expect(await nutrition.candidates({})).toEqual({ ok: true, value: [] });
      expect(await nutrition.candidates({ mealId: "meal" })).toMatchObject({ ok: true, value: [{ id: "meal" }] });
      const listed = await nutrition.list();
      expect(listed.ok && listed.value.length).toBe(102);
      const usecase = createNutritionUsecase(nutrition, repository, { now: () => new Date(now) }, { create: () => "new-job" });
      expect((await usecase.generate({ mealId: "memo-0" })).ok).toBe(false);
      expect((await usecase.generate({ mealId: "missing" })).ok).toBe(false);
      expect((await usecase.generate({ mealId: "meal" })).ok).toBe(false);
      expect((await usecase.generate({})).ok).toBe(false);
      database.exec("UPDATE jobs SET status = 'succeeded'");
      expect((await usecase.generate({ mealId: "meal" })).ok).toBe(true);
    } finally { database.close(); }
  });
});

describe("写真付き食事の自動解析予約", () => {
  const input = { clientId: "meal-client", photoId: "photo", memo: "昼食", mealKind: "lunch" as const, occurredAt: now, tags: [] };
  it("保存の再送・解析後の再送でも初回の予約は 1 件で、メモのみは予約しない", async () => {
    const { database, repository } = createJobStorage();
    try {
      expect((await repository.createMealAndQueueNutrition("meal", input, now)).ok).toBe(true);
      expect(await repository.createMealAndQueueNutrition("retry", input, now)).toMatchObject({ ok: true, value: { id: "meal" } });
      expect(database.prepare("SELECT kind, status, payload_json, deadline_at FROM jobs").get()).toMatchObject({
        kind: "nutrition_analysis", status: "queued", payload_json: JSON.stringify({ mealId: "meal" }), deadline_at: null,
      });
      database.exec("UPDATE jobs SET status = 'succeeded'");
      expect((await repository.createMealAndQueueNutrition("retry-after-analysis", input, now)).ok).toBe(true);
      expect((await repository.createMealAndQueueNutrition("memo", { ...input, clientId: "memo-client", photoId: null }, now)).ok).toBe(true);
      expect(database.prepare("SELECT count(*) AS count FROM jobs").get()?.count).toBe(1);
      expect(database.prepare("SELECT count(*) AS count FROM meals").get()?.count).toBe(2);
    } finally { database.close(); }
  });
  it("ジョブ登録に失敗したら食事保存も戻し、再送で両方を保存できる", async () => {
    const { database, repository } = createJobStorage();
    try {
      database.exec("CREATE TRIGGER fail_job BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT, 'job storage unavailable'); END");
      expect((await repository.createMealAndQueueNutrition("meal", input, now)).ok).toBe(false);
      expect(database.prepare("SELECT count(*) AS count FROM meals").get()?.count).toBe(0);
      database.exec("DROP TRIGGER fail_job");
      expect((await repository.createMealAndQueueNutrition("meal", input, now)).ok).toBe(true);
      expect(database.prepare("SELECT count(*) AS count FROM jobs").get()?.count).toBe(1);
    } finally { database.close(); }
  });
  it("一括解析が実行中でも新しい写真は個別予約し、一括の候補には重ねない", async () => {
    const { database, repository, binding } = createJobStorage();
    try {
      database.prepare("INSERT INTO jobs (id, kind, status, idempotency_key, payload_json, attempt, created_at, updated_at) VALUES ('bulk', 'nutrition_analysis', 'running', 'bulk', '{}', 1, ?, ?)").run(now, now);
      expect((await repository.createMealAndQueueNutrition("meal", input, now)).ok).toBe(true);
      expect(database.prepare("SELECT count(*) AS count FROM jobs").get()?.count).toBe(2);
      expect(await createNutritionRepository(binding).candidates({})).toEqual({ ok: true, value: [] });
      expect(await createNutritionRepository(binding).candidates({ mealId: "meal" })).toMatchObject({ ok: true, value: [{ id: "meal" }] });
    } finally { database.close(); }
  });
});
