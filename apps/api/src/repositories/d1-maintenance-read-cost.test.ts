import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { createCalendarRepository } from "./calendar-repository";
import { createMonitoringRepository } from "./monitoring-repository";

const now = "2026-10-22T00:00:00.000Z";
const target = { id: "target", runnerId: "test", service: "runner" as const, account: "process", revision: 0, registeredAt: now, receivedAt: now, outcome: "healthy" as const, failures: 0 };
type CapturedQuery = { sql: string; params: unknown[] };

it("ローカル D1 で保守の結果を保ち、復旧履歴と将来予約の増加で走査を増やさない", async () => {
  const directory = mkdtempSync(join(tmpdir(), "life-console-d1-maintenance-"));
  const configPath = join(directory, "wrangler.json");
  writeFileSync(configPath, JSON.stringify({ name: "d1-maintenance", compatibility_date: "2026-09-01", d1_databases: [{ binding: "DB", database_name: "fixture", database_id: "00000000-0000-0000-0000-000000000001" }] }));
  const platform = await getPlatformProxy<{ DB: D1Database }>({ configPath, persist: false, envFiles: [], remoteBindings: false });
  try {
    const db = platform.env.DB;
    const migrations = readdirSync("packages/db/migrations").filter((name) => name.endsWith(".sql")).sort();
    const apply = async (filename: string) => {
      for (const sql of readFileSync(`packages/db/migrations/${filename}`, "utf8").split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
    };
    for (const filename of migrations.filter((name) => name.slice(0, 4) < "0023")) await apply(filename);
    await db.prepare("INSERT INTO push_subscriptions(endpoint,p256dh,auth,created_at,updated_at) VALUES ('endpoint','key','auth',?,?)").bind(now, now).run();
    await db.prepare("INSERT INTO monitor_targets(id,runner_id,service,account,registered_at) VALUES ('target','test','runner','process',?)").bind(now).run();
    const addResolvedHistory = async (offset: number, count: number) => {
      await db.prepare(`WITH RECURSIVE seq(i) AS (SELECT ? UNION ALL SELECT i+1 FROM seq WHERE i < ?)
        INSERT INTO monitor_incidents(id,target_id,opened_at,resolved_at,reason)
        SELECT 'incident-'||i,'target','2026-10-01T00:00:00.000Z','2026-10-01T00:01:00.000Z','fixture' FROM seq`).bind(offset, offset + count - 1).run();
      await db.prepare(`INSERT INTO monitor_notifications(id,incident_id,endpoint,kind,slot,body,status,next_attempt_at,accepted_at,created_at)
        SELECT 'alert-'||id,id,'endpoint','alert',0,'fixture','accepted',?, ?, ? FROM monitor_incidents
        WHERE NOT EXISTS (SELECT 1 FROM monitor_notifications WHERE id = 'alert-'||monitor_incidents.id)`).bind(now, now, now).run();
      await db.prepare(`INSERT INTO monitor_notifications(id,incident_id,endpoint,kind,slot,body,status,next_attempt_at,created_at)
        SELECT 'recovery-'||id,id,'endpoint','recovery',0,'fixture','accepted',?,? FROM monitor_incidents
        WHERE NOT EXISTS (SELECT 1 FROM monitor_notifications WHERE id = 'recovery-'||monitor_incidents.id)`).bind(now, now).run();
    };
    await addResolvedHistory(0, 100);
    const calendar = createCalendarRepository(db);
    expect(await calendar.saveSettings({ district: "D", previousDayTime: "21:00", sameDayTime: "07:00", notificationsEnabled: true }, now)).toMatchObject({ ok: true });
    const before = JSON.parse(readFileSync(new URL("./fixtures/d1-maintenance-before.json", import.meta.url), "utf8")) as { monitor: CapturedQuery[]; calendar: CapturedQuery[] };
    const runBefore = (queries: CapturedQuery[]) => db.batch(queries.map((query) => db.prepare(query.sql).bind(...query.params)));
    const rowsRead = (results: D1Result[]) => results.reduce((sum, result) => sum + result.meta.rows_read, 0);
    const monitorBefore = rowsRead(await runBefore(before.monitor));
    const calendarBefore = rowsRead(await runBefore(before.calendar));
    const snapshot = async () => ({
      reminders: (await db.prepare("SELECT * FROM calendar_reminders ORDER BY id").all()).results,
      notifications: (await db.prepare("SELECT id,incident_id,endpoint,kind,slot,body,status,attempts,next_attempt_at,lease_token,lease_expires_at,accepted_at,created_at FROM monitor_notifications ORDER BY id").all()).results,
    });
    const original = await snapshot();
    for (const filename of migrations.filter((name) => name.slice(0, 4) >= "0023")) await apply(filename);
    let measuredRows = 0;
    const measuredDatabase = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        const results = await db.batch(statements);
        measuredRows += rowsRead(results);
        return results;
      },
    } as D1Database;
    const monitor = createMonitoringRepository(measuredDatabase);
    const measuredCalendar = createCalendarRepository(measuredDatabase);
    const measureMonitor = async (decision: "recover" | "hold" = "recover") => {
      measuredRows = 0;
      expect(await monitor.decide(target, decision, "正常", now)).toMatchObject({ ok: true });
      return measuredRows;
    };
    const measureCalendar = async () => {
      measuredRows = 0;
      expect(await measuredCalendar.reconcileUpcoming(now)).toMatchObject({ ok: true });
      return measuredRows;
    };
    const monitorCatchup = await measureMonitor();
    const monitorAfter = await measureMonitor();
    expect(monitorCatchup).toBeGreaterThan(monitorAfter);
    const calendarAfter = await measureCalendar();
    expect(await snapshot()).toEqual(original);
    expect(monitorAfter).toBeLessThan(monitorBefore / 10);
    expect(calendarAfter).toBeLessThan(calendarBefore / 10);
    await addResolvedHistory(100, 1000);
    await db.prepare("UPDATE monitor_incidents SET recovery_reservation_pending = 1 WHERE recovery_reservation_pending = 0").run();
    expect(await measureMonitor()).toBeGreaterThan(monitorAfter);
    expect(await measureMonitor()).toBe(monitorAfter);
    await db.prepare(`INSERT INTO monitor_incidents(id,target_id,opened_at,reason)
      VALUES ('ongoing-outage','other-target',?,'fixture')`).bind(now).run();
    await db.prepare(`WITH RECURSIVE seq(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM seq WHERE i<1199)
      INSERT INTO monitor_notifications(id,incident_id,endpoint,kind,slot,body,status,next_attempt_at,accepted_at,created_at)
      SELECT 'ongoing-alert-'||i,'ongoing-outage','endpoint','alert',i,'fixture','accepted',?,?,? FROM seq`).bind(now, now, now).run();
    expect(await measureMonitor()).toBe(monitorAfter);
    const holdingRows = await measureMonitor("hold");
    await db.prepare("UPDATE monitor_incidents SET target_id = 'target' WHERE id = 'ongoing-outage'").run();
    expect(await measureMonitor("hold")).toBe(holdingRows);
    await db.prepare(`WITH RECURSIVE seq(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM seq WHERE i<999)
      INSERT INTO calendar_events(id,source,calendar_key,source_key,title,date,notes,source_url,status,created_at,updated_at)
      SELECT 'future-'||i,'garbage','tokushima-2026-D','future-'||i,'fixture','2027-03-01','','https://example.com/','active',?,? FROM seq`).bind(now, now).run();
    expect(await calendar.reconcile(now)).toMatchObject({ ok: true });
    expect(await measureCalendar()).toBe(calendarAfter);
    // 測定値は架空データの比較で、本番の日次消費量とは区別する。
    expect({ monitorBefore, monitorAfter, calendarBefore, calendarAfter }).toMatchObject({
      monitorBefore: 305, monitorAfter: 9, calendarBefore: 573, calendarAfter: 37,
    });
  } finally {
    await platform.dispose();
    rmSync(directory, { recursive: true, force: true });
  }
}, 60_000);
