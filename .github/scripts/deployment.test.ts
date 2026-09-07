import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execPath } from "node:process";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

interface DeploymentWorkflow {
  jobs: {
    deploy: {
      steps: { name: string; run: string }[];
    };
  };
}

const workflow = parse(readFileSync(new URL("../workflows/deploy.yml", import.meta.url), "utf8")) as DeploymentWorkflow;
const prepareConfiguration = workflow.jobs.deploy.steps.find((step) => step.name === "Prepare deployment configuration")!;
const temporaryDirectories: string[] = [];

const createDeploymentWorkspace = () => {
  const workspace = mkdtempSync(join(tmpdir(), "life-console-deployment-"));
  temporaryDirectories.push(workspace);
  mkdirSync(join(workspace, "apps/api"), { recursive: true });
  for (const environment of ["development", "production"]) {
    const filename = `wrangler.${environment}.jsonc.example`;
    cpSync(new URL(`../../apps/api/${filename}`, import.meta.url), join(workspace, "apps/api", filename));
  }
  return workspace;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true });
});

describe("deployment configuration generation", () => {
  it.each([
    ["development", "life-console-development", "life-console-development-meal-photos"],
    ["production", "life-console", "life-console-meal-photos"],
  ])("generates %s with its own Worker and bindings", (environment, worker, bucket) => {
    const workspace = createDeploymentWorkspace();
    execFileSync("/bin/bash", ["-e", "-c", prepareConfiguration.run], {
      cwd: workspace,
      env: {
        PATH: dirname(execPath),
        DEPLOY_ENVIRONMENT: environment,
        CLOUDFLARE_ACCOUNT_ID: "deployment-test-account",
        CLOUDFLARE_D1_DATABASE_ID: `${environment}-database-id`,
        CLOUDFLARE_R2_BUCKET_NAME: bucket,
      },
    });
    const configuration = JSON.parse(readFileSync(join(workspace, `apps/api/wrangler.${environment}.jsonc`), "utf8"));
    expect(configuration).toMatchObject({
      name: worker,
      account_id: "deployment-test-account",
      vars: { APP_ENV: environment, PHOTO_UPLOAD_MODE: "worker" },
      d1_databases: [{ binding: "DB", database_name: worker, database_id: `${environment}-database-id` }],
      r2_buckets: [{ binding: "MEAL_PHOTOS", bucket_name: bucket }],
      workers_dev: true,
      preview_urls: false,
      routes: [],
    });
  });

  it("stops before generating a configuration when the environment has no D1 secret", () => {
    const workspace = createDeploymentWorkspace();
    expect(() => execFileSync("/bin/bash", ["-e", "-c", prepareConfiguration.run], {
      cwd: workspace,
      env: {
        PATH: dirname(execPath),
        DEPLOY_ENVIRONMENT: "development",
        CLOUDFLARE_ACCOUNT_ID: "deployment-test-account",
        CLOUDFLARE_R2_BUCKET_NAME: "life-console-development-meal-photos",
      },
      stdio: "pipe",
    })).toThrow(/CLOUDFLARE_D1_DATABASE_ID/);
  });
});
