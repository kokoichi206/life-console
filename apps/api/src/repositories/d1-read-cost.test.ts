import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it, vi } from "vitest";
import { getPlatformProxy } from "wrangler";

import { createJobStorage } from "../../../../tests/support/d1-storage";

import { createMonitoringRepository } from "./monitoring-repository";
import { createNutritionRepository } from "./nutrition-repository";
it("ローカル D1 で修正前後を比較", async () => {
  const storage = createJobStorage();
  const captured: { sql: string; params: unknown[] }[] = [];
  const prepare = storage.binding.prepare.bind(storage.binding);
  vi.spyOn(storage.binding, "prepare").mockImplementation((sql: string) => {
    const statement = prepare(sql);
    const bind = statement.bind.bind(statement);
    vi.spyOn(statement, "bind").mockImplementation((...params: unknown[]) => {
      captured.push({ sql, params });
      return bind(...params);
    });
    return statement;
  });
  await createNutritionRepository(storage.binding).list();
  const nutrition = captured[0]!;
  captured.length = 0;
  await createMonitoringRepository(storage.binding).decide({ id: "target", runnerId: "test", service: "runner", account: "process", revision: 0, registeredAt: "2026-09-20T00:00:00.000Z", receivedAt: null, outcome: null, failures: 0 }, "hold", "", "2026-09-26T00:00:00.000Z");
  const recovery = captured[0]!;

  const old = JSON.parse(readFileSync(new URL("./fixtures/d1-read-cost-before.json", import.meta.url), "utf8")) as { query: string }[];
  const directory = mkdtempSync(join(tmpdir(), "life-console-d1-read-cost-"));
  const configPath = join(directory, "wrangler.json");
  writeFileSync(configPath, JSON.stringify({ name: "d1-read-cost", compatibility_date: "2026-09-01", d1_databases: [{ binding: "DB", database_name: "fixture", database_id: "00000000-0000-0000-0000-000000000001" }] }));
  const platform = await getPlatformProxy<{ DB: D1Database }>({ configPath, persist: false, envFiles: [], remoteBindings: false });
  try {
    const db = platform.env.DB;
    for (const file of readdirSync("packages/db/migrations").filter((x) => x.endsWith(".sql")).sort()) {
      if (file.slice(0, 4) >= "0018") continue;
      for (const sql of readFileSync("packages/db/migrations/" + file, "utf8").split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean)) await db.prepare(sql).run();
    }
    await db.prepare(`WITH RECURSIVE seq(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM seq WHERE i<72)
 INSERT INTO meals(id,client_id,photo_id,memo,occurred_at,recorded_at,tags_json) SELECT 'meal-'||i,'client-'||i,'photo-'||i,'fixture','2026-09-20T00:00:00.000Z','2026-09-20T00:00:00.000Z','[]' FROM seq`).run();
    await db.prepare(`WITH RECURSIVE seq(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM seq WHERE i<3999)
 INSERT INTO jobs(id,kind,status,idempotency_key,payload_json,attempt,created_at,updated_at)
 SELECT 'job-'||i,CASE WHEN i<80 THEN 'nutrition_analysis' ELSE 'backup' END,'succeeded','job-'||i,json_object('mealId','meal-'||(i%73)),1,'2026-09-21T00:00:00.000Z','2026-09-21T00:00:00.000Z' FROM seq`).run();
    const before = await db.prepare(old[0]!.query).bind(1, "nutrition_analysis", 1).all();
    await db.prepare(readFileSync("packages/db/migrations/0018_soft_grim_reaper.sql", "utf8")).run();
    const indexOnly = await db.prepare(old[0]!.query).bind(1, "nutrition_analysis", 1).all();
    const after = await db.prepare(nutrition.sql).bind(...nutrition.params).all();
    expect(after.results).toEqual(before.results);
    await db.prepare(`WITH RECURSIVE seq(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM seq WHERE i<9999)
 INSERT INTO jobs(id,kind,status,idempotency_key,payload_json,attempt,created_at,updated_at)
 SELECT 'unrelated-'||i,'nutrition_analysis','succeeded','unrelated-'||i,json_object('mealId','other-'||i),1,'2026-09-22T00:00:00.000Z','2026-09-22T00:00:00.000Z' FROM seq`).run();
    const grown = await db.prepare(nutrition.sql).bind(...nutrition.params).all();
    expect(grown.results).toEqual(after.results);
    await db.prepare(`INSERT INTO push_subscriptions(endpoint,p256dh,auth,created_at,updated_at) VALUES ('endpoint','key','auth','now','now')`).run();
    await db.prepare(`WITH RECURSIVE seq(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM seq WHERE i<19)
 INSERT INTO monitor_incidents(id,target_id,opened_at,resolved_at,reason) SELECT 'incident-'||i,'target','before','now','test' FROM seq`).run();
    await db.prepare(`INSERT INTO monitor_notifications(id,incident_id,endpoint,kind,slot,body,status,next_attempt_at,accepted_at,created_at)
 SELECT 'alert-'||id,id,'endpoint','alert',0,'test','accepted','now','now','now' FROM monitor_incidents`).run();
    await db.prepare(recovery.sql).bind(...recovery.params).run();
    const monitorBefore = await db.prepare(old[1]!.query).bind("recovery", "test", "now", "now", "target", "alert").run();
    const monitorAfter = await db.prepare(recovery.sql).bind(...recovery.params).run();
    const result = { fixture: { meals: 73, jobs: 4000, nutritionJobs: 80 }, nutrition: { before: before.meta.rows_read, indexOnly: indexOnly.meta.rows_read, after: after.meta.rows_read, with10000Unrelated: grown.meta.rows_read, equal: true }, monitor: { resolvedIncidents: 20, before: monitorBefore.meta.rows_read, after: monitorAfter.meta.rows_read, changes: monitorAfter.meta.changes } };
    expect(result).toEqual({
      fixture: { meals: 73, jobs: 4000, nutritionJobs: 80 },
      nutrition: { before: 2920, indexOnly: 2920, after: 657, with10000Unrelated: 657, equal: true },
      monitor: { resolvedIncidents: 20, before: 80, after: 61, changes: 0 },
    });
    expect(after.meta.rows_read).toBeLessThan(before.meta.rows_read / 2);
    expect(grown.meta.rows_read).toBe(after.meta.rows_read);
    expect(monitorAfter.meta.rows_read).toBeLessThan(monitorBefore.meta.rows_read);
    expect(monitorAfter.meta.changes).toBe(0);
  } finally {
    await platform.dispose();
    storage.database.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 60000);
