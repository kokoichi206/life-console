import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import rule from "./rule.js";

RuleTester.describe = describe;
RuleTester.it = it;
const filename = fileURLToPath(new URL("./fixtures/calls.ts", import.meta.url));
new RuleTester({ languageOptions: { parser: tseslint.parser, parserOptions: { project: fileURLToPath(new URL("./fixtures/tsconfig.json", import.meta.url)) } } }).run("no-discarded-result", rule, {
  valid: [{ filename: fileURLToPath(new URL("./fixtures/valid.ts", import.meta.url)), code: readFileSync(new URL("./fixtures/valid.ts", import.meta.url), "utf8") }],
  invalid: [{ filename, code: readFileSync(filename, "utf8"), errors: [{ messageId: "discarded" }, { messageId: "discarded" }, { messageId: "discarded" }] }],
});
