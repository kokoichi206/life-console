import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { fileImportRepository } from "./import-repository";

const temporaryDirectories: Array<string> = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("fileImportRepository", () => {
  it("引用符内のカンマを含む金融 CSV を読み込む", async () => {
    const directory = await mkdtemp(join(tmpdir(), "life-console-finance-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "finance.csv");
    await writeFile(path, [
      "source,source_transaction_id,kind,amount_yen,category,payment_method,payee,occurred_at",
      "sample,transaction-001,expense,1280,food,card,\"Sample shop, station branch\",2026-09-01T12:30:00+09:00",
    ].join("\n"), "utf8");

    const result = await fileImportRepository.readFinanceCsv(path);

    expect(result).toEqual({
      ok: true,
      value: [{
        source: "sample",
        sourceTransactionId: "transaction-001",
        kind: "expense",
        amountYen: 1280,
        category: "food",
        paymentMethod: "card",
        payee: "Sample shop, station branch",
        occurredAt: "2026-09-01T12:30:00+09:00",
      }],
    });
  });
});
