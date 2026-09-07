import { RuleTester } from "eslint";
import { describe, it, vi } from "vitest";

import rule from "./rule.js";

vi.mock("node:fs", () => ({ existsSync: (filename) => filename.endsWith("Button.stories.tsx") }));
RuleTester.describe = describe;
RuleTester.it = it;
new RuleTester().run("require-ui-storybook-story", rule, {
  valid: [
    { filename: "/app/components/ui/Button.tsx", code: "export const Button = () => null;" },
    { filename: "/app/components/ui/Input.stories.tsx", code: "export const Default = {};" },
    { filename: "/app/components/ui/Input.test.tsx", code: "test();" },
  ],
  invalid: [{ filename: "/app/components/ui/Input.tsx", code: "export const Input = () => null;", errors: [{ messageId: "missing" }] }],
});
