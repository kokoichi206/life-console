import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { D1LifeConsoleRepository } from "../../apps/api/src/repositories/d1-life-console-repository";

export const createJobStorage = () => {
  const database = new DatabaseSync(":memory:");
  const migrations = new URL("../../packages/db/migrations/", import.meta.url);
  for (const migration of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
    database.exec(readFileSync(new URL(migration, migrations), "utf8"));
  }
  const statement = (sql: string, parameters: (string | number | null)[] = []) => ({
    bind: (...bound: (string | number | null)[]) => statement(sql, bound),
    run: async () => ({ meta: { changes: Number(database.prepare(sql).run(...parameters).changes) } }),
    all: async () => ({ results: database.prepare(sql).all(...parameters) }),
    first: async () => database.prepare(sql).get(...parameters) ?? null,
  });
  const binding = {
    prepare: statement,
    batch: (statements: ReturnType<typeof statement>[]) => Promise.all(statements.map((query) => query.run())),
  } as unknown as ConstructorParameters<typeof D1LifeConsoleRepository>[0];
  const repository = new D1LifeConsoleRepository(binding);
  return { database, repository, binding };
};
