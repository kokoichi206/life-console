import { readFile } from "node:fs/promises";

import { err, ok, safeTry, type Result } from "@life-console/contracts";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import { runnerError, type RunnerError } from "../errors";

const financeCsvRowSchema = z.object({
  source: z.string().min(1),
  sourceTransactionId: z.string().min(1),
  kind: z.enum(["income", "expense"]),
  amountYen: z.coerce.number().int().positive(),
  category: z.string().min(1),
  paymentMethod: z.string().min(1),
  payee: z.string(),
  occurredAt: z.iso.datetime({ offset: true }),
});

export type FinanceCsvRow = z.infer<typeof financeCsvRowSchema>;

export interface ImportRepository {
  readWeightCsv(path: string): Promise<Result<string, RunnerError>>;
  readFinanceCsv(path: string): Promise<Result<ReadonlyArray<FinanceCsvRow>, RunnerError>>;
}

const readUtf8 = async (path: string): Promise<Result<string, RunnerError>> => {
  const result = await safeTry(() => readFile(path, "utf8"));
  if (!result.ok) return err(runnerError("file_read_failed", "取込ファイルを読み込めません。", result.error));
  return ok(result.value);
};

export const fileImportRepository: ImportRepository = {
  readWeightCsv: readUtf8,
  async readFinanceCsv(path) {
    const read = await readUtf8(path);
    if (!read.ok) return read;
    const parsedCsv = await safeTry(() => parse(read.value, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
    }) as ReadonlyArray<ReadonlyArray<string>>);
    if (!parsedCsv.ok) return err(runnerError("invalid_finance_csv", "金融 CSV を解析できません。", parsedCsv.error));
    const [header, ...csvRows] = parsedCsv.value;
    const expectedHeader = ["source", "source_transaction_id", "kind", "amount_yen", "category", "payment_method", "payee", "occurred_at"];
    if (header === undefined || header.length !== expectedHeader.length || header.some((column, index) => column !== expectedHeader[index])) {
      return err(runnerError("invalid_finance_csv_header", "金融 CSV の header が不正です。"));
    }
    const rows = csvRows.map((csvRow) => {
      const [source, sourceTransactionId, kind, amountYen, category, paymentMethod, payee, occurredAt] = csvRow;
      return financeCsvRowSchema.safeParse({
        source,
        sourceTransactionId,
        kind,
        amountYen,
        category,
        paymentMethod,
        payee,
        occurredAt,
      });
    });
    const invalid = rows.find((row) => !row.success);
    if (invalid !== undefined && !invalid.success) {
      return err(runnerError("invalid_finance_csv_row", "金融 CSV に不正な行があります。", invalid.error));
    }
    return ok(rows.flatMap((row) => row.success ? [row.data] : []));
  },
};
