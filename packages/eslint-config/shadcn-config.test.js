import { fileURLToPath, URL } from "node:url";

import { ESLint, Linter } from "eslint";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const eslint = new ESLint({ cwd: repositoryRoot });
const lintShadcn = async (code, filePath = "apps/web/src/components/DesignSystem.tsx") => {
  const config = await eslint.calculateConfigForFile(filePath);
  // shadcn は構文だけを検査するため、型情報の構築は通常の lint に任せる。
  const messages = new Linter({ cwd: repositoryRoot }).verify(code, {
    files: ["**/*.tsx"],
    languageOptions: { ...config.languageOptions, parserOptions: { projectService: false, ecmaFeatures: { jsx: true } } },
    plugins: { shadcn: config.plugins.shadcn },
    rules: Object.fromEntries(Object.entries(config.rules).filter(([name]) => name.startsWith("shadcn/"))),
  }, { filename: fileURLToPath(new URL(`../../${filePath}`, import.meta.url)) });
  expect(messages.filter((message) => message.fatal)).toEqual([]);
  return messages;
};

describe("Web のデザインルール", () => {
  it("テーマ色・SVG の無色指定・動的な CSS 変数を許可する", async () => {
    expect(await lintShadcn(`
      import type { CSSProperties } from "react";
      export const Chart = ({ width }: { width: number }) => (
        <svg className="text-primary"><path className="fill-none stroke-current w-(--bar-width)" style={{ "--bar-width": width + "%" } as CSSProperties} /></svg>
      );
    `)).toEqual([]);
  });

  it.each([
    ["raw palette", "<div className=\"bg-red-500\" />", "shadcn/no-raw-colors"],
    ["raw SVG", "<svg><path fill=\"#ff0000\" /></svg>", "shadcn/no-raw-colors"],
    ["unknown class", "<div className=\"rounded-huge\" />", "shadcn/no-unknown-classes"],
    ["inline style", "<div style={{ padding: 12 }} />", "shadcn/no-inline-styles"],
    ["dynamic class", "<Card className={`bg-${color}`} />", "shadcn/require-static-classes"],
  ])("%s を検出する", async (_name, jsx, ruleId) => {
    const messages = await lintShadcn(`import { Card } from "./ui/card"; export const Example = ({ color }: { color: string }) => (${jsx});`);
    expect(messages.map((message) => message.ruleId)).toContain(ruleId);
  });

  it("alias import と stories にも適用する", async () => {
    const messages = await lintShadcn("import { Card } from \"@/components/ui/card\"; export const Example = ({ color }: { color: string }) => <Card className={`bg-${color}`} />;", "apps/web/src/components/ui/card.stories.tsx");
    expect(messages.map((message) => message.ruleId)).toContain("shadcn/require-static-classes");
  });

  it("共通部品内の className 合成は許可し、色と inline style は検査する", async () => {
    const messages = await lintShadcn("import { Card } from \"./card\"; export const Example = ({ color }: { color: string }) => <Card className={`bg-${color}`} style={{ color: \"red\" }} />;", "apps/web/src/components/ui/badge.tsx");
    expect(messages.map((message) => message.ruleId)).toEqual(["shadcn/no-inline-styles"]);
    expect((await lintShadcn("export const Example = () => <div className=\"bg-red-500\" />;", "apps/web/src/components/ui/badge.tsx")).map((message) => message.ruleId)).toContain("shadcn/no-raw-colors");
  });

  it("API と runner には適用しない", async () => {
    for (const filePath of ["apps/api/src/index.ts", "apps/runner/src/index.ts"]) {
      const config = await eslint.calculateConfigForFile(filePath);
      expect(Object.keys(config.rules).filter((name) => name.startsWith("shadcn/"))).toEqual([]);
    }
  });
});
