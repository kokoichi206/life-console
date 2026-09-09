import { chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from "node:sqlite";

import { monitorObservationSchema, type MonitorObservation } from "@life-console/contracts";
import { err, ok, safeTry } from "@life-console/core";
import { asc, eq, lt } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";

import { runnerError } from "../errors";

const observations = sqliteTable("observations", {
  id: text("id").primaryKey(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
});

export const openMonitorQueue = async (path: string) => {
  const opened = await safeTry(async () => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const database = new DatabaseSync(path);
    await chmod(path, 0o600);
    database.exec("CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL)");
    return database;
  });
  if (!opened.ok) return err(runnerError("monitor_queue_open_failed", "監視履歴の保存先を開けません。", opened.error));
  const database = opened.value;
  // node:sqlite 専用 driver がないため、接続は維持して sqlite-proxy に実行を渡す。
  const queries = drizzle(async (query, parameters: SQLInputValue[], method) => {
    const statement = database.prepare(query);
    if (method === "run") {
      statement.run(...parameters);
      return { rows: [] };
    }
    // Node の型定義は setReturnArrays による戻り値の変化を表現していない。
    statement.setReturnArrays(true);
    return { rows: method === "get"
      ? statement.get(...parameters) as unknown as SQLOutputValue[]
      : statement.all(...parameters) as unknown as SQLOutputValue[][] };
  });
  const operation = async <T>(execute: () => Promise<T>) => {
    const result = await safeTry(execute);
    return result.ok ? result : err(runnerError("monitor_queue_failed", "監視履歴の保存に失敗しました。", result.error));
  };
  return ok({
    save: (observation: MonitorObservation) => operation(async () => {
      await queries.insert(observations).values({ id: observation.id, body: JSON.stringify(observation), createdAt: new Date().toISOString() }).run();
    }),
    remove: (id: string) => operation(async () => {
      await queries.delete(observations).where(eq(observations.id, id)).run();
    }),
    pending: (before: string) => operation(async () => {
      const queued = await queries.select({ body: observations.body }).from(observations)
        .where(lt(observations.createdAt, before)).orderBy(asc(observations.createdAt)).limit(100);
      return queued.map((row) => monitorObservationSchema.parse(JSON.parse(row.body)));
    }),
    close: () => database.close(),
  });
};
export type MonitorQueueRepository = Extract<Awaited<ReturnType<typeof openMonitorQueue>>, { ok: true }>["value"];
