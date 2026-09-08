import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execPath } from "node:process";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";

test("ビルドした runner が Node.js で起動し、登録から空のジョブ確認まで完了する", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "runner-build-"));
  context.after(() => rm(directory, { recursive: true }));
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ path: request.url, authorization: request.headers.authorization });
    request.resume();
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ data: null }));
  });
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const { stderr } = await promisify(execFile)(execPath, [fileURLToPath(new URL("../dist/index.js", import.meta.url)), "--once"], {
    env: {
      PATH: "",
      NODE_NO_WARNINGS: "1",
      LIFE_CONSOLE_MONITOR_SERVICES: "",
      LIFE_CONSOLE_MONITOR_QUEUE_PATH: join(directory, "queue.sqlite"),
      APP_ENV: "production",
      LIFE_CONSOLE_API_URL: `http://127.0.0.1:${port}`,
      LIFE_CONSOLE_RUNNER_TOKEN: "build-test-token",
    },
    timeout: 10_000,
  });
  assert.equal(stderr, "");
  assert.deepEqual(requests, ["/api/v1/runner/register", "/api/v1/runner/monitoring/register", "/api/v1/runner/monitoring/observations", "/api/v1/runner/jobs/claim"].map((path) => ({ path, authorization: "Bearer build-test-token" })));
});
