import { describe, expect, it } from "vitest";

import { createConnectorScheduleRepository } from "../apps/api/src/repositories/connector-schedule-repository";
import { createConnectorScheduleUsecase } from "../apps/api/src/usecases/connector-schedule-usecase";

import { createJobStorage } from "./support/d1-storage";

const now = "2026-09-11T01:00:00.000Z";
describe("連絡の定期実行管理", () => {
  it("未設定の全サービスを表示し、初回を指定した登録を Cron で実行できる", async () => {
    const { database, binding, repository: jobs } = createJobStorage();
    const repository = createConnectorScheduleRepository(binding);
    const usecase = createConnectorScheduleUsecase(repository, { now: () => new Date(now) }, { create: () => "s1" });
    const empty = await usecase.list();
    expect(empty.ok && empty.value.map((row) => [row.connector, row.schedules.length, row.latestJob])).toHaveLength(4);
    expect(await usecase.create({ connector: "slack", interval: "hourly", runImmediately: true })).toEqual({ ok: true, value: undefined });
    expect(await usecase.create({ connector: "slack", interval: "daily", runImmediately: false })).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await jobs.enqueueDueSchedules(now)).toMatchObject({ ok: true, value: 1 });
    const status = await usecase.list();
    expect(status.ok && status.value.find((row) => row.connector === "slack")).toMatchObject({ active: true, latestJob: { status: "queued" }, schedules: [{ interval: "hourly", enabled: true }] });
    database.close();
  });
  it("停止は予約済み job を残し、再開時に停止期間をまとめて予約しない", async () => {
    const { database, binding, repository: jobs } = createJobStorage();
    const repository = createConnectorScheduleRepository(binding);
    let clock = now;
    const usecase = createConnectorScheduleUsecase(repository, { now: () => new Date(clock) }, { create: () => "s1" });
    expect(await usecase.create({ connector: "gmail", interval: "hourly", runImmediately: true })).toMatchObject({ ok: true });
    expect(await jobs.enqueueDueSchedules(now)).toMatchObject({ ok: true, value: 1 });
    clock = "2026-09-11T01:01:00.000Z";
    expect(await usecase.update("s1", { interval: "hourly", enabled: false, updatedAt: now })).toMatchObject({ ok: true });
    expect(database.prepare("SELECT status FROM jobs").get()?.status).toBe("queued");
    expect(await jobs.enqueueDueSchedules("2026-09-12T00:00:00.000Z")).toMatchObject({ ok: true, value: 0 });
    expect(await usecase.update("s1", { interval: "daily", enabled: true, updatedAt: now })).toMatchObject({ ok: false, error: { code: "conflict" } });
    clock = "2026-09-12T01:00:00.000Z";
    expect(await usecase.update("s1", { interval: "daily", enabled: true, updatedAt: "2026-09-11T01:01:00.000Z" })).toMatchObject({ ok: true });
    expect(database.prepare("SELECT next_run_at FROM schedules").get()?.next_run_at).toBe("2026-09-13T01:00:00.000Z");
    database.close();
  });
  it("初回を即時実行しない登録と、手動同期の重複防止", async () => {
    const { database, binding, repository: jobs } = createJobStorage();
    const usecase = createConnectorScheduleUsecase(createConnectorScheduleRepository(binding), { now: () => new Date(now) }, { create: () => "s1" });
    expect(await usecase.create({ connector: "chatwork", interval: "weekly", runImmediately: false })).toMatchObject({ ok: true });
    expect(await jobs.enqueueDueSchedules(now)).toMatchObject({ ok: true, value: 0 });
    expect(database.prepare("SELECT next_run_at FROM schedules").get()?.next_run_at).toBe("2026-09-18T01:00:00.000Z");
    expect(await jobs.createJob({ id: "j1", kind: "chatwork_sync", idempotencyKey: "j1", payloadJson: "{}", now })).toMatchObject({ ok: true });
    expect(await jobs.createJob({ id: "j2", kind: "chatwork_sync", idempotencyKey: "j2", payloadJson: "{}", now })).toMatchObject({ ok: false, error: { code: "conflict" } });
    database.close();
  });
  it("会話同期以外の設定は管理 API から変更しない", async () => {
    const { database, binding, repository: jobs } = createJobStorage();
    expect(await jobs.createSchedule("other", { name: "書き出し", jobKind: "weight_obsidian_export", interval: "hourly", timezone: "Asia/Tokyo", nextRunAt: now, coalescing: "skip_if_pending", deadlineSeconds: 3600, payload: { dataDirectory: "weight" } }, now)).toMatchObject({ ok: true });
    expect(await createConnectorScheduleRepository(binding).update("other", { enabled: false, interval: "daily", updatedAt: now }, now, now)).toMatchObject({ ok: false });
    expect(database.prepare("SELECT enabled FROM schedules").get()?.enabled).toBe(1);
    database.close();
  });
});
