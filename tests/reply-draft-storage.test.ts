import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { D1LifeConsoleRepository } from "../apps/api/src/repositories/d1-life-console-repository";
import { createReplyDraftUsecase } from "../apps/api/src/usecases/reply-draft-usecase";

const createStorage = () => {
  const database = new DatabaseSync(":memory:");
  const migrations = new URL("../packages/database/migrations/", import.meta.url);
  for (const migration of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
    database.exec(readFileSync(new URL(migration, migrations), "utf8"));
  }
  const adaptStatement = (sql: string, parameters: (string | number | null)[] = []) => ({
    bind: (...bound: (string | number | null)[]) => adaptStatement(sql, bound),
    run: async () => ({ meta: { changes: Number(database.prepare(sql).run(...parameters).changes) } }),
    all: async () => ({ results: database.prepare(sql).all(...parameters) }),
    first: async () => database.prepare(sql).get(...parameters) ?? null,
  });
  const repository = new D1LifeConsoleRepository({
    prepare: adaptStatement,
    batch: (statements: ReturnType<typeof adaptStatement>[]) => Promise.all(statements.map((statement) => statement.run())),
  } as unknown as ConstructorParameters<typeof D1LifeConsoleRepository>[0]);
  database.prepare(`INSERT INTO conversations VALUES ('c1', 'slack', 'default/C1', '100', '依頼者', '質問', NULL, 'unprocessed', ?, ?)`).run("2026-09-06T00:00:00Z", "2026-09-06T00:00:00Z");
  database.prepare(`INSERT INTO jobs (id, kind, status, idempotency_key, payload_json, lease_token, lease_expires_at, attempt, created_at, updated_at)
    VALUES ('j1', 'reply_drafts', 'running', 'j1', '{}', 'lease1', '2026-09-06T02:00:00Z', 1, ?, ?)`).run("2026-09-06T00:00:00Z", "2026-09-06T00:00:00Z");
  return { database, repository };
};
describe("下書き保存と排他制御", () => {
  it("個別の下書きは期間外でも対象の会話だけを取得し、サービスの取り違えは拒否する", async () => {
    const { database, repository } = createStorage();
    const usecase = createReplyDraftUsecase(repository, { now: () => new Date("2026-10-01T00:00:00Z") }, { create: () => "new-job" });
    const candidates = await usecase.candidates({ connector: "slack", period: "24h", conversationId: "c1" });
    expect(candidates.ok && candidates.value.map((item) => item.id)).toEqual(["c1"]);
    const bulk = await usecase.candidates({ connector: "slack", period: "24h" });
    expect(bulk.ok && bulk.value).toEqual([]);
    expect((await usecase.generate({ connector: "chatwork", period: "7d", conversationId: "c1" })).ok).toBe(false);
    expect((await usecase.generate({ connector: "slack", period: "7d", conversationId: "missing" })).ok).toBe(false);
    database.close();
  });
  it("一覧から古い下書き対象が件数制限で欠落しない", async () => {
    const { database, repository } = createStorage();
    const insert = database.prepare("INSERT INTO conversations VALUES (?, 'slack', 'default/C1', ?, '依頼者', '質問', NULL, 'unprocessed', '2026-09-06T00:00:00Z', '2026-09-06T00:00:00Z')");
    for (let index = 0; index < 205; index += 1) insert.run(`c-${String(index)}`, `external-${String(index)}`);
    const result = await repository.listConversations({ connector: "slack", classification: null, since: null });
    expect(result.ok && result.value.length).toBe(206);
    database.close();
  });
  it("会話の再同期で ID と分類を保ち、本文と参照先を更新する", async () => {
    const { database, repository } = createStorage();
    database.exec("UPDATE conversations SET classification = 'reference'");
    const result = await repository.saveConversations([{ id: "new-id", connector: "slack", sourceId: "default/C1", externalMessageId: "100",
      authorLabel: "更新後の表示名", excerpt: "編集後の質問", sourceUrl: "https://example.com/message/100", classification: "unprocessed", occurredAt: "2026-09-06T00:00:00Z" }],
    "チャンネル", "100", "2026-09-06T00:10:00Z");
    expect(result.ok).toBe(true);
    expect(database.prepare("SELECT id, classification, excerpt, source_url FROM conversations").get()).toMatchObject({
      id: "c1", classification: "reference", excerpt: "編集後の質問", source_url: "https://example.com/message/100",
    });
    database.close();
  });
  it("再生成時に編集済み本文を保ち、返信済みの新しい判定を反映する", async () => {
    const { database, repository } = createStorage();
    const decision = { status: "ready" as const, body: "元の下書き", reason: "未返信です", replyEvidenceId: null };
    const input = { conversationId: "c1", jobId: "j1", leaseToken: "lease1", decision, checkedAt: "2026-09-06T00:00:00Z" };
    expect((await repository.saveReplyDraft(input, "2026-09-06T00:01:00Z")).ok).toBe(true);
    expect((await repository.editReplyDraft("c1", { body: "手で直した本文", updatedAt: "2026-09-06T00:01:00Z" }, "2026-09-06T00:02:00Z")).ok).toBe(true);
    expect((await repository.saveReplyDraft({ ...input, checkedAt: "2026-09-06T00:03:00Z", decision: { ...decision, body: "再生成した本文" } }, "2026-09-06T00:04:00Z")).ok).toBe(true);
    expect(database.prepare("SELECT body FROM reply_drafts").get()?.body).toBe("手で直した本文");
    expect((await repository.saveReplyDraft({ ...input, checkedAt: "2026-09-06T00:05:00Z", decision: { status: "replied", body: "", reason: "回答済みです", replyEvidenceId: "101" } }, "2026-09-06T00:06:00Z")).ok).toBe(true);
    expect(database.prepare("SELECT body, status FROM reply_drafts").get()).toMatchObject({ body: "手で直した本文", status: "replied" });
    database.close();
  });
  it("失効 lease・中止要求では保存せず、古い編集は競合として返す", async () => {
    const { database, repository } = createStorage();
    const input = { conversationId: "c1", jobId: "j1", leaseToken: "lease1", checkedAt: "2026-09-06T00:00:00Z",
      decision: { status: "ready" as const, body: "下書き", reason: "未返信", replyEvidenceId: null } };
    expect((await repository.saveReplyDraft({ ...input, leaseToken: "expired" }, "2026-09-06T00:01:00Z")).ok).toBe(false);
    expect((await repository.saveReplyDraft(input, "2026-09-06T03:00:00Z")).ok).toBe(false);
    await repository.saveReplyDraft(input, "2026-09-06T00:01:00Z");
    expect((await repository.editReplyDraft("c1", { body: "古い編集", updatedAt: "2026-09-06T00:00:00Z" }, "2026-09-06T00:02:00Z")).ok).toBe(false);
    database.exec("UPDATE jobs SET cancel_requested_at = '2026-09-06T00:02:00Z'");
    expect((await repository.saveReplyDraft(input, "2026-09-06T00:03:00Z")).ok).toBe(false);
    expect(database.prepare("SELECT body FROM reply_drafts").get()?.body).toBe("下書き");
    database.close();
  });
});
