import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { fileURLToPath, URL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const settings = JSON.parse(readFileSync(join(repositoryRoot, ".claude/settings.json"), "utf8"));
const lintCommand = settings.hooks.PostToolUse[0].hooks[0].command;
let fixtureRoot;
let fixtureDirectory;

beforeEach(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "life-console-hook-"));
  fixtureRoot = join(fixtureDirectory, "project with spaces");
  mkdirSync(join(fixtureRoot, ".claude/hooks"), { recursive: true });
  copyFileSync(join(repositoryRoot, ".claude/hooks/lint-after-edit.mjs"), join(fixtureRoot, ".claude/hooks/lint-after-edit.mjs"));
  symlinkSync(join(repositoryRoot, "node_modules"), join(fixtureRoot, "node_modules"), "dir");
  writeFileSync(join(fixtureRoot, "eslint.config.mjs"), `export default ${JSON.stringify([
    { ignores: ["ignored/**"] },
    { files: ["**/*.js"], rules: { "no-debugger": "error", "no-alert": "warn" } },
  ])};\n`);
});

afterEach(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

const runHook = (filePath) => spawnSync("sh", ["-c", lintCommand], {
  cwd: tmpdir(),
  env: { ...env, CLAUDE_PROJECT_DIR: fixtureRoot },
  encoding: "utf8",
  input: JSON.stringify({ cwd: fixtureRoot, tool_name: "Edit", tool_input: { file_path: filePath } }),
});

describe("編集後 lint hook", () => {
  it("違反を Claude への feedback として返し、編集内容は書き換えない", () => {
    const filePath = join(fixtureRoot, "file with spaces.js");
    writeFileSync(filePath, "debugger;\n");
    const result = runHook(filePath);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("no-debugger");
    expect(result.stdout).toBe("");
    expect(readFileSync(filePath, "utf8")).toBe("debugger;\n");
  });

  it("CI と同様に warning も報告する", () => {
    writeFileSync(join(fixtureRoot, "warning.js"), "alert('warning');\n");
    const result = runHook("warning.js");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("no-alert");
  });

  it("成功時は無出力で終了する", () => {
    writeFileSync(join(fixtureRoot, "valid.js"), "const value = 1;\n");
    const result = runHook("valid.js");
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("");
  });

  it.each(["ignored/file.js", "notes.md"])("ESLint の対象外 %s を検査しない", (filename) => {
    mkdirSync(join(fixtureRoot, "ignored"));
    writeFileSync(join(fixtureRoot, filename), "debugger;\n");
    const result = runHook(filename);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("リポジトリ外の編集へプロジェクトの lint を適用しない", () => {
    const outsideFile = join(fixtureDirectory, "outside-project.js");
    writeFileSync(outsideFile, "debugger;\n");
    const result = runHook(outsideFile);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("symlink 経由で開いたリポジトリ内ファイルも検査する", () => {
    writeFileSync(join(fixtureRoot, "invalid.js"), "debugger;\n");
    const alias = join(fixtureDirectory, "linked-project");
    symlinkSync(fixtureRoot, alias, "dir");
    const result = runHook(join(alias, "invalid.js"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("no-debugger");
  });
});
