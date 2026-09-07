import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import noCrossLayerRelativeImport from "./no-cross-layer-relative-import.js";
import noThrowInCore from "./no-throw-in-core.js";

const verify = (code, filename, ruleName, rule) => {
  const linter = new Linter({ configType: "flat" });
  return linter.verify(code, [{
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    plugins: { custom: { rules: { [ruleName]: rule } } },
    rules: { [`custom/${ruleName}`]: "error" },
  }], { filename });
};

describe("custom ESLint rules", () => {
  it("core layer の throw を検出する", () => {
    const messages = verify("throw new Error('failed');", "apps/api/src/usecases/task.js", "no-throw-in-core", noThrowInCore);

    expect(messages.map((message) => message.messageId)).toEqual(["forbidden"]);
  });

  it("layer をまたぐ相対 import を検出する", () => {
    const messages = verify("import '../repositories/task.js';", "apps/api/src/usecases/task.js", "no-cross-layer-relative-import", noCrossLayerRelativeImport);

    expect(messages.map((message) => message.messageId)).toEqual(["forbidden"]);
  });
});
