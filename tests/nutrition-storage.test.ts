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
  await storage.repository.createMealAndQueueNutrition("meal", { clientId: "meal-client", photoId: "photo", memo: "食事メモ", occurredAt: now, tags: [] }, now);
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
  it("メモのみは個別に解析でき、100 件より前も集計対象にする", async () => {
    const { database, repository, nutrition } = await setup();
    try {
      for (let index = 0; index < 101; index += 1) await repository.createMealAndQueueNutrition(`memo-${index}`, { clientId: `client-${index}`, photoId: null,
        memo: "メモのみ", occurredAt: now, tags: [] }, now);
      expect(await nutrition.candidates({})).toEqual({ ok: true, value: [] });
      expect(await nutrition.candidates({ mealId: "meal" })).toMatchObject({ ok: true, value: [{ id: "meal" }] });
      const listed = await nutrition.list();
      expect(listed.ok && listed.value.length).toBe(102);
      const usecase = createNutritionUsecase(nutrition, repository, { now: () => new Date(now) }, { create: () => "new-job" });
      expect(await nutrition.candidates({ mealId: "memo-0" })).toMatchObject({ ok: true, value: [{ id: "memo-0", photoId: null }] });
      expect((await usecase.generate({ mealId: "missing" })).ok).toBe(false);
      expect((await usecase.generate({ mealId: "meal" })).ok).toBe(false);
      expect((await usecase.generate({})).ok).toBe(false);
      database.exec("UPDATE jobs SET status = 'succeeded'");
      expect((await usecase.generate({ mealId: "meal" })).ok).toBe(true);
    } finally { database.close(); }
  });
});

