import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { exit, stdin, stderr } from "node:process";
import { fileURLToPath, URL } from "node:url";

import { ESLint } from "eslint";

let hookInputText = "";
for await (const chunk of stdin) hookInputText += chunk;
const hookInput = JSON.parse(hookInputText);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const editedFile = await realpath(resolve(hookInput.cwd, hookInput.tool_input.file_path));
const relativeFile = relative(repositoryRoot, editedFile);

if (relativeFile === ".." || relativeFile.startsWith(`..${sep}`) || isAbsolute(relativeFile)) exit(0);

const eslint = new ESLint({ cwd: repositoryRoot });
if (await eslint.isPathIgnored(editedFile)) exit(0);

const results = await eslint.lintFiles([editedFile]);
if (results.some((result) => result.errorCount > 0 || result.warningCount > 0)) {
  const formatter = await eslint.loadFormatter("stylish");
  stderr.write(`編集したファイルに lint 違反があります。\n${formatter.format(results)}`);
  exit(2);
}
