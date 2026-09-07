import type { Job } from "@life-console/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { conversationsQuery } from "../../query";

import { JobProgress } from "./JobProgress";
import { WorkInbox } from "./WorkInbox";

vi.mock("@tanstack/react-router", () => ({ useSearch: () => ({ status: "all" }), useNavigate: () => vi.fn(), Link: () => null }));
vi.mock("./ConversationDetail", () => ({ ConversationDetail: () => null }));

const render = (client: QueryClient, child: ReactNode) => renderToStaticMarkup(createElement(QueryClientProvider, { client, children: child }));

describe("仕事画面の取得失敗と終了状態", () => {
  it("下書き API が失敗しても取得済みの会話を消さず、失敗を表示する", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
    client.setQueryData(conversationsQuery({ period: "7d" }).queryKey, [{ id: "c1", connector: "slack", sourceId: "default/C1", externalMessageId: "1",
      authorLabel: "確認用の依頼者", excerpt: "確認用の依頼本文", occurredAt: "2026-09-07T00:00:00Z", sourceUrl: null, classification: "unprocessed" }]);
    client.setQueryData(["reply-drafts"], []);
    client.getQueryCache().find({ queryKey: ["reply-drafts"] })!.setState({ data: undefined, status: "error", error: new Error("下書き API の取得エラー") });
    client.setQueryData(["jobs"], []);
    client.setQueryData(["tasks"], []);
    const html = render(client, createElement(WorkInbox));
    expect(html).toContain("確認用の依頼本文");
    expect(html).toContain("下書き API の取得エラー");
    expect(html).not.toContain("この条件の連絡はありません");
    client.clear();
  });

  it("lost は結果不明と表示し、中止ボタンを出さない", () => {
    const client = new QueryClient();
    const job: Job = { id: "j1", taskId: null, repositoryId: null, kind: "conversation_reply", status: "lost", payloadJson: "{}",
      leaseToken: null, cancelRequestedAt: null, provider: null, summary: null, errorCode: "lease_expired",
      createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z" };
    const html = render(client, createElement(JobProgress, { job }));
    expect(html).toContain("結果不明");
    expect(html).not.toContain("中止</button>");
    client.clear();
  });
});
