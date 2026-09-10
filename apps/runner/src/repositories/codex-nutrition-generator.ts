import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { err, ok, safeTry, type Result } from "@life-console/core";
import { z } from "zod";

import { runnerError, type RunnerError } from "../errors";

import type { CommandRepository } from "./command-repository";

type CodexNutritionInput = {
  readonly photo: { readonly contentType: "image/jpeg" | "image/png" | "image/webp"; readonly base64: string };
  readonly memo: string;
  readonly prompt: string;
  readonly schema: unknown;
  readonly model: string;
};

export const generateCodexNutrition = async (commands: CommandRepository, input: CodexNutritionInput, signal: AbortSignal): Promise<Result<{ decision: unknown; model: string }, RunnerError>> => {
  const directory = await safeTry(() => mkdtemp(join(tmpdir(), "life-console-nutrition-")));
  if (!directory.ok) return err(runnerError("nutrition_workspace_failed", "画像解析用の一時ディレクトリを作成できませんでした。", directory.error));
  const result = await safeTry(async () => {
    const imagePath = join(directory.value, `meal.${input.photo.contentType.split("/")[1]}`);
    const schemaPath = join(directory.value, "nutrition.schema.json");
    const promptPath = join(directory.value, "instructions.md");
    const outputPath = join(directory.value, "estimate.json");
    await writeFile(imagePath, Buffer.from(input.photo.base64, "base64"), { mode: 0o600 });
    await writeFile(schemaPath, JSON.stringify(input.schema), { mode: 0o600 });
    await writeFile(promptPath, input.prompt, { mode: 0o600 });
    // 開発用の設定や指示を混ぜず、既存ログインで写真とメモだけを推定する。
    const generated = await commands.execute("codex", ["exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only",
      "-c", "approval_policy=\"never\"", "-c", "model_reasoning_effort=\"low\"", "-c", `model_instructions_file=${JSON.stringify(promptPath)}`,
      "-c", "project_doc_max_bytes=0", "-c", "skills.include_instructions=false", "-c", "memories.use_memories=false", "-c", "web_search=\"disabled\"",
      "--disable", "shell_tool", "--disable", "shell_snapshot", "--disable", "multi_agent", "--disable", "plugins", "--disable", "apps", "--disable", "hooks",
      "--model", input.model, "--image", imagePath, "--output-schema", schemaPath, "--output-last-message", outputPath, "--json", "-"], {
      cwd: directory.value, signal, stdin: JSON.stringify({ memo: input.memo }),
    });
    if (!generated.ok) return generated;
    const events = z.array(z.object({ type: z.string() })).safeParse(generated.value.stdout.trim().split(/\r?\n/u).map((line) => JSON.parse(line) as unknown));
    if (!events.success || !events.data.some((event) => event.type === "turn.completed")) return err(runnerError("nutrition_generation_failed", "Codex の栄養推定の完了結果を取得できませんでした。"));
    return ok({ decision: JSON.parse(await readFile(outputPath, "utf8")) as unknown, model: input.model });
  });
  const cleaned = await safeTry(() => rm(directory.value, { recursive: true, force: true }));
  if (!cleaned.ok) return err(runnerError("nutrition_cleanup_failed", "画像解析の一時ファイルを削除できませんでした。", cleaned.error));
  return result.ok ? result.value : err(runnerError("invalid_nutrition_output", "Codex の栄養推定の準備・結果読み取りに失敗しました。", result.error));
};
