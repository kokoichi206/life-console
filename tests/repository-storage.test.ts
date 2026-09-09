import assert from "node:assert/strict";

import { describe, expect, it } from "vitest";

import type { NewConversation } from "../apps/api/src/repositories/life-console-repository";
import { createTaskSchema } from "../packages/contracts/src/schemas";

import { createJobStorage } from "./support/d1-storage";

const now = "2026-09-09T00:00:00.000Z";
const later = "2026-09-10T00:00:00.000Z";
const conversation: NewConversation = { id: "conversation", connector: "slack", sourceId: "channel", externalMessageId: "message",
  authorLabel: "検証用", excerpt: "架空の依頼", sourceUrl: null, occurredAt: now, classification: "unprocessed" };

describe("タスク・会話・リポジトリの永続化", () => {
  it("同期後も分類と関連付けを維持し、アーカイブと復帰を一覧へ反映する", async () => {
    const { database, repository } = createJobStorage();
    try {
      expect(await repository.createRepository("repo", "検証用リポジトリ", "/fixture/repo", now)).toEqual({ ok: true, value: undefined });
      expect(await repository.saveConversations([conversation], "検証用チャンネル", "first", now)).toEqual({ ok: true, value: 1 });
      expect(await repository.upsertSourceRepositoryMapping({ connector: "slack", sourceScope: "channel", sourceId: "channel", repositoryId: "repo" }, now)).toMatchObject({ ok: true });
      const mapping = { connector: "slack", sourceScope: "channel", sourceId: "channel", sourceLabel: "検証用チャンネル", repositoryId: "repo", repositoryName: "検証用リポジトリ" };
      expect(await repository.getSourceRepositoryMapping("slack", "channel")).toEqual({ ok: true, value: mapping });
      expect(await repository.listSourceRepositoryMappings()).toEqual({ ok: true, value: [mapping] });
      expect(await repository.getSourceRepositoryMapping("gmail", "channel")).toEqual({ ok: true, value: null });
      const task = await repository.createTaskFromConversation("task", createTaskSchema.parse({ title: "検証用タスク", repositoryId: "repo" }), conversation.id, now);
      expect(task).toMatchObject({ ok: true, value: { repositoryId: "repo", conversationId: conversation.id, status: "todo" } });
      expect(await repository.saveConversations([{ ...conversation, id: "duplicate", excerpt: "架空の更新" }], "検証用チャンネル", "second", later)).toEqual({ ok: true, value: 1 });
      expect(await repository.listConversations({ connector: "slack", classification: "task_candidate", since: now })).toMatchObject({ ok: true, value: [{ id: conversation.id, excerpt: "架空の更新" }] });
      expect(await repository.getAgentJobContext("task", "repo")).toMatchObject({ ok: true, value: { repositoryPath: "/fixture/repo" } });
      expect(await repository.updateTask("task", { status: "done" }, now)).toMatchObject({ ok: true, value: { completedAt: now } });
      expect(await repository.updateTask("task", { title: "完了済みの更新" }, later)).toMatchObject({ ok: true, value: { completedAt: now } });
      expect(await repository.updateTask("task", { status: "doing" }, later)).toMatchObject({ ok: true, value: { completedAt: null } });
      expect(await repository.syncRepositories({ repositories: [] }, [], later)).toEqual({ ok: true, value: 0 });
      expect(await repository.listRepositories()).toEqual({ ok: true, value: [] });
      expect(await repository.listTasks()).toMatchObject({ ok: true, value: [{ repositoryId: null, repositoryName: null }] });
      expect(await repository.listSourceRepositoryMappings()).toEqual({ ok: true, value: [] });
      expect(await repository.syncRepositories({ repositories: [{ name: "復帰後", localPath: "/fixture/repo" }] }, ["unused"], later)).toEqual({ ok: true, value: 1 });
      expect(await repository.listTasks()).toMatchObject({ ok: true, value: [{ repositoryId: "repo", repositoryName: "復帰後" }] });
      expect(await repository.updateTask("task", { repositoryId: null }, later)).toMatchObject({ ok: true, value: { repositoryId: null } });
    } finally { database.close(); }
  });

  it("会話からのタスク作成が失敗したら関連付けと分類の更新も取り消す", async () => {
    const { database, repository } = createJobStorage();
    try {
      expect(await repository.saveConversations([conversation], "検証用", "first", now)).toMatchObject({ ok: true });
      database.exec("CREATE TRIGGER reject_task_link BEFORE INSERT ON task_repositories BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
      expect(await repository.createTaskFromConversation("task", createTaskSchema.parse({ title: "検証用", repositoryId: "repo" }), conversation.id, now)).toMatchObject({ ok: false, error: { code: "storage_error" } });
      expect(await repository.listTasks()).toEqual({ ok: true, value: [] });
      expect(await repository.getConversation(conversation.id)).toMatchObject({ ok: true, value: { classification: "unprocessed" } });
    } finally { database.close(); }
  });
});

describe("家計の集計", () => {
  it("空の集計と、複数補正・削除済み取引・口座ごとの最新残高を扱う", async () => {
    const { database, repository } = createJobStorage();
    try {
      expect(await repository.getFinanceSummary()).toEqual({ ok: true, value: { incomeYen: 0, expenseYen: 0, netCashflowYen: 0, netWorthYen: 0,
        byCategory: [], byPaymentMethod: [], assetAllocation: [], transactions: [], adjustments: [], assetHistory: [] } });
      for (const [id, kind, amountYen] of [["income", "income", 10000], ["expense", "expense", 1000], ["deleted", "expense", 9999]] as const) {
        expect(await repository.createFinanceTransaction(id, { source: "fixture", sourceTransactionId: id, kind, amountYen, category: "食費", paymentMethod: "現金", payee: "検証用", occurredAt: now }, now)).toMatchObject({ ok: true });
      }
      expect(await repository.createFinanceTransaction("duplicate", { source: "fixture", sourceTransactionId: "expense", kind: "expense", amountYen: 99999, category: "食費", paymentMethod: "現金", payee: "検証用", occurredAt: now }, now)).toMatchObject({ ok: true });
      expect(await repository.createFinanceAdjustment("adjustment-1", { transactionId: "expense", amountDeltaYen: -100, reason: "検証用補正" }, now)).toMatchObject({ ok: true });
      expect(await repository.createFinanceAdjustment("adjustment-2", { transactionId: "expense", amountDeltaYen: 50, reason: "検証用補正" }, later)).toMatchObject({ ok: true });
      database.prepare("UPDATE finance_transactions SET deleted_at = ? WHERE id = ?").run(now, "deleted");
      for (const [id, accountName, assetKind, amountYen, occurredAt] of [["cash-old", "口座", "cash", 2000, now], ["debt", "負債", "debt", 500, now], ["cash-new", "口座", "cash", 3000, later]] as const) {
        expect(await repository.createAssetBalance(id, { accountName, assetKind, amountYen, occurredAt }, now)).toMatchObject({ ok: true });
      }
      const summary = await repository.getFinanceSummary();
      assert(summary.ok);
      expect(summary.value).toMatchObject({ incomeYen: 10000, expenseYen: 950, netCashflowYen: 9050, netWorthYen: 2500,
        byCategory: [{ category: "食費", amountYen: 950 }], byPaymentMethod: [{ paymentMethod: "現金", amountYen: 950 }],
        assetAllocation: [{ assetKind: "cash", amountYen: 3000 }, { assetKind: "debt", amountYen: 500 }],
        assetHistory: [{ occurredAt: now, netWorthYen: 1500 }, { occurredAt: later, netWorthYen: 2500 }] });
      expect(summary.value.transactions).toHaveLength(2);
      expect(summary.value.transactions.find((entry) => entry.id === "expense")).toMatchObject({ amountYen: 1000, adjustedAmountYen: 950 });
      expect(summary.value.adjustments.map((entry) => entry.id)).toEqual(["adjustment-2", "adjustment-1"]);
    } finally { database.close(); }
  });
});
