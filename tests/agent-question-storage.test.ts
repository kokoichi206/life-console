import { afterEach, describe, expect, it } from "vitest";

import { createAgentQuestionRepository } from "../apps/api/src/repositories/agent-question-repository";

import { createJobStorage } from "./support/d1-storage";

const now = "2026-09-09T00:00:00.000Z";
const expires = "2026-09-09T00:03:00.000Z";
const databases: ReturnType<typeof createJobStorage>["database"][] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});
const setup = async () => {
  const storage = createJobStorage();
  databases.push(storage.database);
  storage.database.prepare("INSERT INTO tasks (id, title, description, status, created_at, updated_at) VALUES ('t1', '確認用の調査', '', 'doing', ?, ?)").run(now, now);
  await storage.repository.createJob({ id: "j1", kind: "agent", taskId: "t1", idempotencyKey: "j1", payloadJson: "{}", now });
  await storage.repository.claimJob("r1", "lease", expires, now);
  return { ...storage, questions: createAgentQuestionRepository(storage.binding) };
};

describe("agent と本人の質問・回答", () => {
  it("通常実行は running、質問中だけ確認待ちになり、回答が保存され同じ lease から読める", async () => {
    const { repository, questions, database, binding } = await setup();
    const heartbeat = { runnerId: "r1", leaseToken: "lease", waitingForUser: false, progressSummary: null };
    expect(await repository.heartbeatJob("j1", heartbeat, expires, now)).toMatchObject({ ok: true });
    expect(database.prepare("SELECT status FROM jobs").get()?.status).toBe("running");
    expect(await questions.create("q1", "j1", "lease", "要約は何点にしますか。", now)).toMatchObject({ ok: true });
    await repository.heartbeatJob("j1", heartbeat, expires, now);
    expect(database.prepare("SELECT status FROM jobs").get()?.status).toBe("waiting_for_user");
    expect(await questions.listPending(now)).toMatchObject({ ok: true, value: [{ id: "q1", taskTitle: "確認用の調査" }] });
    expect(JSON.stringify(await questions.listPending(now))).not.toContain("lease");
    expect(await questions.answer("q1", "3 点にしてください。", now)).toEqual({ ok: true, value: undefined });
    expect(await createAgentQuestionRepository(binding).get("q1", "j1", "lease", now)).toMatchObject({ ok: true, value: { answer: "3 点にしてください。" } });
    expect(await questions.listPending(now)).toEqual({ ok: true, value: [] });
    expect(database.prepare("SELECT status FROM jobs").get()?.status).toBe("running");
  });
  it("未回答の質問を二重作成せず、別タブから回答を上書きしない", async () => {
    const { questions, database } = await setup();
    expect(await questions.create("q1", "j1", "lease", "質問", now)).toMatchObject({ ok: true });
    expect(await questions.create("q2", "j1", "lease", "重複", now)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await questions.answer("q1", "最初の回答", now)).toMatchObject({ ok: true });
    expect(await questions.answer("q1", "上書き", now)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await questions.get("q1", "j1", "lease", now)).toMatchObject({ ok: true, value: { answer: "最初の回答" } });
    expect(await questions.create("q2", "j1", "lease", "次の質問", now)).toMatchObject({ ok: true });
    expect(await questions.answer("q1", "古い質問への再送", now)).toMatchObject({ ok: false });
    expect(database.prepare("SELECT status FROM jobs").get()?.status).toBe("waiting_for_user");
  });
  it("別の job の未回答を混同せず、それぞれの実行状態を更新する", async () => {
    const { repository, questions, database } = await setup();
    await repository.createJob({ id: "j2", kind: "github_promotion", taskId: "t1", idempotencyKey: "j2", payloadJson: "{}", now });
    await repository.claimJob("r2", "lease-2", expires, now);
    expect(await questions.create("q1", "j1", "lease", "最初の作業の質問", now)).toMatchObject({ ok: true });
    await repository.heartbeatJob("j2", { runnerId: "r2", leaseToken: "lease-2", waitingForUser: true, progressSummary: null }, expires, now);
    expect(database.prepare("SELECT status FROM jobs WHERE id = 'j2'").get()?.status).toBe("running");
    expect(await questions.create("q2", "j2", "lease-2", "別の作業の質問", now)).toMatchObject({ ok: true });
    expect(await questions.get("q1", "j2", "lease-2", now)).toMatchObject({ ok: false });
    expect(await questions.answer("q1", "最初の作業への回答", now)).toMatchObject({ ok: true });
    expect(database.prepare("SELECT id, status FROM jobs ORDER BY id").all()).toEqual([
      { id: "j1", status: "running" }, { id: "j2", status: "waiting_for_user" },
    ]);
    expect(await questions.listPending(now)).toMatchObject({ ok: true, value: [{ id: "q2", jobId: "j2" }] });
  });
  it.each(["expired", "canceled", "finished", "reclaimed"])("%s の実行に回答や質問を渡さない", async (state) => {
    const { questions, database } = await setup();
    await questions.create("q1", "j1", "lease", "質問", now);
    if (state === "expired") database.exec("UPDATE jobs SET lease_expires_at = '2026-09-08T23:59:59Z'");
    if (state === "canceled") database.exec("UPDATE jobs SET cancel_requested_at = '2026-09-09T00:00:00Z'");
    if (state === "finished") database.exec("UPDATE jobs SET status = 'succeeded'");
    if (state === "reclaimed") database.exec("UPDATE jobs SET lease_token = 'new-lease'");
    expect(await questions.answer("q1", "回答", now)).toMatchObject({ ok: false });
    expect(await questions.get("q1", "j1", "lease", now)).toMatchObject({ ok: false });
    expect(await questions.create("q2", "j1", "lease", "新しい質問", now)).toMatchObject({ ok: false });
    expect(await questions.listPending(now)).toEqual({ ok: true, value: [] });
  });
});