describe("写真付き食事の自動解析予約", () => {
  const input = { clientId: "meal-client", photoId: "photo", memo: "食事メモ", occurredAt: now, tags: [] };
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

describe("栄養推定の読み取り結果", () => {
  it("解析結果もジョブもない写真・メモは null を返す", async () => {
    const { database, repository, binding } = createJobStorage();
    try {
      for (const photoId of ["photo", null]) {
        const id = photoId ?? "memo";
        expect((await repository.createMealAndQueueNutrition(id, { clientId: id, photoId, memo: "", occurredAt: now, tags: [] }, now)).ok).toBe(true);
      }
      database.exec("DELETE FROM jobs");
      const result = await createNutritionRepository(binding).list();
      expect(result).toMatchObject({ ok: true, value: [
        { mealId: "photo", photoId: "photo", estimate: null, analysisStatus: null, analysisSummary: null },
        { mealId: "memo", photoId: null, estimate: null, analysisStatus: null, analysisSummary: null },
      ] });
    } finally { database.close(); }
  });
  it("同時刻の再解析は後から登録したジョブを表示し、保存済みなら完了として返す", async () => {
    const { database, nutrition } = await setup();
    try {
      expect((await nutrition.save("estimate-1", estimate, now)).ok).toBe(true);
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{ analysisStatus: "succeeded" }] });
      database.prepare(`INSERT INTO jobs (id, kind, status, idempotency_key, payload_json, attempt, created_at, updated_at, summary)
        VALUES ('retry', 'nutrition_analysis', 'failed', 'retry', '{"mealId":"meal"}', 1, ?, ?, '解析失敗')`).run(now, now);
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{
        estimate: { caloriesKcal: 600, proteinGrams: 25.5 }, analysisStatus: "failed", analysisSummary: "解析失敗",
      }] });
      database.prepare("UPDATE jobs SET status = 'running', lease_token = ?, lease_expires_at = '2026-09-09T01:00:00.000Z' WHERE id = 'retry'").run(estimate.leaseToken);
      expect((await nutrition.save("estimate-2", { ...estimate, jobId: "retry", caloriesKcal: 700 }, now)).ok).toBe(true);
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{ estimate: { caloriesKcal: 700 }, analysisStatus: "succeeded" }] });
    } finally { database.close(); }
  });
  it("source job のない推定結果は消さず、ジョブ状態を成功に補完しない", async () => {
    const { database, nutrition } = await setup();
    try {
      expect((await nutrition.save("estimate", estimate, now)).ok).toBe(true);
      database.exec("UPDATE nutrition_estimates SET source_job_id = NULL; DELETE FROM jobs;");
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{
        estimate: { caloriesKcal: 600, proteinGrams: 25.5, fatGrams: 15.2, carbohydrateGrams: 80 }, analysisStatus: null,
      }] });
    } finally { database.close(); }
  });
  it("一括ジョブは作成前の未解析写真と自身の解析結果にだけ紐づく", async () => {
    const { database, repository, nutrition } = await setup();
    try {
      expect((await nutrition.save("estimate", estimate, now)).ok).toBe(true);
      for (const [id, photoId, recordedAt] of [
        ["pending-photo", "photo-2", now],
        ["later-photo", "photo-3", "2026-09-09T00:02:00.000Z"],
        ["memo", null, now],
      ] as const) {
        expect((await repository.createMealAndQueueNutrition(id, { clientId: id, photoId, memo: "", occurredAt: recordedAt, tags: [] }, recordedAt)).ok).toBe(true);
      }
      database.exec("DELETE FROM jobs");
      database.prepare(`INSERT INTO jobs (id, kind, status, idempotency_key, payload_json, attempt, created_at, updated_at)
        VALUES ('bulk', 'nutrition_analysis', 'running', 'bulk', '{}', 1, ?, ?)`).run("2026-09-09T00:01:00.000Z", now);
      const result = await nutrition.list();
      expect(result.ok && result.value.map(({ mealId, analysisStatus }) => ({ mealId, analysisStatus }))).toEqual([
        { mealId: "later-photo", analysisStatus: null },
        { mealId: "meal", analysisStatus: null },
        { mealId: "pending-photo", analysisStatus: "running" },
        { mealId: "memo", analysisStatus: null },
      ]);
      database.exec("UPDATE nutrition_estimates SET source_job_id = 'bulk'");
      expect(await nutrition.list()).toMatchObject({ ok: true, value: expect.arrayContaining([
        expect.objectContaining({ mealId: "meal", analysisStatus: "succeeded" }),
      ]) });
    } finally { database.close(); }
  });
  it("一括候補は未解析写真だけを時刻順に返し、個別指定なら解析済みも取得する", async () => {
    const { database, repository, nutrition } = await setup();
    try {
      expect((await nutrition.save("estimate", estimate, now)).ok).toBe(true);
      for (const [id, occurredAt] of [["later", "2026-09-10T00:00:00.000Z"], ["earlier", "2026-09-08T00:00:00.000Z"], ["deleted", now]] as const) {
        expect((await repository.createMealAndQueueNutrition(id, { clientId: id, photoId: id, memo: "", occurredAt, tags: [] }, now)).ok).toBe(true);
      }
      database.exec("UPDATE jobs SET status = 'succeeded'; UPDATE meals SET deleted_at = 'deleted' WHERE id = 'deleted'");
      expect(await nutrition.candidates({})).toEqual({ ok: true, value: [
        { id: "earlier", photoId: "earlier", memo: "" },
        { id: "later", photoId: "later", memo: "" },
      ] });
      expect(await nutrition.candidates({ mealId: "meal" })).toMatchObject({ ok: true, value: [{ id: "meal", photoId: "photo" }] });
      expect((await nutrition.candidates({ mealId: "deleted" })).ok).toBe(false);
      expect(await nutrition.list()).toMatchObject({ ok: true, value: expect.not.arrayContaining([expect.objectContaining({ mealId: "deleted" })]) });
    } finally { database.close(); }
  });
  it("読み取りの SQL エラーを空の成功に変換しない", async () => {
    const { database, nutrition } = await setup();
    try {
      database.exec("DROP TABLE meals");
      expect(await nutrition.list()).toMatchObject({ ok: false, error: { code: "storage_error" } });
      expect(await nutrition.candidates({})).toMatchObject({ ok: false, error: { code: "storage_error" } });
    } finally { database.close(); }
  });
});

