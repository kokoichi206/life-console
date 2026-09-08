import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.{test,spec}.{ts,tsx,js}", "packages/eslint-config/rules/**/test.js"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/fixtures/**", "**/storybook-static/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
      "@runner": fileURLToPath(new URL("./apps/runner/src", import.meta.url)),
    },
  },
});
