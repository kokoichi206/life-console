import { spawn } from "node:child_process";

import { err, ok, type Result } from "@life-console/core";

import { runnerError, type RunnerError } from "../errors";

export type CommandOutput = {
  readonly stdout: string;
  readonly stderr: string;
};

export interface CommandRepository {
  execute(command: string, arguments_: ReadonlyArray<string>, options?: { readonly cwd?: string; readonly signal?: AbortSignal; readonly stdin?: string; readonly killSignal?: NodeJS.Signals }): Promise<Result<CommandOutput, RunnerError>>;
}

export const processCommandRepository: CommandRepository = {
  execute(command, arguments_, options) {
    return new Promise((resolve) => {
      const child = spawn(command, arguments_, {
        cwd: options?.cwd,
        signal: options?.signal,
        killSignal: options?.killSignal,
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.stdin.on("error", (cause) => {
        resolve(err(runnerError("command_input_failed", `${command} に入力を渡せませんでした。`, cause)));
      });
      child.stdin.end(options?.stdin);
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (cause) => {
        resolve(err(runnerError("command_start_failed", `${command} を開始できませんでした。`, cause)));
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(ok({ stdout, stderr }));
          return;
        }
        resolve(err(runnerError("command_failed", `${command} が終了コード ${String(code)} で失敗しました。`, { stderr, stdout })));
      });
    });
  },
};
