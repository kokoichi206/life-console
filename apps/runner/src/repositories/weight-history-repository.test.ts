import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import type { WeightPoint } from "@life-console/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { fileWeightHistoryRepository } from "./weight-history-repository";

const temporaryDirectories: string[] = [];
const header = "date,weight_kg,ma7_kg,window_samples\n";
const measurement = (date: string, weightKg: number): WeightPoint => ({
  id: date, source: "manual", occurredAt: `${date}T00:00:00+09:00`, recordedAt: `${date}T00:00:00+09:00`, weightKg,
});
const prepareHistory = async () => {
  const directory = await mkdtemp(join(tmpdir(), "life-console-weight-history-"));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, "weight-trend.csv"), `${header}2026-01-01,80.0,80.00,1\n2026-09-01,70.0,70.00,1\n`);
  await writeFile(join(directory, "weight-2020-2021.csv"), `${header}2020-12-25,77.5,77.50,1\n`);
  await writeFile(join(directory, "recalled-weight.csv"), "date,weight_kg\n2025-01-01,90.0\n");
  await writeFile(join(directory, "weight-trend.html"), "existing graph template");
  return directory;
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("既存の体重 CSV とグラフへの同期", () => {
  it("DB にない過去分を残して日付でマージし、アーカイブと推定値を含む JS を作る", async () => {
    const directory = await prepareHistory();
    const archive = await readFile(join(directory, "weight-2020-2021.csv"), "utf8");
    const points = [measurement("2026-09-01", 70), measurement("2026-09-02", 69.8)];
    expect(await fileWeightHistoryRepository.synchronize(directory, ".", points, new AbortController().signal)).toMatchObject({
      ok: true, value: { changed: true, synchronizedDays: 2, totalMeasuredDays: 4 },
    });
    const csv = await readFile(join(directory, "weight-trend.csv"), "utf8");
    expect(csv).toBe(`${header}2026-01-01,80.0,80.00,1\n2026-09-01,70.0,70.00,1\n2026-09-02,69.8,69.90,2\n`);
    const script = await readFile(join(directory, "weight-data.js"), "utf8");
    const graph = runInNewContext(`${script}\n({DATA, RECALLED})`) as { DATA: { d: string; w: number }[]; RECALLED: { d: string; w: number }[] };
    expect(graph.DATA.map((point) => point.d)).toEqual(["2020-12-25", "2026-01-01", "2026-09-01", "2026-09-02"]);
    expect(graph.RECALLED).toEqual([{ d: "2025-01-01", w: 90 }]);
    expect(await readFile(join(directory, "weight-2020-2021.csv"), "utf8")).toBe(archive);
    expect(await readFile(join(directory, "weight-trend.html"), "utf8")).toBe("existing graph template");
  });

  it("再実行しても行を増やさず、同じ内容の CSV と JS を書き換えない", async () => {
    const directory = await prepareHistory();
    const points = [measurement("2026-09-01", 70)];
    await fileWeightHistoryRepository.synchronize(directory, ".", points, new AbortController().signal);
    const csvBefore = await stat(join(directory, "weight-trend.csv"));
    const jsBefore = await stat(join(directory, "weight-data.js"));
    expect(await fileWeightHistoryRepository.synchronize(directory, ".", points, new AbortController().signal)).toMatchObject({ ok: true, value: { changed: false } });
    expect((await stat(join(directory, "weight-trend.csv"))).mtimeMs).toBe(csvBefore.mtimeMs);
    expect((await stat(join(directory, "weight-data.js"))).mtimeMs).toBe(jsBefore.mtimeMs);
  });

  it("DB の記録が空でも CSV にある過去分を削除しない", async () => {
    const directory = await prepareHistory();
    const before = await readFile(join(directory, "weight-trend.csv"), "utf8");
    expect(await fileWeightHistoryRepository.synchronize(directory, ".", [], new AbortController().signal)).toMatchObject({ ok: true });
    expect(await readFile(join(directory, "weight-trend.csv"), "utf8")).toBe(before);
  });

  it("アーカイブの不正な行を検出した場合、CSV も JS も変更しない", async () => {
    const directory = await prepareHistory();
    const before = await readFile(join(directory, "weight-trend.csv"), "utf8");
    await writeFile(join(directory, "weight-data.js"), "original script");
    await writeFile(join(directory, "weight-2020-2021.csv"), `${header}not-a-date,77.5,77.50,1\n`);
    expect(await fileWeightHistoryRepository.synchronize(directory, ".", [measurement("2026-09-02", 69.8)], new AbortController().signal)).toMatchObject({ ok: false });
    expect(await readFile(join(directory, "weight-trend.csv"), "utf8")).toBe(before);
    expect(await readFile(join(directory, "weight-data.js"), "utf8")).toBe("original script");
  });
  it("DB の訂正を既存の日付へ反映し、移動平均と JS も更新する", async () => {
    const directory = await prepareHistory();
    const points = [measurement("2026-09-01", 68), measurement("2026-09-02", 70)];
    expect(await fileWeightHistoryRepository.synchronize(directory, ".", points, new AbortController().signal)).toMatchObject({ ok: true });
    expect(await readFile(join(directory, "weight-trend.csv"), "utf8")).toBe(`${header}2026-01-01,80.0,80.00,1\n2026-09-01,68.0,68.00,1\n2026-09-02,70.0,69.00,2\n`);
    expect(await readFile(join(directory, "weight-data.js"), "utf8")).toContain("{d:\"2026-09-01\", w:68.0}");
  });

  it("取得順や登録順に依存せず、日本時間の各日の最後の測定を採用する", async () => {
    const directory = await prepareHistory();
    const points = [
      { ...measurement("2026-09-02", 69), id: "evening", occurredAt: "2026-09-02T14:59:00Z" },
      { ...measurement("2026-09-03", 68), id: "midnight", occurredAt: "2026-09-02T15:00:00Z" },
      { ...measurement("2026-09-02", 71), id: "morning", occurredAt: "2026-09-02T07:00:00+09:00", recordedAt: "2026-09-04T00:00:00Z" },
    ];
    expect(await fileWeightHistoryRepository.synchronize(directory, ".", points, new AbortController().signal)).toMatchObject({ ok: true, value: { synchronizedDays: 2 } });
    expect(await readFile(join(directory, "weight-trend.csv"), "utf8")).toBe(`${header}2026-01-01,80.0,80.00,1\n2026-09-01,70.0,70.00,1\n2026-09-02,69.0,69.50,2\n2026-09-03,68.0,69.00,3\n`);
    expect(await fileWeightHistoryRepository.synchronize(directory, ".", [...points].reverse(), new AbortController().signal)).toMatchObject({ ok: true, value: { changed: false } });
  });

  it("測定時刻が同じなら登録時刻、両方同じなら ID の順で採用値を固定する", async () => {
    const directory = await prepareHistory();
    const points = [
      { ...measurement("2026-09-02", 68), id: "b", recordedAt: "2026-09-02T01:00:00Z" },
      { ...measurement("2026-09-02", 69), id: "a", recordedAt: "2026-09-02T01:00:00Z" },
      { ...measurement("2026-09-02", 70), id: "z", recordedAt: "2026-09-02T00:00:00Z" },
    ];
    expect(await fileWeightHistoryRepository.synchronize(directory, ".", points, new AbortController().signal)).toMatchObject({ ok: true });
    expect(await readFile(join(directory, "weight-trend.csv"), "utf8")).toContain("2026-09-02,68.0,69.00,2");
    expect(await fileWeightHistoryRepository.synchronize(directory, ".", [...points].reverse(), new AbortController().signal)).toMatchObject({ ok: true, value: { changed: false } });
  });

  it("中止された同期はファイルに触れない", async () => {
    const directory = await prepareHistory();
    const before = await readFile(join(directory, "weight-trend.csv"), "utf8");
    const controller = new AbortController();
    controller.abort();
    expect(await fileWeightHistoryRepository.synchronize(directory, ".", [measurement("2026-09-02", 69.8)], controller.signal)).toMatchObject({ ok: false });
    expect(await readFile(join(directory, "weight-trend.csv"), "utf8")).toBe(before);
  });
});
