import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execPath } from "node:process";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const apiDirectory = join(repositoryRoot, "apps/api");
const require = createRequire(join(apiDirectory, "package.json"));
const wrangler = resolve(dirname(require.resolve("wrangler/package.json")), require("wrangler/package.json").bin.wrangler);
const execute = promisify(execFile);

export const startLocalStack = async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "life-console-e2e-"));
  let worker;
  let closed;
  let output = "";
  context.after(async () => {
    try {
      if (worker) {
        worker.kill("SIGTERM");
        await closed;
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  const environment = {
    PATH: dirname(execPath),
    XDG_CONFIG_HOME: join(directory, "config"),
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG_PATH: join(directory, "wrangler.log"),
    CI: "true",
    NO_COLOR: "1",
  };
  const configuration = JSON.parse(await readFile(join(apiDirectory, "wrangler.jsonc"), "utf8"));
  configuration.main = resolve(apiDirectory, configuration.main);
  configuration.assets.directory = resolve(apiDirectory, configuration.assets.directory);
  // SPA の応答で Cron の実行成功を誤判定しないよう、開発用の呼び出しを Worker へ通す。
  configuration.assets.run_worker_first.push("/__scheduled");
  for (const database of configuration.d1_databases) database.migrations_dir = resolve(apiDirectory, database.migrations_dir);
  const configPath = join(directory, "wrangler.json");
  await writeFile(configPath, JSON.stringify(configuration));
  const persistence = join(directory, "state");
  await execute(execPath, [wrangler, "d1", "migrations", "apply", "life-console-local", "--local", "--config", configPath, "--persist-to", persistence], {
    cwd: directory, env: environment, timeout: 30_000,
  });
  worker = spawn(execPath, [wrangler, "dev", "--local", "--config", configPath, "--persist-to", persistence,
    "--ip", "127.0.0.1", "--port", "0", "--inspector-port", "0", "--test-scheduled", "--show-interactive-dev-session=false"], {
    cwd: directory, env: environment, stdio: ["ignore", "pipe", "pipe"],
  });
  closed = once(worker, "close");
  const apiUrl = await new Promise((resolveReady, reject) => {
    const timeout = globalThis.setTimeout(() => reject(new Error(`API の起動がタイムアウトしました。\n${output}`)), 30_000);
    const collect = (chunk) => {
      output += chunk.toString();
      const ready = /Ready on (http:\/\/127\.0\.0\.1:\d+)/u.exec(output);
      if (ready) {
        globalThis.clearTimeout(timeout);
        resolveReady(ready[1]);
      }
    };
    worker.stdout.on("data", collect);
    worker.stderr.on("data", collect);
    worker.once("error", (error) => {
      globalThis.clearTimeout(timeout);
      reject(error);
    });
    worker.once("close", (code) => {
      globalThis.clearTimeout(timeout);
      reject(new Error(`API が終了しました (${code})。\n${output}`));
    });
  });
  const request = (path, init) => globalThis.fetch(`${apiUrl}${path}`, { ...init, signal: globalThis.AbortSignal.timeout(5_000) });
  const readJson = async (path, init) => {
    const response = await request(path, init);
    const body = await response.text();
    assert.equal(response.status, 200, `${path}: ${body}\n${output}`);
    return JSON.parse(body).data;
  };
  return {
    directory,
    request,
    readJson,
    post: (path, body) => readJson(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    triggerCron: async () => {
      const response = await request("/__scheduled");
      assert.equal(response.status, 200, await response.text());
    },
    waitForJobs: async (count) => {
      const deadline = Date.now() + 5_000;
      let jobs;
      do {
        jobs = await readJson("/api/v1/jobs");
        if (jobs.length === count) return jobs;
        await setTimeout(50);
      } while (Date.now() < deadline);
      assert.equal(jobs.length, count, `Cron がジョブを生成しませんでした。\n${output}`);
    },
    runRunner: () => execute(execPath, [join(repositoryRoot, "apps/runner/dist/index.js"), "--once"], {
      cwd: directory,
      // 開発者の連携設定を引き継がず、専用 DB の体重ジョブだけを実行する。
      env: {
        PATH: "",
        APP_ENV: "local",
        LIFE_CONSOLE_API_URL: apiUrl,
        LIFE_CONSOLE_RUNNER_ID: "e2e-runner",
        LIFE_CONSOLE_RUNNER_NAME: "E2E runner",
        LIFE_CONSOLE_RUNNER_TOKEN: "local-runner-token",
        LIFE_CONSOLE_MONITOR_SERVICES: "",
        LIFE_CONSOLE_MONITOR_QUEUE_PATH: join(directory, "monitoring.sqlite"),
        OBSIDIAN_VAULT_PATH: directory,
      },
      timeout: 15_000,
    }),
  };
};
