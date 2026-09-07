import type { Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { mswLoader } from "msw-storybook-addon/csf3";
import { Suspense, useMemo } from "react";

import "../src/styles.css";

const preview: Preview = {
  tags: ["autodocs"],
  loaders: [mswLoader(async () => {
    const worker = setupWorker(http.all("*/api/*", () => HttpResponse.json({ error: { message: "この操作の story 用応答は未定義です。" } }, { status: 501 })));
    await worker.start({ quiet: true, onUnhandledRequest: "error" });
    return worker;
  })],
  initialGlobals: { theme: "light" },
  globalTypes: {
    theme: { description: "表示テーマ", toolbar: { icon: "circlehollow", items: ["light", "dark"], dynamicTitle: true } },
  },
  parameters: {
    layout: "padded",
    a11y: { test: "error" },
  },
  decorators: [(Story, context) => {
    const client = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }), []);
    document.documentElement.classList.toggle("dark", context.globals.theme === "dark");
    return <QueryClientProvider client={client}><main className="min-h-screen bg-background p-4 text-foreground"><Suspense fallback={<p>読み込み中</p>}><Story /></Suspense></main></QueryClientProvider>;
  }],
};

export default preview;
