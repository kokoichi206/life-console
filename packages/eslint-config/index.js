import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import importX from "eslint-plugin-import-x";
import jsonc from "eslint-plugin-jsonc";
import yml from "eslint-plugin-yml";
import * as jsoncParser from "jsonc-eslint-parser";
import tseslint from "typescript-eslint";
import * as yamlParser from "yaml-eslint-parser";

import customRules from "./rules/index.js";

export default [
  {
    ignores: ["**/dist/**", "**/storybook-static/**", "**/.wrangler/**", "**/node_modules/**", "**/fixtures/**", "private/**", "backups/**", "pnpm-lock.yaml"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    plugins: {
      "@stylistic": stylistic,
      "import-x": importX,
      "custom": customRules,
    },
    rules: {
      ...stylistic.configs.customize({
        arrowParens: true,
        braceStyle: "1tbs",
        indent: 2,
        jsx: true,
        quotes: "double",
        semi: true,
      }).rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "func-style": ["error", "expression"],
      "import-x/order": ["error", {
        "alphabetize": { caseInsensitive: true, order: "asc" },
        "groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
        "newlines-between": "always",
      }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-process-env": "error",
      "custom/no-direct-env-access": "error",
    },
  },
  {
    files: ["apps/api/src/{handlers,usecases,repositories}/**/*.ts", "apps/runner/src/{usecases,repositories}/**/*.ts"],
    plugins: { custom: customRules },
    rules: {
      "custom/no-relative-imports-across-layers": "error",
      "custom/no-throw-statement": "error",
    },
  },
  {
    files: ["apps/api/src/{handlers,usecases}/**/*.ts"],
    ignores: ["**/*.test.ts"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: { "custom/require-result-return-type": "error" },
  },
  {
    files: ["apps/{api,runner}/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: { "custom/no-discarded-result": "error" },
  },
  {
    files: ["apps/web/src/components/ui/*.tsx"],
    rules: { "custom/require-ui-storybook-story": "error" },
  },
  {
    files: ["apps/runner/src/config.ts", "**/*.config.{ts,mjs}", "packages/eslint-config/**/*.js"],
    rules: {
      "func-style": "off",
      "no-process-env": "off",
      "custom/no-direct-env-access": "off",
    },
  },
  {
    files: ["apps/web/src/env/client-env.ts"],
    rules: { "custom/no-direct-env-access": "off" },
  },
  {
    files: ["**/*.json"],
    languageOptions: { parser: jsoncParser },
    plugins: { jsonc },
    rules: {
      ...jsonc.configs["flat/recommended-with-json"].rules,
      "jsonc/indent": ["error", 2],
      "jsonc/sort-keys": "off",
    },
  },
  {
    files: ["**/*.{yaml,yml}"],
    languageOptions: { parser: yamlParser },
    plugins: { yml },
    rules: {
      "yml/block-mapping": "error",
      "yml/block-sequence": "error",
      "yml/flow-mapping-curly-newline": "error",
      "yml/flow-sequence-bracket-newline": "error",
      "yml/indent": ["error", 2],
    },
  },
];
