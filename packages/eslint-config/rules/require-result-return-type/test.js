import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import rule from "./rule.js";

RuleTester.describe = describe;
RuleTester.it = it;
const fixture = (name) => {
  const filename = fileURLToPath(new URL(`./fixtures/${name}.ts`, import.meta.url));
  return { filename, code: readFileSync(filename, "utf8") };
};
new RuleTester({ languageOptions: { parser: tseslint.parser, parserOptions: { project: fileURLToPath(new URL("./fixtures/tsconfig.json", import.meta.url)) } } }).run("require-result-return-type", rule, {
  valid: [fixture("valid")],
  invalid: [{ ...fixture("invalid"), errors: [{ messageId: "required" }, { messageId: "required" }, { messageId: "required" }] }],
});
