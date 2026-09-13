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
const reportUrl = ${JSON.stringify(reportUrl)};
const request = async (url, body) => {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).data;
};
const main = async () => {
  const [action, text, errorCode = null] = process.argv.slice(2);
  if (!["ask", "succeeded", "failed"].includes(action) || !text) {
    throw new Error("usage: report-job.mjs ask question | succeeded|failed summary [error-code]");
  }
  if (action === "ask") {
    const question = await request(reportUrl + "/questions", { question: text });
    console.error("Life Console で本人の回答を待っています。");
    for (;;) {
      const reply = await request(reportUrl + "/questions/" + encodeURIComponent(question.id));
      if (reply.answer !== null) {
        console.log(reply.answer);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  await request(reportUrl, { outcome: action, summary: text, errorCode });
  console.error("Life Console に完了を報告しました。");
};
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;
      await writeFile(path, source, { encoding: "utf8", mode: 0o700 });
      await chmod(path, 0o700);
      return path;
    });
    if (!created.ok) return err(runnerError("capability_creation_failed", "完了報告コマンドを作成できません。", created.error));
    return ok(created.value);
  },
};
