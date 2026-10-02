import type { ImportWorkConfirmation, ImportWorkConfirmationsInput } from "../../packages/contracts/src/work-confirmations";

export const workConfirmationInput = (change: Partial<ImportWorkConfirmation> = {}): ImportWorkConfirmationsInput => ({
  sourceId: "test-patrol", sourceLabel: "テスト用の dev 巡回",
  confirmations: [{
    externalId: "review-event-1", repositoryName: "example/project", sourceUrl: "https://github.com/example/project/pull/123",
    kind: "review", title: "修正 PR の差分をレビューする", summary: "本人へのレビュー依頼が届いています。",
    environment: "dev", question: "この変更の差分をレビューしてください。", reason: "本人のレビューが必要です。",
    recommendation: "変更箇所と回帰テストを確認してください。",
    evidence: [{ state: "confirmed", title: "対象テストの結果", detail: "架空の確認結果です。", url: null }],
    requestedAt: "2026-10-02T00:00:00Z", checkedAt: "2026-10-02T00:10:00Z", status: "pending", ...change,
  }],
});
