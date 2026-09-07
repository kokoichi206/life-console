import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import rule from "./rule.js";

RuleTester.describe = describe;
RuleTester.it = it;
new RuleTester().run("no-throw-statement", rule, {
  valid: ["const save = () => err('失敗');", "const result = await safeTry(save);"],
  invalid: [
    { code: "throw new Error('失敗');", errors: [{ messageId: "forbidden" }] },
    { code: "try { save(); } catch (error) { throw error; }", errors: [{ messageId: "forbidden" }] },
  ],
});
