import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { err, ok, safeTry, type Result } from "@life-console/core";

import { runnerError, type RunnerError } from "../errors";

export interface CapabilityRepository {
  createReportCommand(apiUrl: string, jobId: string, leaseToken: string): Promise<Result<string, RunnerError>>;
}

export const fileCapabilityRepository: CapabilityRepository = {
  async createReportCommand(apiUrl, jobId, leaseToken) {
    const created = await safeTry(async () => {
      const directory = await mkdtemp(join(tmpdir(), "life-console-capability-"));
      const path = join(directory, "report-job.mjs");
      const reportUrl = `${apiUrl}/api/v1/job-reports/${encodeURIComponent(jobId)}/${encodeURIComponent(leaseToken)}`;
      const source = `#!/usr/bin/env node
const [outcome, summary = "Agent reported completion.", errorCode = null] = process.argv.slice(2);
if (outcome !== "succeeded" && outcome !== "failed") {
  console.error("usage: report-job.mjs succeeded|failed summary [error-code]");
  process.exit(2);
}
const response = await fetch(${JSON.stringify(reportUrl)}, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ outcome, summary, errorCode }),
});
if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}
console.error("Life Console に完了を報告しました。");
`;
      await writeFile(path, source, { encoding: "utf8", mode: 0o700 });
      await chmod(path, 0o700);
      return path;
    });
    if (!created.ok) return err(runnerError("capability_creation_failed", "完了報告コマンドを作成できません。", created.error));
    return ok(created.value);
  },
};
