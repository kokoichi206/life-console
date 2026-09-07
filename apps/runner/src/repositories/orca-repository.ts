import { err, ok, safeTry, type Result } from "@life-console/core";
import { z } from "zod";

import { runnerError, type RunnerError } from "../errors";

import type { CommandRepository } from "./command-repository";

const orcaStatusSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    runtime: z.object({ reachable: z.literal(true), state: z.literal("ready") }),
  }),
});

export interface OrcaRepository {
  health(): Promise<"healthy" | "unreachable">;
  launchAgent(input: { readonly executionMode: "main_checkout" | "new_worktree"; readonly jobId: string; readonly prompt: string; readonly provider: "codex" | "claude"; readonly repositoryPath: string }, signal: AbortSignal): Promise<Result<void, RunnerError>>;
}

const shellQuote = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`;

export const createOrcaRepository = (commands: CommandRepository): OrcaRepository => ({
  async health() {
    const result = await commands.execute("orca", ["status", "--json"]);
    if (!result.ok) return "unreachable";
    const parsedJson = await safeTry(() => JSON.parse(result.value.stdout) as unknown);
    if (!parsedJson.ok) return "unreachable";
    return orcaStatusSchema.safeParse(parsedJson.value).success ? "healthy" : "unreachable";
  },
  async launchAgent(input, signal) {
    const healthy = await this.health();
    if (healthy !== "healthy") return err(runnerError("orca_unreachable", "Orca runtime に接続できません。"));
    if (input.executionMode === "new_worktree") {
      const launched = await commands.execute("orca", [
        "worktree",
        "create",
        "--repo",
        `path:${input.repositoryPath}`,
        "--name",
        `life-console-${input.jobId.slice(0, 8)}`,
        "--agent",
        input.provider,
        "--prompt",
        input.prompt,
        "--setup",
        "inherit",
        "--json",
      ], { signal });
      if (!launched.ok) return launched;
      return ok(undefined);
    }
    const agentCommand = `${input.provider} ${shellQuote(input.prompt)}`;
    const launched = await commands.execute("orca", [
      "terminal",
      "create",
      "--worktree",
      `path:${input.repositoryPath}`,
      "--title",
      `Life Console ${input.jobId.slice(0, 8)}`,
      "--command",
      agentCommand,
      "--json",
    ], { signal });
    if (!launched.ok) return launched;
    return ok(undefined);
  },
});
