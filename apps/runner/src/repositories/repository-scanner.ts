import { err, ok, safeTry, type Result } from "@life-console/core";
import { z } from "zod";

import { runnerError, type RunnerError } from "../errors";

import type { CommandRepository } from "./command-repository";

const orcaRepositoryListSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    repos: z.array(z.object({
      displayName: z.string(),
      path: z.string(),
    })),
  }),
});

export interface RepositoryScanner {
  scan(signal: AbortSignal): Promise<Result<ReadonlyArray<{ readonly name: string; readonly localPath: string }>, RunnerError>>;
}

export const createOrcaRepositoryScanner = (commands: CommandRepository): RepositoryScanner => ({
  async scan(signal) {
    const executed = await commands.execute("orca", ["repo", "list", "--json"], { signal });
    if (!executed.ok) return executed;
    const json = await safeTry(() => JSON.parse(executed.value.stdout) as unknown);
    if (!json.ok) return err(runnerError("invalid_orca_json", "Orca の repository JSON を解析できません。", json.error));
    const parsed = orcaRepositoryListSchema.safeParse(json.value);
    if (!parsed.success) return err(runnerError("invalid_orca_response", "Orca の repository 応答形式が不正です。", parsed.error));
    return ok(parsed.data.result.repos.map((repository) => ({
      name: repository.displayName,
      localPath: repository.path,
    })));
  },
});
