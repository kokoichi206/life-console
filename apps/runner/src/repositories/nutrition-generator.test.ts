import { err, ok } from "@life-console/core";
import { describe, expect, it, vi } from "vitest";

import type { CommandRepository } from "./command-repository";
import { createNutritionGenerator } from "./nutrition-generator";

const meal = { id: "meal", photoId: "photo", memo: "ごはんは半分" };
const estimate = { caloriesKcal: 600, proteinGrams: 25, fatGrams: 15, carbohydrateGrams: 90 };
const reply = (value: unknown) => ok({ stdout: JSON.stringify({ type: "result", is_error: false, modelUsage: { "actual-model": {} }, structured_output: { estimate: value } }), stderr: "" });
const signal = new AbortController().signal;

describe("写真からの栄養推定", () => {
  it("写真を画像ブロック、メモをデータとして渡し、実モデルと入力 hash を記録する", async () => {
    const execute = vi.fn<CommandRepository["execute"]>().mockResolvedValue(reply(estimate));
    const readMealPhoto = vi.fn().mockResolvedValue(ok({ contentType: "image/jpeg", base64: "aW1hZ2U=" }));
    const generator = createNutritionGenerator({ execute }, { readMealPhoto }, { provider: "claude" });
    const result = await generator.generate(meal, signal);
    expect(result).toMatchObject({ ok: true, value: { ...estimate, model: "actual-model", inputHash: expect.stringMatching(/^[a-f0-9]{64}$/u) } });
    const args = execute.mock.calls[0]![1];
    expect(args).toContain("--safe-mode");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--no-session-persistence");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(JSON.parse(execute.mock.calls[0]![2]!.stdin!) as unknown).toMatchObject({ message: { content: [
      { type: "image", source: { media_type: "image/jpeg", data: "aW1hZ2U=" } }, { type: "text", text: JSON.stringify({ memo: meal.memo }) },
    ] } });
    const changedMemo = await generator.generate({ ...meal, memo: "全部食べた" }, signal);
    expect(result.ok && changedMemo.ok && result.value.inputHash !== changedMemo.value.inputHash).toBe(true);
    readMealPhoto.mockResolvedValue(ok({ contentType: "image/jpeg", base64: "b3RoZXI=" }));
    const changedPhoto = await generator.generate(meal, signal);
    expect(result.ok && changedPhoto.ok && result.value.inputHash !== changedPhoto.value.inputHash).toBe(true);
  });
  it.each([null, { ...estimate, caloriesKcal: -1 }, { ...estimate, proteinGrams: "25" }])("判断不能・不正な出力をゼロとして保存しない", async (value) => {
    const generator = createNutritionGenerator({ execute: vi.fn().mockResolvedValue(reply(value)) }, {
      readMealPhoto: vi.fn().mockResolvedValue(ok({ contentType: "image/png", base64: "test" })),
    }, { provider: "claude" });
    expect((await generator.generate(meal, signal)).ok).toBe(false);
  });
  it("写真の取得失敗時には LLM を呼ばない", async () => {
    const execute = vi.fn();
    const failure = err({ code: "missing_photo", summary: "写真がありません。" });
    expect(await createNutritionGenerator({ execute }, { readMealPhoto: vi.fn().mockResolvedValue(failure) }).generate(meal, signal)).toEqual(failure);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("Gemini による画像解析", () => {
  const photo = { contentType: "image/jpeg" as const, base64: "aW1hZ2U=" };
  const geminiReply = (response: unknown) => ok({ stdout: JSON.stringify({ response: JSON.stringify(response), stats: { models: { "gemini-test": {} } } }), stderr: "" });
  it("画像とメモを一時ファイルへ分離し、認証だけ共有してモデルを切り替え、終了後に削除する", async () => {
    const { readFile, readlink, stat } = await import("node:fs/promises");
    const { join } = await import("node:path");
    let directory = "";
    const memo = "半分食べた @/private/other.txt";
    const execute = vi.fn<CommandRepository["execute"]>().mockImplementation(async (command, args, options) => {
      directory = options!.cwd!;
      expect(command).toBe("env");
      expect(args).toContain("gemini");
      expect(args[args.indexOf("--model") + 1]).toBe("gemini-test");
      expect(args.join(" ")).not.toContain(memo);
      expect(await readFile(join(directory, "meal.jpeg"), "utf8")).toBe("image");
      expect(JSON.parse(await readFile(join(directory, "meal.json"), "utf8")) as unknown).toMatchObject({ memo });
      expect(JSON.parse(await readFile(join(directory, "home/.gemini/settings.json"), "utf8")) as unknown).toMatchObject({
        security: { auth: { selectedType: "oauth-personal" } }, tools: { core: [] }, context: { fileName: [] }, hooksConfig: { enabled: false },
        admin: { mcp: { enabled: false }, extensions: { enabled: false }, skills: { enabled: false } },
      });
      expect(await readlink(join(directory, "home/.gemini/oauth_creds.json"))).toBe("/test-auth/.gemini/oauth_creds.json");
      return geminiReply({ estimate });
    });
    const generator = createNutritionGenerator({ execute }, { readMealPhoto: vi.fn().mockResolvedValue(ok(photo)) }, { provider: "gemini", model: "gemini-test", geminiCliHome: "/test-auth" });
    expect(await generator.generate({ ...meal, memo }, signal)).toMatchObject({ ok: true, value: { ...estimate, model: "gemini-test" } });
    await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("API キー認証では OAuth ファイルを共有せず、CLI が失敗しても一時ファイルを削除する", async () => {
    const { readFile, stat } = await import("node:fs/promises");
    const { join } = await import("node:path");
    let directory = "";
    const failure = err({ code: "command_failed", summary: "Gemini の認証に失敗しました。" });
    const execute = vi.fn<CommandRepository["execute"]>().mockImplementation(async (_command, _args, options) => {
      directory = options!.cwd!;
      expect(JSON.parse(await readFile(join(directory, "home/.gemini/settings.json"), "utf8")) as unknown).toMatchObject({ security: { auth: { selectedType: "gemini-api-key" } } });
      await expect(stat(join(directory, "home/.gemini/oauth_creds.json"))).rejects.toMatchObject({ code: "ENOENT" });
      return failure;
    });
    expect(await createNutritionGenerator({ execute }, { readMealPhoto: vi.fn().mockResolvedValue(ok(photo)) }, { provider: "gemini", geminiAuth: "gemini-api-key" }).generate(meal, signal)).toEqual(failure);
    await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(execute).toHaveBeenCalledOnce();
  });
  it.each([{ estimate: null }, { estimate: { ...estimate, caloriesKcal: -1 } }, "not JSON"])("判断不能や不正な結果を成功にしない", async (response) => {
    const execute = vi.fn().mockResolvedValue(geminiReply(response));
    expect((await createNutritionGenerator({ execute }, { readMealPhoto: vi.fn().mockResolvedValue(ok(photo)) }, { provider: "gemini" }).generate(meal, signal)).ok).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
  });
});

describe("メモだけの栄養推定", () => {
  it.each(["codex", "claude", "gemini"] as const)("%s に写真なしでメモを渡す", async (provider) => {
    const { readFile, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const readMealPhoto = vi.fn();
    const execute = vi.fn<CommandRepository["execute"]>().mockImplementation(async (_command, args, options) => {
      if (provider === "codex") {
        expect(args).not.toContain("--image");
        expect(JSON.parse(options!.stdin!) as unknown).toEqual({ memo: meal.memo });
        await writeFile(args[args.indexOf("--output-last-message") + 1]!, JSON.stringify({ estimate }));
        return ok({ stdout: JSON.stringify({ type: "turn.completed" }), stderr: "" });
      }
      if (provider === "gemini") {
        expect(args[args.indexOf("--prompt") + 1]).toBe("@meal.json この食事の栄養を推定してください。");
        expect(JSON.parse(await readFile(join(options!.cwd!, "meal.json"), "utf8")) as unknown).toEqual({ memo: meal.memo });
        return ok({ stdout: JSON.stringify({ response: JSON.stringify({ estimate }), stats: { models: { test: {} } } }), stderr: "" });
      }
      expect(JSON.parse(options!.stdin!) as unknown).toMatchObject({ message: { content: [{ type: "text", text: JSON.stringify({ memo: meal.memo }) }] } });
      return reply(estimate);
    });
    expect(await createNutritionGenerator({ execute }, { readMealPhoto }, { provider, geminiAuth: "gemini-api-key" }).generate({ ...meal, photoId: null }, signal)).toMatchObject({ ok: true, value: estimate });
    expect(readMealPhoto).not.toHaveBeenCalled();
  });
});
