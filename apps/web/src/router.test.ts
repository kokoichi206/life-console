import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { router } from "./router";

const createTestRouter = (entry: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return createRouter({ ...router.options, history: createMemoryHistory({ initialEntries: [entry] }), context: { queryClient } });
};

afterEach(() => vi.unstubAllGlobals());

describe("アプリのルーティング", () => {
  it("URL の不正なフィルターと未定義項目を、遷移後の画面へ引き継がない", async () => {
    const testRouter = createTestRouter("/tasks?view=tasks&service=%5B%22gmail%22%5D&period=invalid&unexpected=keep");
    await testRouter.load();
    await testRouter.navigate({ to: "/tasks", search: true, replace: true });
    expect(testRouter.state.location.search).toEqual({ view: "tasks" });
    expect(testRouter.state.matches.at(-1)?.search).toEqual({ view: "tasks" });
  });

  it("入力を閉じても表示期間を保持し、URL から開き直せる", async () => {
    const fetchResponse = vi.fn((url: string) => Promise.resolve(Response.json({ data: url.endsWith("weight-goal") ? null : [] })));
    vi.stubGlobal("fetch", fetchResponse);
    const testRouter = createTestRouter("/health?entry=weight&range=d90");
    await testRouter.load();
    await testRouter.navigate({ from: "/health", to: "/health", search: (previous) => ({ ...previous, entry: undefined }), replace: true });
    expect(testRouter.state.location.search).toEqual({ range: "d90" });
    const reopened = createTestRouter(testRouter.state.location.href);
    await reopened.load();
    expect(reopened.state.matches.at(-1)?.search).toEqual({ range: "d90" });
  });

  it("Query のキャッシュを消した後は、直前に事前読み込みしたページも再取得する", async () => {
    const fetchResponse = vi.fn((url: string) => Promise.resolve(Response.json({ data: url.endsWith("weight-goal") ? null : [] })));
    vi.stubGlobal("fetch", fetchResponse);
    const testRouter = createTestRouter("/tasks");
    await testRouter.load();
    await testRouter.preloadRoute({ to: "/health" });
    expect(fetchResponse).toHaveBeenCalledTimes(3);
    testRouter.options.context.queryClient.clear();
    await testRouter.preloadRoute({ to: "/health" });
    expect(fetchResponse).toHaveBeenCalledTimes(6);
  });
});
