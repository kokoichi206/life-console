import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execPath } from "node:process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const packageRoot = new URL("../", import.meta.url);
const temporaryDirectories: string[] = [];

const createMigrationWorkspace = () => {
  const workspace = mkdtempSync(join(tmpdir(), "life-console-migrations-"));
  temporaryDirectories.push(workspace);
  for (const path of ["src", "migrations", "scripts/check-migrations.mjs", "drizzle.config.ts", "package.json"]) {
    cpSync(new URL(path, packageRoot), join(workspace, path), { recursive: true });
  }
  symlinkSync(fileURLToPath(new URL("node_modules", packageRoot)), join(workspace, "node_modules"), "dir");
  return workspace;
};

const runMigrationCheck = (workspace: string) => spawnSync(execPath, ["scripts/check-migrations.mjs"], {
  cwd: workspace,
  encoding: "utf8",
  timeout: 10_000,
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true });
});

describe("migration completeness check", () => {
  it("accepts the committed schema and migrations", () => {
    const result = runMigrationCheck(createMigrationWorkspace());
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ["column addition", "title: text(\"title\").notNull(),", "title: text(\"title\").notNull(), priority: integer(\"priority\"),"],
    ["column rename", "title: text(\"title\")", "title: text(\"task_title\")"],
    ["constraint change", "title: text(\"title\").notNull()", "title: text(\"title\")"],
    ["index removal", "  index(\"tasks_status_due_idx\").on(table.status, table.dueAt),", ""],
  ])("rejects %s without a generated migration, without prompting", (_description, before, after) => {
    const workspace = createMigrationWorkspace();
    const schemaPath = join(workspace, "src/schema.ts");
    const originalSchema = readFileSync(schemaPath, "utf8");
    expect(originalSchema).toContain(before);
    writeFileSync(schemaPath, originalSchema.replace(before, after));
    const result = runMigrationCheck(workspace);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pnpm --filter @life-console/db generate");
  });

  it("accepts the changed schema after generating its migration", () => {
    const workspace = createMigrationWorkspace();
    const schemaPath = join(workspace, "src/schema.ts");
    writeFileSync(schemaPath, `${readFileSync(schemaPath, "utf8")}\nexport const migrationCheckProbe = sqliteTable("migration_check_probe", { id: text("id").primaryKey() });\n`);
    expect(runMigrationCheck(workspace).status).toBe(1);
    const generated = spawnSync(execPath, [fileURLToPath(new URL("node_modules/drizzle-kit/bin.cjs", packageRoot)), "generate"], {
      cwd: workspace,
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(generated.status, generated.stderr).toBe(0);
    const result = runMigrationCheck(workspace);
    expect(result.status, result.stderr).toBe(0);
  });

  it.each(["sql", "snapshot"])("rejects a missing %s even when the journal was committed", (missingFile) => {
    const workspace = createMigrationWorkspace();
    const journal = JSON.parse(readFileSync(join(workspace, "migrations/meta/_journal.json"), "utf8"));
    const latest = journal.entries.at(-1);
    const filename = missingFile === "sql" ? `${latest.tag}.sql` : `meta/${String(latest.idx).padStart(4, "0")}_snapshot.json`;
    rmSync(join(workspace, "migrations", filename));
    const result = runMigrationCheck(workspace);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(filename);
  });
});
