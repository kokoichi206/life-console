import { describe, expect, it } from "vitest";

import { createScheduleSchema } from "../../../../packages/contracts/src/schemas";

import { createApiStorage } from "./support/d1-storage";

const now = "2026-09-07T12:30:00.000Z";

describe("ジョブの時刻と実行権限", () => {
  it("複数タブから同じ会話の返信を依頼しても実行待ち job を重複させない", async () => {
    const { database, repository } = createApiStorage();
    const payloadJson = JSON.stringify({ conversationId: "c1", body: "返信" });
    expect(await repository.createJob({ id: "j1", kind: "conversation_reply", idempotencyKey: "j1", payloadJson, now })).toMatchObject({ ok: true });
    expect(await repository.createJob({ id: "j2", kind: "conversation_reply", idempotencyKey: "j2", payloadJson, now })).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(database.prepare("SELECT COUNT(*) AS count FROM jobs").get()?.count).toBe(1);
    await repository.requestJobCancel("j1", now);
    expect(await repository.createJob({ id: "j3", kind: "conversation_reply", idempotencyKey: "j3", payloadJson, now })).toMatchObject({ ok: true });
    database.close();
  });

  it("停止明けの skip_if_pending は直近の到来分にまとめ、期限切れの古い分を作らない", async () => {
    const { database, repository } = createApiStorage();
    await repository.createSchedule("s1", { name: "同期", jobKind: "slack_sync", interval: "hourly",
      timezone: "Asia/Tokyo", nextRunAt: "2026-09-06T12:00:00.000Z", coalescing: "skip_if_pending", deadlineSeconds: 7200 }, now);
    expect(await repository.enqueueDueSchedules(now)).toMatchObject({ ok: true, value: 1 });
    expect(database.prepare("SELECT deadline_at FROM jobs").get()?.deadline_at).toBe("2026-09-07T14:00:00.000Z");
    expect(await repository.claimJob("r1", "lease", "2026-09-07T12:33:00.000Z", now)).toMatchObject({ ok: true, value: { status: "claimed" } });
    database.close();
  });

  it("定期実行は到来分だけを作り、同日中の次回時刻と deadline を正しく扱う", async () => {
    const { database, repository } = createApiStorage();
    await repository.createSchedule("s1", { name: "同期", jobKind: "slack_sync", interval: "hourly",
      timezone: "Asia/Tokyo", nextRunAt: "2026-09-07T12:00:00.000Z", coalescing: "queue_all", deadlineSeconds: 7200 }, now);
    expect(await repository.enqueueDueSchedules(now)).toMatchObject({ ok: true, value: 1 });
    expect(database.prepare("SELECT next_run_at FROM schedules").get()?.next_run_at).toBe("2026-09-07T13:00:00.000Z");
    expect(await repository.claimJob("r1", "lease", "2026-09-07T12:33:00.000Z", now)).toMatchObject({ ok: true, value: { status: "claimed" } });
    expect(await repository.enqueueDueSchedules(now)).toMatchObject({ ok: true, value: 0 });
    database.close();
  });

  it("定期設定の入力を各 job に固定し、設定変更後も既存 job の入力を変えない", async () => {
    const { database, repository } = createApiStorage();
    const input = createScheduleSchema.parse({ name: "書き出し", jobKind: "weight_obsidian_export", interval: "hourly",
      timezone: "Asia/Tokyo", nextRunAt: "2026-09-07T12:00:00.000Z", coalescing: "queue_all", deadlineSeconds: 7200,
      payload: { dataDirectory: "data/weight" } });
    expect(await repository.createSchedule("export", input, now)).toMatchObject({ ok: true });
    expect(await repository.enqueueDueSchedules(now)).toMatchObject({ ok: true, value: 1 });
    database.prepare("UPDATE schedules SET payload_json = ? WHERE id = ?").run(JSON.stringify({ dataDirectory: "data/history" }), "export");
    expect(await repository.enqueueDueSchedules("2026-09-07T13:30:00.000Z")).toMatchObject({ ok: true, value: 1 });
    const rows = database.prepare("SELECT payload_json FROM jobs ORDER BY created_at").all();
    expect(rows.map((row) => JSON.parse(String(row.payload_json)))).toEqual([
      { dataDirectory: "data/weight" }, { dataDirectory: "data/history" },
    ]);
    database.close();
  });

  it("期限が過ぎた lease は Cron の処理前でも無効にする", async () => {
    const { database, repository } = createApiStorage();
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    const checkedAt = new Date().toISOString();
    const renewedUntil = new Date(Date.now() + 60_000).toISOString();
    await repository.createJob({ id: "j1", kind: "slack_sync", idempotencyKey: "j1", payloadJson: "{}", now });
    await repository.claimJob("r1", "lease", expiredAt, now);
    expect(await repository.validateLease("j1", "lease")).toMatchObject({ ok: true, value: false });
    expect(await repository.heartbeatJob("j1", { runnerId: "r1", leaseToken: "lease", waitingForUser: false, progressSummary: null },
      renewedUntil, checkedAt)).toMatchObject({ ok: false, error: { code: "invalid_lease" } });
    expect(await repository.completeJob("j1", { runnerId: "r1", leaseToken: "lease", outcome: "succeeded", summary: "完了", errorCode: null },
      checkedAt)).toMatchObject({ ok: false, error: { code: "invalid_lease" } });
    database.close();
  });

  it("実行待ちの中止は即座に確定し、その後 claim しない", async () => {
    const { database, repository } = createApiStorage();
    await repository.createJob({ id: "j1", kind: "conversation_reply", idempotencyKey: "j1", payloadJson: "{}", now });
    expect(await repository.requestJobCancel("j1", now)).toMatchObject({ ok: true });
    expect(database.prepare("SELECT status FROM jobs").get()?.status).toBe("canceled");
    expect(await repository.claimJob("r1", "lease", "2026-09-07T12:33:00.000Z", now)).toEqual({ ok: true, value: null });
    database.close();
  });

  it("送信結果が不明な返信 job は再実行せず lost にする", async () => {
    const { database, repository } = createApiStorage();
    await repository.createJob({ id: "j1", kind: "conversation_reply", idempotencyKey: "j1", payloadJson: "{}", now });
    await repository.claimJob("r1", "lease", "2026-09-07T12:33:00.000Z", now);
    await repository.markExpiredAndLostJobs("2026-09-07T12:34:00.000Z");
    expect(database.prepare("SELECT status FROM jobs").get()?.status).toBe("lost");
    database.close();
  });

  it("中止要求後に停止した batch は再 queue せず中止を確定する", async () => {
    const { database, repository } = createApiStorage();
    await repository.createJob({ id: "j1", kind: "slack_sync", idempotencyKey: "j1", payloadJson: "{}", now });
    await repository.claimJob("r1", "lease", "2026-09-07T12:33:00.000Z", now);
    await repository.requestJobCancel("j1", now);
    await repository.markExpiredAndLostJobs("2026-09-07T12:34:00.000Z");
    expect(database.prepare("SELECT status, finished_at FROM jobs").get()).toMatchObject({ status: "canceled", finished_at: "2026-09-07T12:34:00.000Z" });
    database.close();
  });
});
