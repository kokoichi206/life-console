# API の DB 結合テスト

API の保存・取得・排他制御を、全 migration を適用したメモリ内 SQLite で検証します。HTTP handler を含むケースも同一プロセスで実行します。

```sh
pnpm exec vitest run apps/api/tests/integration
```

`pnpm test`、`pnpm check`、CI の対象です。

- `job-storage.test.ts`: ジョブの重複防止、定期設定、実行権限、中止と実行結果不明時の扱い
- `reply-draft-storage.test.ts`: 会話の再同期、手動編集の保持、下書き保存の競合
- `monitoring-storage.test.ts`: 監視履歴、障害の判定、通知予約と排他制御
- `push-storage.test.ts`: 通知先の登録・更新・解除と HTTP の入力・応答
- `weight-storage.test.ts`: 計測順、件数、削除済みデータの除外
- `weight-goal-storage.test.ts`: 目標の登録・更新・解除と読み取り

`support/d1-storage.ts` が SQLite を D1 の呼び出し形式へ変換します。SQL は実行しますが、Cloudflare の runtime、実 HTTP 通信、別プロセスの runner は対象外です。それらをつないだ検証は [E2E](../../../../e2e/README.md) に置きます。

個々の保存条件はここで検証し、機能全体の利用経路を確認するために API と runner の内部実装をこのディレクトリから直接つながないでください。
