import { err, ok } from "@life-console/core";
import { describe, expect, it, vi } from "vitest";

import { runnerError } from "../errors";

import { createWeightObsidianExportUsecase } from "./weight-obsidian-export-usecase";

describe("体重の Obsidian 同期", () => {
  it("API 取得失敗では既存データに触れない", async () => {
    const failure = err(runnerError("api_unreachable", "接続失敗"));
    const history = { synchronize: vi.fn() };
    const exportWeights = createWeightObsidianExportUsecase({
      api: { listWeightsForExport: vi.fn(async () => failure) }, history, vaultPath: "/test/vault",
    });
    expect(await exportWeights.execute({ dataDirectory: "data/weight" }, new AbortController().signal)).toEqual(failure);
    expect(history.synchronize).not.toHaveBeenCalled();
  });

  it("vault の未設定では API を呼ばず実行条件不足を返す", async () => {
    const api = { listWeightsForExport: vi.fn(async () => ok([])) };
    const exportWeights = createWeightObsidianExportUsecase({ api, history: { synchronize: vi.fn() }, vaultPath: undefined });
    expect(await exportWeights.execute({ dataDirectory: "data/weight" }, new AbortController().signal)).toMatchObject({ ok: false, error: { code: "skipped_precondition" } });
    expect(api.listWeightsForExport).not.toHaveBeenCalled();
  });
});
