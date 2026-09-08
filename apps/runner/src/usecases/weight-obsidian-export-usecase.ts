import type { weightObsidianExportPayloadSchema } from "@life-console/contracts";
import { err, type Result } from "@life-console/core";
import type { ApiRepository } from "@runner/repositories/api-repository";
import type { WeightHistoryRepository, WeightHistorySync } from "@runner/repositories/weight-history-repository";
import type { z } from "zod";

import { runnerError, type RunnerError } from "../errors";

type Dependencies = {
  readonly api: Pick<ApiRepository, "listWeightsForExport">;
  readonly history: WeightHistoryRepository;
  readonly vaultPath: string | undefined;
};

export interface WeightObsidianExportUsecase {
  execute(input: z.infer<typeof weightObsidianExportPayloadSchema>, signal: AbortSignal): Promise<Result<WeightHistorySync, RunnerError>>;
}

export const createWeightObsidianExportUsecase = (dependencies: Dependencies): WeightObsidianExportUsecase => ({
  async execute(input, signal) {
    if (dependencies.vaultPath === undefined) {
      return err(runnerError("skipped_precondition", "OBSIDIAN_VAULT_PATH が未設定です。"));
    }
    const weights = await dependencies.api.listWeightsForExport(signal);
    if (!weights.ok) return weights;
    return dependencies.history.synchronize(dependencies.vaultPath, input.dataDirectory, weights.value, signal);
  },
});
