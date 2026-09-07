import { describe, expect, it } from "vitest";

import { err, ok, safeTry } from "./result";

describe("Result", () => {
  it("成功値を表現する", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("期待される失敗を値として表現する", () => {
    expect(err("not_found")).toEqual({ ok: false, error: "not_found" });
  });

  it("外部 I/O の例外を Result に変換する", async () => {
    const cause = new Error("network down");
    const result = await safeTry(() => Promise.reject(cause));
    expect(result).toEqual({ ok: false, error: cause });
  });
});
