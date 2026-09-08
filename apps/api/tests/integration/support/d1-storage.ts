import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";

import { D1LifeConsoleRepository } from "../../../src/repositories/d1-life-console-repository";

export const createApiStorage = () => {
  const database = new DatabaseSync(":memory:");
  const migrations = new URL("../../../../../packages/db/migrations/", import.meta.url);
  for (const migration of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
    database.exec(readFileSync(new URL(migration, migrations), "utf8"));
  }
  const statement = (sql: string, parameters: (string | number | null)[] = []) => ({
    bind: (...bound: (string | number | null)[]) => statement(sql, bound),
    run: async () => {
      const results = database.prepare(sql).all(...parameters);
      return { results, meta: { changes: Number(database.prepare("SELECT changes() AS changes").get()!.changes) } };
    },
    all: async () => ({ results: database.prepare(sql).all(...parameters) }),
    first: async () => database.prepare(sql).get(...parameters) ?? null,
  });
  let batches: Promise<unknown> = Promise.resolve();
  const binding = {
    prepare: statement,
    batch: (statements: ReturnType<typeof statement>[]) => {
      const next = batches.then(async () => {
        database.exec("BEGIN");
        try {
          const results = [];
          for (const query of statements) results.push(await query.run());
          database.exec("COMMIT");
          return results;
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
      batches = next.then(() => undefined, () => undefined);
      return next;
    },
  } as unknown as ConstructorParameters<typeof D1LifeConsoleRepository>[0];
  const repository = new D1LifeConsoleRepository(binding);
  return { database, repository, binding };
};
