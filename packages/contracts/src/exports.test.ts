import { expect, it } from "vitest";

import * as contracts from "./index";

it("contracts は core の Result ヘルパーを再公開しない", () => {
  for (const helper of ["ok", "err", "safeTry"]) expect(contracts).not.toHaveProperty(helper);
});
