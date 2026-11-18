import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, execPath } from "node:process";
import { fileURLToPath, URL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const packageScripts = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).scripts;
let fixtureDirectory;
let fixtureRoot;

beforeEach(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "life-console-harness-"));
  fixtureRoot = join(fixtureDirectory, "project with spaces");
  for (const directory of [".agents/scripts", ".agents/skills/example", ".claude", ".github", "docs/agent-rules", "bin"]) {
    mkdirSync(join(fixtureRoot, directory), { recursive: true });
  }
  copyFileSync(join(repositoryRoot, ".agents/scripts/check-harness.mjs"), join(fixtureRoot, ".agents/scripts/check-harness.mjs"));
  symlinkSync(join(repositoryRoot, "node_modules"), join(fixtureRoot, "node_modules"), "dir");
  symlinkSync("AGENTS.md", join(fixtureRoot, "CLAUDE.md"));
  symlinkSync("../docs/agent-rules", join(fixtureRoot, ".claude/rules"), "dir");
  symlinkSync("../.agents/skills", join(fixtureRoot, ".claude/skills"), "dir");
  writeFileSync(join(fixtureRoot, "AGENTS.md"), "[PR テンプレート](.github/PULL_REQUEST_TEMPLATE.md#section)\n");
  writeFileSync(join(fixtureRoot, ".github/PULL_REQUEST_TEMPLATE.md"), "# section\n");
  writeFileSync(join(fixtureRoot, "docs/agent-configuration.md"), "[ルール](../.claude/rules/example.md)\n");
  writeFileSync(join(fixtureRoot, "docs/agent-rules/example.md"), "# ルール\n");
  writeFileSync(join(fixtureRoot, ".agents/skills/example/SKILL.md"), "---\nname: example\ndescription: 検証用のスキル\n---\n[追加した参照文書](./reference.md)\n");
  writeFileSync(join(fixtureRoot, ".agents/skills/example/reference.md"), "# 参照文書\n");
});

afterEach(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

const runHarness = () => spawnSync(execPath, [".agents/scripts/check-harness.mjs"], {
  cwd: fixtureRoot,
  encoding: "utf8",
});

describe("ハーネスの相対リンク検査", () => {
  it("正しい表記、アンカー、symlink 経由、Git 登録前の参照を受け付ける", () => {
    const result = runHarness();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it.each([
    ".github/pull_request_template.md",
    ".GITHUB/PULL_REQUEST_TEMPLATE.md",
    ".github/missing.md",
  ])("存在しないパス表記 %s を拒否する", (destination) => {
    writeFileSync(join(fixtureRoot, "AGENTS.md"), `[PR テンプレート](${destination})\n`);
    const result = runHarness();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(destination);
  });

  it("ファイルではないディレクトリへのリンクを拒否する", () => {
    writeFileSync(join(fixtureRoot, "AGENTS.md"), "[GitHub](.github)\n");
    const result = runHarness();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ファイルではありません");
  });
});

describe("PR 作成前のハーネス検査", () => {
  const runCreatePr = (destination) => {
    writeFileSync(join(fixtureRoot, "AGENTS.md"), `[PR テンプレート](${destination})\n`);
    writeFileSync(join(fixtureRoot, "package.json"), JSON.stringify({
      name: "harness-fixture",
      private: true,
      type: "module",
      scripts: { "harness:check": packageScripts["harness:check"], "pr:create": packageScripts["pr:create"] },
    }));
    writeFileSync(join(fixtureRoot, "bin/gh"), "#!/bin/sh\nprintf '%s\\n' \"$@\" > gh-arguments.txt\n", { mode: 0o755 });
    return spawnSync("pnpm", ["pr:create", "--base", "develop", "--title", "スキルの追加"], {
      cwd: fixtureRoot,
      env: { ...env, PATH: `${join(fixtureRoot, "bin")}:${env.PATH}` },
      encoding: "utf8",
    });
  };

  it("検査に成功した場合だけ引数を保持して GitHub CLI を呼ぶ", () => {
    const result = runCreatePr(".github/PULL_REQUEST_TEMPLATE.md");
    expect(result.stderr).not.toContain("AssertionError");
    expect(result.status).toBe(0);
    expect(readFileSync(join(fixtureRoot, "gh-arguments.txt"), "utf8")).toBe("pr\ncreate\n--base\ndevelop\n--title\nスキルの追加\n");
  });

  it("検査に失敗した場合は GitHub CLI を呼ばない", () => {
    const result = runCreatePr(".github/pull_request_template.md");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("pull_request_template.md");
    expect(() => readFileSync(join(fixtureRoot, "gh-arguments.txt"))).toThrow();
  });
});
