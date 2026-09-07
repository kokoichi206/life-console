import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-vitest", "msw-storybook-addon"],
  framework: "@storybook/react-vite",
  staticDirs: ["./public"],
  core: { disableTelemetry: true },
  viteFinal: (viteConfig) => {
    viteConfig.server = { ...viteConfig.server, proxy: {} };
    return viteConfig;
  },
};

export default config;
