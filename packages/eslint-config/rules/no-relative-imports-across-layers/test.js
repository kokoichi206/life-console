import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import rule from "./rule.js";

RuleTester.describe = describe;
RuleTester.it = it;
const filename = "/project/apps/api/src/usecases/task.ts";
new RuleTester().run("no-relative-imports-across-layers", rule, {
  valid: [
    { filename, code: "import task from '@api/repositories/task';" },
    { filename, code: "import task from './task';" },
  ],
  invalid: [{ filename, code: "import task from '../repositories/task';", errors: [{ messageId: "forbidden" }] }],
});