describe("手入力のカロリー", () => {
  it.each([0, 520])("初回の %i kcal を保存し、再送や一括解析でもジョブを予約しない", async (manualCaloriesKcal) => {
    const { database, repository, binding } = createJobStorage();
    const nutrition = createNutritionRepository(binding);
    const input = { clientId: "manual-client", photoId: "photo", memo: "食事", occurredAt: now, tags: [], manualCaloriesKcal };
    try {
      expect((await repository.createMealAndQueueNutrition("manual", input, now)).ok).toBe(true);
      expect((await repository.createMealAndQueueNutrition("retry", { ...input, manualCaloriesKcal: undefined }, now)).ok).toBe(true);
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{ manualCaloriesKcal, estimate: null, analysisStatus: null }] });
      expect(database.prepare("SELECT count(*) AS count FROM jobs").get()?.count).toBe(0);
      expect(await nutrition.candidates({})).toEqual({ ok: true, value: [] });
      expect(await nutrition.candidates({ mealId: "manual" })).toMatchObject({ ok: true, value: [{ id: "manual", photoId: "photo" }] });
      database.prepare("INSERT INTO jobs (id, kind, status, idempotency_key, payload_json, attempt, created_at, updated_at) VALUES ('bulk', 'nutrition_analysis', 'queued', 'bulk', '{}', 0, ?, ?)").run(now, now);
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{ analysisStatus: null }] });
    } finally { database.close(); }
  });
  it("詳細からの手入力を保存し、進行中の解析結果で上書きしない", async () => {
    const { database, nutrition } = await setup();
    try {
      expect(await nutrition.saveManualCalories("meal", 450)).toEqual({ ok: true, value: undefined });
      expect(await nutrition.save("late-estimate", estimate, now)).toEqual({ ok: true, value: undefined });
      expect(database.prepare("SELECT status, cancel_requested_at FROM jobs WHERE id = 'job'").get()).toMatchObject({ status: "running", cancel_requested_at: null });
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{ manualCaloriesKcal: 450, estimate: { proteinGrams: 25.5 }, analysisStatus: "succeeded" }] });
      database.exec("UPDATE jobs SET lease_token = 'expired'");
      expect(await nutrition.save("invalid-lease", estimate, now)).toMatchObject({ ok: false, error: { code: "conflict" } });
      expect(await nutrition.saveManualCalories("meal", 0)).toEqual({ ok: true, value: undefined });
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{ manualCaloriesKcal: 0 }] });
      expect((await nutrition.saveManualCalories("missing", 100)).ok).toBe(false);
      database.exec("UPDATE meals SET deleted_at = 'deleted'");
      expect((await nutrition.saveManualCalories("meal", 100)).ok).toBe(false);
    } finally { database.close(); }
  });
  it("一括解析中の手入力でも栄養素を保存し、保存元のジョブを表示する", async () => {
    const { database, nutrition } = await setup();
    try {
      database.exec("UPDATE jobs SET payload_json = '{}'");
      expect((await nutrition.saveManualCalories("meal", 450)).ok).toBe(true);
      expect((await nutrition.save("bulk-estimate", estimate, now)).ok).toBe(true);
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{ manualCaloriesKcal: 450, estimate: { proteinGrams: 25.5 }, analysisStatus: "succeeded" }] });
    } finally { database.close(); }
  });
  it("解析済みでも手入力を保存し、過去の推定履歴を保持する", async () => {
    const { database, nutrition } = await setup();
    try {
      expect((await nutrition.save("estimate", estimate, now)).ok).toBe(true);
      expect((await nutrition.saveManualCalories("meal", 500)).ok).toBe(true);
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{ manualCaloriesKcal: 500, estimate: { caloriesKcal: 600 }, analysisStatus: "succeeded" }] });
    } finally { database.close(); }
  });
});

describe("手入力時の解析予約の保持", () => {
  it("手入力の保存では解析ジョブを変更しない", async () => {
    const { database, nutrition } = await setup();
    try {
      database.exec("CREATE TRIGGER fail_cancel BEFORE UPDATE ON jobs BEGIN SELECT RAISE(ABORT, 'job storage unavailable'); END");
      expect(await nutrition.saveManualCalories("meal", 500)).toEqual({ ok: true, value: undefined });
      expect(await nutrition.list()).toMatchObject({ ok: true, value: [{ manualCaloriesKcal: 500 }] });
    } finally { database.close(); }
  });
  it("空欄保存後の手入力でも予約を保持し、他の未解析写真の候補から区別する", async () => {
    const { database, repository, binding } = createJobStorage();
    const nutrition = createNutritionRepository(binding);
    const input = { clientId: "manual-later", photoId: "photo", memo: "", occurredAt: now, tags: [] };
    try {
      expect((await repository.createMealAndQueueNutrition("manual-later", input, now)).ok).toBe(true);
      expect((await repository.createMealAndQueueNutrition("other", { ...input, clientId: "other" }, now)).ok).toBe(true);
      database.exec("UPDATE jobs SET status = 'failed' WHERE id = 'nutrition-initial:other'");
      expect((await nutrition.saveManualCalories("manual-later", 500)).ok).toBe(true);
      expect(database.prepare("SELECT status FROM jobs WHERE id = 'nutrition-initial:manual-later'").get()).toMatchObject({ status: "queued" });
      const usecase = createNutritionUsecase(nutrition, repository, { now: () => new Date(now) }, { create: () => "bulk-after-manual" });
      expect(await nutrition.candidates({})).toMatchObject({ ok: true, value: [{ id: "other" }] });
      expect((await usecase.generate({})).ok).toBe(false);
    } finally { database.close(); }
  });
});
