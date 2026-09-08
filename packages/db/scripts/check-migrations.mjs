import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stdout } from "node:process";
import { URL } from "node:url";

import { generateSQLiteDrizzleJson } from "drizzle-kit/api";

import configuration from "../drizzle.config.ts";

const packageRoot = new URL("../", import.meta.url);
const migrationsDirectory = new URL(`${configuration.out}/`, packageRoot);
const journal = JSON.parse(await readFile(new URL("meta/_journal.json", migrationsDirectory), "utf8"));

for (const entry of journal.entries) {
  await readFile(new URL(`${entry.tag}.sql`, migrationsDirectory));
}

const latestMigration = journal.entries.at(-1);
const snapshotFilename = `${String(latestMigration.idx).padStart(4, "0")}_snapshot.json`;
const savedSnapshot = JSON.parse(await readFile(new URL(`meta/${snapshotFilename}`, migrationsDirectory), "utf8"));
const schema = await import(new URL(configuration.schema, packageRoot));
const currentSnapshot = await generateSQLiteDrizzleJson(schema);

// UUID と rename の履歴は DB 定義ではなく、未設定のプロパティは保存時に省略される。
const databaseDefinition = (snapshot) => {
  const { id: _id, prevId: _prevId, _meta, ...definition } = snapshot;
  return JSON.parse(JSON.stringify(definition));
};

assert.deepStrictEqual(
  databaseDefinition(currentSnapshot),
  databaseDefinition(savedSnapshot),
  "schema と migration が一致しません。pnpm --filter @life-console/db generate を実行し、SQL と migrations/meta/ を追加してください。",
);

stdout.write("schema と migration の一致、履歴に記録された SQL ファイルの存在を確認しました。\n");
