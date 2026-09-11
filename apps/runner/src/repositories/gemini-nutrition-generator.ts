import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { err, safeTry, type Result } from "@life-console/core";

import { runnerError, type RunnerError } from "../errors";

import type { CommandOutput, CommandRepository } from "./command-repository";

type GeminiNutritionInput = {
  readonly photo: { readonly contentType: "image/jpeg" | "image/png" | "image/webp"; readonly base64: string } | null;
  readonly memo: string;
  readonly prompt: string;
  readonly schema: unknown;
  readonly model: string | undefined;
  readonly authType: "oauth-personal" | "gemini-api-key";
  readonly cliHome: string | undefined;
};

export const generateGeminiNutrition = async (commands: CommandRepository, input: GeminiNutritionInput, signal: AbortSignal): Promise<Result<CommandOutput, RunnerError>> => {
  const directory = await safeTry(() => mkdtemp(join(tmpdir(), "life-console-nutrition-")));
  if (!directory.ok) return err(runnerError("nutrition_workspace_failed", "画像解析用の一時ディレクトリを作成できませんでした。", directory.error));
  const result = await safeTry(async () => {
    const home = join(directory.value, "home");
    const settingsDirectory = join(home, ".gemini");
    await mkdir(settingsDirectory, { recursive: true, mode: 0o700 });
    // 認証だけを共有し、普段のツール・指示・会話履歴を画像解析へ持ち込まない。
    if (input.authType === "oauth-personal") for (const name of ["oauth_creds.json", "google_accounts.json"]) await symlink(join(input.cliHome ?? homedir(), ".gemini", name), join(settingsDirectory, name));
    await writeFile(join(settingsDirectory, "settings.json"), JSON.stringify({
      security: { auth: { selectedType: input.authType } }, context: { fileName: [] }, tools: { core: [] }, hooksConfig: { enabled: false },
      admin: { mcp: { enabled: false }, extensions: { enabled: false }, skills: { enabled: false } },
    }), { mode: 0o600 });
    const systemPrompt = join(directory.value, "system.md");
    await writeFile(systemPrompt, `${input.prompt}\n次の JSON Schema に従う JSON オブジェクトだけを出力してください。Markdown の囲みや説明文は不要です。\n${JSON.stringify(input.schema)}`, { mode: 0o600 });
    const imageName = input.photo === null ? null : `meal.${input.photo.contentType.split("/")[1]}`;
    if (input.photo !== null && imageName !== null) await writeFile(join(directory.value, imageName), Buffer.from(input.photo.base64, "base64"), { mode: 0o600 });
    // メモをプロンプトの @file 展開へ直接通すと、メモ内のパスまで読み込まれる。
    await writeFile(join(directory.value, "meal.json"), JSON.stringify({ memo: input.memo }), { mode: 0o600 });
    return commands.execute("env", [`GEMINI_CLI_HOME=${home}`, `GEMINI_SYSTEM_MD=${systemPrompt}`, "gemini", "--output-format", "json",
      ...(input.model === undefined ? [] : ["--model", input.model]), "--prompt", `${imageName === null ? "" : `@${imageName} `}@meal.json この食事の栄養を推定してください。`], { cwd: directory.value, signal });
  });
  const cleaned = await safeTry(() => rm(directory.value, { recursive: true, force: true }));
  if (!cleaned.ok) return err(runnerError("nutrition_cleanup_failed", "画像解析の一時ファイルを削除できませんでした。", cleaned.error));
  return result.ok ? result.value : err(runnerError("nutrition_workspace_failed", "Gemini の画像解析を準備できませんでした。", result.error));
};
