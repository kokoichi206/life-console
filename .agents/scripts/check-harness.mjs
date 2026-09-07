import assert from "node:assert/strict";
import { lstat, readFile, readdir, readlink, realpath, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stdout } from "node:process";
import { fileURLToPath, URL } from "node:url";

import { parse } from "yaml";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const sharedLinks = [
  ["CLAUDE.md", "AGENTS.md"],
  [".claude/rules", "../docs/agent-rules"],
  [".claude/skills", "../.agents/skills"],
];

for (const [link, target] of sharedLinks) {
  const linkPath = resolve(repositoryRoot, link);
  assert((await lstat(linkPath)).isSymbolicLink(), `${link} は共通正本への symlink にしてください。`);
  assert.equal(await readlink(linkPath), target, `${link} のリンク先が共通正本と異なります。`);
  await realpath(linkPath);
}

const markdownFiles = ["AGENTS.md", "docs/agent-configuration.md"];
for (const filename of await readdir(resolve(repositoryRoot, "docs/agent-rules"))) {
  if (filename.endsWith(".md")) markdownFiles.push(`docs/agent-rules/${filename}`);
}

const skillNames = await readdir(resolve(repositoryRoot, ".agents/skills"));
for (const skillName of skillNames) {
  const skillPath = `.agents/skills/${skillName}/SKILL.md`;
  const content = await readFile(resolve(repositoryRoot, skillPath), "utf8");
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  assert(frontmatter, `${skillPath} に YAML frontmatter がありません。`);
  const metadata = parse(frontmatter[1]);
  assert.equal(metadata.name, skillName, `${skillPath} の name をディレクトリ名に合わせてください。`);
  assert(typeof metadata.description === "string" && metadata.description.trim().length > 0, `${skillPath} に description がありません。`);
  markdownFiles.push(skillPath);
}

for (const filename of markdownFiles) {
  const markdownPath = resolve(repositoryRoot, filename);
  const content = await readFile(markdownPath, "utf8");
  for (const [, destination] of content.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/gu)) {
    if (/^(?:https?:|#)/u.test(destination)) continue;
    const targetPath = resolve(dirname(markdownPath), destination.split("#")[0]);
    assert((await stat(targetPath)).isFile(), `${filename} の参照先 ${destination} がファイルではありません。`);
  }
}

stdout.write(`AI ハーネス: 共通リンク ${sharedLinks.length} 件、スキル ${skillNames.length} 件、文書参照を確認しました。\n`);
