import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import rule from "./rule.js";

RuleTester.describe = describe;
RuleTester.it = it;
new RuleTester().run("no-direct-env-access", rule, {
  valid: ["clientEnv.APP_ENV;", "configuration.apiUrl;"],
  invalid: [
    { code: "process.env.APP_ENV;", errors: [{ messageId: "boundary" }] },
    { code: "import.meta.env.VITE_APP_ENV;", errors: [{ messageId: "boundary" }] },
    { code: "const environment = process['env'];", errors: [{ messageId: "boundary" }] },
  ],
});
