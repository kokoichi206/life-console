import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  clean: true,
  // 共通パッケージは TS ソースを公開するため、Node.js 向けの配信物に含める。
  noExternal: ["@life-console/contracts", "@life-console/core", "@life-console/env"],
});
