import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const prepareTerraformInputs = workflow.jobs.deploy.steps.find((step) => step.name === "Prepare Terraform inputs")!;
const prepareMigrationConfiguration = workflow.jobs.deploy.steps.find((step) => step.name === "Prepare D1 migration configuration from Terraform outputs")!;
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

describe("Terraform deployment configuration", () => {
  it.each(["development", "production"])("prepares private Terraform inputs for %s", (environment) => {
    const workspace = createDeploymentWorkspace();
    const root = `infra/terraform/envs/${environment}`;
    mkdirSync(join(workspace, root), { recursive: true });
    const variables = {
      cloudflare_account_id: "00000000000000000000000000000000",
      owner_email: `${environment}@example.com`,
      access_worker_id: `${environment}-worker-id`,
    };
    const log = execFileSync("/bin/bash", ["-e", "-c", prepareTerraformInputs.run], {
      cwd: workspace,
      env: {
        PATH: dirname(execPath),
        TF_ROOT: root,
        TERRAFORM_TFVARS_JSON: JSON.stringify(variables),
      },
      encoding: "utf8",
    });
    expect(JSON.parse(readFileSync(join(workspace, root, "terraform.tfvars.json"), "utf8"))).toEqual(variables);
    expect(readFileSync(join(workspace, root, "backend.hcl"), "utf8")).toContain(`https://${variables.cloudflare_account_id}.r2.cloudflarestorage.com`);
    expect(log).toContain(`::add-mask::${variables.owner_email}`);
  });

  it.each([
    ["development", "life-console-development"],
    ["production", "life-console"],
  ])("uses the %s Terraform database output for migrations", (environment, worker) => {
    const workspace = createDeploymentWorkspace();
    writeFileSync(join(workspace, "terraform-outputs.json"), JSON.stringify({
      cloudflare_account_id: { value: "deployment-test-account" },
      cloudflare_d1_database_id: { value: `${environment}-terraform-database-id` },
    }));
    execFileSync("/bin/bash", ["-e", "-c", prepareMigrationConfiguration.run], {
      cwd: workspace,
      env: {
        PATH: dirname(execPath),
        DEPLOY_ENVIRONMENT: environment,
        RUNNER_TEMP: workspace,
        CLOUDFLARE_D1_DATABASE_ID: "stale-secret-must-not-be-used",
      },
    });
    const configuration = JSON.parse(readFileSync(join(workspace, `apps/api/wrangler.${environment}.jsonc`), "utf8"));
    expect(configuration).toMatchObject({
      name: worker,
      account_id: "deployment-test-account",
      d1_databases: [{
        binding: "DB",
        database_name: worker,
        database_id: `${environment}-terraform-database-id`,
        migrations_dir: "../../packages/db/migrations",
      }],
    });
    expect(configuration).not.toHaveProperty("workers_dev");
  });

  it("stops before Terraform initialization when the environment has no Terraform inputs", () => {
    const workspace = createDeploymentWorkspace();
    expect(() => execFileSync("/bin/bash", ["-e", "-c", prepareTerraformInputs.run], {
      cwd: workspace,
      env: { PATH: dirname(execPath), TF_ROOT: "infra/terraform/envs/development" },
      stdio: "pipe",
    })).toThrow(/TERRAFORM_TFVARS_JSON/);
  });
});
