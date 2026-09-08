import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { startLocalStack } from "./support/local-stack.mjs";

test("体重の定期書き出しが実 API・D1・runner を経由して完了する", { timeout: 90_000 }, async (context) => {
  const stack = await startLocalStack(context);
  const historyDirectory = join(stack.directory, "data/weight");
  await mkdir(historyDirectory, { recursive: true });
  await writeFile(join(historyDirectory, "weight-trend.csv"), "date,weight_kg,ma7_kg,window_samples\n2020-01-01,80.0,80.00,1\n");

  await context.test("runner 認証なし・不正な token での書き出し取得を拒否する", async () => {
    assert.equal((await stack.request("/api/v1/runner/weights/export")).status, 401);
    assert.equal((await stack.request("/api/v1/runner/weights/export", { headers: { Authorization: "Bearer invalid-token" } })).status, 401);
  });

  const schedule = (dataDirectory) => ({
    name: "体重書き出し E2E", jobKind: "weight_obsidian_export", interval: "hourly", timezone: "Asia/Tokyo",
    nextRunAt: new Date().toISOString(), coalescing: "skip_if_pending", deadlineSeconds: 7200, payload: { dataDirectory },
  });
  await context.test("HTTP で記録・設定を保存し、Cron と runner で CSV・グラフ用 JS・成功結果を更新する", async () => {
    await stack.post("/api/v1/weights", { source: "manual", sourceKey: "e2e-measurement", weightKg: 70.25, occurredAt: "2026-09-08T00:15:00Z" });
    await stack.post("/api/v1/schedules", schedule("data/weight"));
    await stack.triggerCron();
    const [queued] = await stack.waitForJobs(1);
    assert.equal(queued.status, "queued");
    await stack.triggerCron();
    await stack.runRunner();
    const jobs = await stack.readJson("/api/v1/jobs");
    assert.equal(jobs.length, 1);
    assert.partialDeepStrictEqual(jobs[0], { id: queued.id, kind: "weight_obsidian_export", status: "succeeded", errorCode: null });
    assert.equal(await readFile(join(historyDirectory, "weight-trend.csv"), "utf8"),
      "date,weight_kg,ma7_kg,window_samples\n2020-01-01,80.0,80.00,1\n2026-09-08,70.25,70.25,1\n");
    const graph = await readFile(join(historyDirectory, "weight-data.js"), "utf8");
    assert.match(graph, /\{d:"2020-01-01", w:80\.0\}/u);
    assert.match(graph, /\{d:"2026-09-08", w:70\.25\}/u);
  });

  await context.test("既存 CSV がない場合は失敗を報告し、ファイルを新規作成しない", async () => {
    const missingHistory = join(stack.directory, "data/missing-history");
    await mkdir(missingHistory);
    await stack.post("/api/v1/schedules", schedule("data/missing-history"));
    await stack.triggerCron();
    await stack.waitForJobs(2);
    await stack.runRunner();
    const jobs = await stack.readJson("/api/v1/jobs");
    assert.equal(jobs.length, 2);
    const failed = jobs.find((job) => job.status === "failed");
    assert.partialDeepStrictEqual(failed, { errorCode: "weight_history_missing" });
    assert.deepEqual(await readdir(missingHistory), []);
  });
});
