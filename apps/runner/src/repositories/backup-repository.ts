import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { err, ok, safeTry, type Result } from "@life-console/contracts";

import type { RunnerConfig } from "../config";
import { runnerError, type RunnerError } from "../errors";

import type { CommandRepository } from "./command-repository";

export interface BackupRepository {
  backup(signal: AbortSignal): Promise<Result<void, RunnerError>>;
}

export const createCloudflareBackupRepository = (
  commands: CommandRepository,
  configuration: RunnerConfig,
): BackupRepository => ({
  async backup(signal) {
    const { backupDirectory, d1DatabaseName, r2AccountId, r2BucketName, wranglerBin } = configuration;
    if (backupDirectory === undefined || d1DatabaseName === undefined || r2AccountId === undefined || r2BucketName === undefined || wranglerBin === undefined) {
      return err(runnerError("skipped_precondition", "バックアップ設定が揃っていません。"));
    }
    const date = new Date().toISOString().slice(0, 10);
    const targetDirectory = join(backupDirectory, date);
    const directory = await safeTry(() => mkdir(targetDirectory, { recursive: true, mode: 0o700 }));
    if (!directory.ok) return err(runnerError("backup_directory_failed", "バックアップ先を作成できません。", directory.error));
    const d1Export = await commands.execute(wranglerBin, [
      "d1",
      "export",
      d1DatabaseName,
      "--remote",
      "--skip-confirmation",
      "--output",
      join(targetDirectory, "d1.sql"),
    ], { signal });
    if (!d1Export.ok) return d1Export;
    const r2Backup = await commands.execute("aws", [
      "s3",
      "sync",
      `s3://${r2BucketName}`,
      join(targetDirectory, "r2"),
      "--endpoint-url",
      `https://${r2AccountId}.r2.cloudflarestorage.com`,
      "--only-show-errors",
    ], { signal });
    if (!r2Backup.ok) return r2Backup;
    return ok(undefined);
  },
});
