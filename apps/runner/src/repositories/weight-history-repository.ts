import { randomUUID } from "node:crypto";
import { lstat, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

import { weightCalendarDate, type WeightPoint } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import { runnerError, type RunnerError } from "../errors";

type DailyWeights = ReadonlyMap<string, number>;
export type WeightHistorySync = {
  readonly changed: boolean;
  readonly synchronizedDays: number;
  readonly totalMeasuredDays: number;
};
export interface WeightHistoryRepository {
  synchronize(vaultPath: string, dataDirectory: string, points: ReadonlyArray<WeightPoint>, signal: AbortSignal): Promise<Result<WeightHistorySync, RunnerError>>;
}

const dailyWeightSchema = z.object({
  date: z.iso.date(),
  weight_kg: z.string().trim().min(1).transform(Number).pipe(z.number().positive()),
});

const parseDailyWeights = async (csv: string): Promise<Result<DailyWeights, RunnerError>> => {
  const parsed = await safeTry((): unknown => parse(csv, { bom: true, skip_empty_lines: true, trim: true }));
  if (!parsed.ok) return err(runnerError("invalid_weight_csv", "体重 CSV を解析できません。", parsed.error));
  const table = z.array(z.array(z.string())).safeParse(parsed.value);
  if (!table.success) return err(runnerError("invalid_weight_csv", "体重 CSV の形式が不正です。", table.error));
  const [header, ...rows] = table.data;
  if (header?.[0] !== "date" || header[1] !== "weight_kg") {
    return err(runnerError("invalid_weight_csv", "体重 CSV の先頭 2 列は date,weight_kg である必要があります。"));
  }
  const weights = new Map<string, number>();
  for (const row of rows) {
    const point = dailyWeightSchema.safeParse({ date: row[0], weight_kg: row[1] });
    if (!point.success) return err(runnerError("invalid_weight_csv", "体重 CSV に不正な日付または体重があります。", point.error));
    if (weights.has(point.data.date)) return err(runnerError("duplicate_weight_csv_date", "体重 CSV に同じ日付の行が複数あります。"));
    weights.set(point.data.date, point.data.weight_kg);
  }
  return ok(weights);
};

const formatWeight = (weight: number): string => Number.isInteger(weight) ? weight.toFixed(1) : String(weight);
const sortedWeights = (weights: DailyWeights): [string, number][] => [...weights].sort(([left], [right]) => left.localeCompare(right));
const renderWeightCsv = (weights: DailyWeights): string => {
  const records = sortedWeights(weights);
  return ["date,weight_kg,ma7_kg,window_samples", ...records.map(([date, weight]) => {
    const occurredAt = Date.parse(date);
    const window = records.filter(([candidate]) => Date.parse(candidate) > occurredAt - 7 * 86_400_000 && candidate <= date);
    const average = window.reduce((sum, [, value]) => sum + value, 0) / window.length;
    return `${date},${formatWeight(weight)},${average.toFixed(2)},${String(window.length)}`;
  }), ""].join("\n");
};

const renderWeightArray = (name: "DATA" | "RECALLED", weights: DailyWeights): string => {
  const entries = sortedWeights(weights).map(([date, weight]) => `{d:"${date}", w:${formatWeight(weight)}}`);
  if (entries.length === 0) return `const ${name} = [];`;
  const lines: string[] = [];
  for (let index = 0; index < entries.length; index += 3) {
    lines.push(`  ${entries.slice(index, index + 3).join(",")}${index + 3 < entries.length ? "," : ""}`);
  }
  return `const ${name} = [\n${lines.join("\n")}\n];`;
};

export const fileWeightHistoryRepository: WeightHistoryRepository = {
  async synchronize(vaultPath, dataDirectory, points, signal) {
    const result = await safeTry(async (): Promise<Result<WeightHistorySync, RunnerError>> => {
      signal.throwIfAborted();
      const vault = await realpath(vaultPath);
      const directory = await realpath(join(vault, dataDirectory));
      const directoryWithinVault = relative(vault, directory);
      if (isAbsolute(directoryWithinVault) || directoryWithinVault.split("/").some((segment) => segment === ".." || segment === ".obsidian")) {
        return err(runnerError("invalid_weight_history_path", "体重データの保存先は vault 内を指定してください。"));
      }
      const entries = await readdir(directory);
      const csvNames = entries.filter((name) => name.startsWith("weight-") && name.endsWith(".csv")).sort();
      if (!csvNames.includes("weight-trend.csv")) return err(runnerError("weight_history_missing", "既存の weight-trend.csv があるディレクトリを指定してください。"));
      const contents = new Map<string, string>();
      const histories = new Map<string, DailyWeights>();
      const inputNames = [...csvNames, ...(entries.includes("recalled-weight.csv") ? ["recalled-weight.csv"] : [])];
      for (const name of [...inputNames, "weight-data.js"]) {
        if (!entries.includes(name)) continue;
        const path = join(directory, name);
        if ((await lstat(path)).isSymbolicLink()) return err(runnerError("invalid_weight_history_path", "体重データに symlink は指定できません。"));
        const content = await readFile(path, "utf8");
        contents.set(name, content);
        if (name === "weight-data.js") continue;
        const parsed = await parseDailyWeights(content);
        if (!parsed.ok) return parsed;
        histories.set(name, parsed.value);
      }
      const daily = new Map<string, number>();
      const chronologicalPoints = [...points].sort((left, right) =>
        Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
        || Date.parse(left.recordedAt) - Date.parse(right.recordedAt)
        || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
      for (const point of chronologicalPoints) {
        daily.set(weightCalendarDate(point.occurredAt), point.weightKg);
      }
      const merged = new Map(histories.get("weight-trend.csv")!);
      for (const [date, weight] of daily) {
        merged.set(date, weight);
      }
      histories.set("weight-trend.csv", merged);
      const measured = new Map<string, number>();
      for (const name of csvNames) {
        for (const [date, weight] of histories.get(name)!) measured.set(date, weight);
      }
      const recalled = histories.get("recalled-weight.csv") ?? new Map<string, number>();
      const outputs = [
        { name: "weight-trend.csv", content: renderWeightCsv(merged) },
        { name: "weight-data.js", content: `${renderWeightArray("DATA", measured)}\n\n${renderWeightArray("RECALLED", recalled)}\n` },
      ].filter((output) => output.content !== contents.get(output.name));
      const staged = outputs.map((output) => ({ ...output, temporaryPath: join(directory, `.${output.name}.${randomUUID()}.tmp`) }));
      try {
        for (const output of staged) await writeFile(output.temporaryPath, output.content, { encoding: "utf8", mode: 0o600, flag: "wx", signal });
        signal.throwIfAborted();
        for (const output of staged) await rename(output.temporaryPath, join(directory, output.name));
      } finally {
        for (const output of staged) await rm(output.temporaryPath, { force: true });
      }
      return ok({ changed: outputs.length > 0, synchronizedDays: daily.size, totalMeasuredDays: measured.size });
    });
    return result.ok ? result.value : err(runnerError("weight_history_sync_failed", "体重データを同期できません。保存先と CSV を確認してください。", result.error));
  },
};
