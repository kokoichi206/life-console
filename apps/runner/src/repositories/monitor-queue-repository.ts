import { chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { monitorObservationSchema, type MonitorObservation } from "@life-console/contracts";
import { err, ok, safeTry } from "@life-console/core";

import { runnerError } from "../errors";

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
  const operation = async <T>(execute: () => T) => {
    const result = await safeTry(execute);
    return result.ok ? result : err(runnerError("monitor_queue_failed", "監視履歴の保存に失敗しました。", result.error));
  };
  return ok({
    save: (observation: MonitorObservation) => operation(() => { database.prepare("INSERT INTO observations VALUES (?, ?, ?)").run(observation.id, JSON.stringify(observation), new Date().toISOString()); }),
    remove: (id: string) => operation(() => { database.prepare("DELETE FROM observations WHERE id = ?").run(id); }),
    pending: (before: string) => operation(() => database.prepare("SELECT body FROM observations WHERE created_at < ? ORDER BY created_at LIMIT 100").all(before)
      .map((row) => monitorObservationSchema.parse(JSON.parse(row.body as string)))),
    close: () => database.close(),
  });
};
export type MonitorQueueRepository = Extract<Awaited<ReturnType<typeof openMonitorQueue>>, { ok: true }>["value"];
