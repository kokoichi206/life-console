# @life-console/db

Drizzle schema、D1 migration、ローカル確認用の架空 seed を管理します。実行時の業務クエリと Result への変換は `apps/api/src/repositories` に置きます。

- `src/schema.ts`: テーブル定義
- `migrations/`: SQL と Drizzle の生成履歴
- `seed.sql`: 個人データを含まないローカル確認用データ

ルートから実行します。

```sh
pnpm --filter @life-console/db generate
pnpm --filter @life-console/db migrate:local
pnpm --filter @life-console/db seed:local
pnpm exec vitest run tests/job-storage.test.ts tests/reply-draft-storage.test.ts
```

storage テストは全 migration を独立したメモリ内 SQLite に適用します。実際の D1、体重、会話、下書きは変更しません。本番 DB に seed を適用しないでください。

旧 `packages/database` からの移動で SQL の内容や migration ID は変えていません。配置先の非公開 Wrangler 設定でも `migrations_dir` を `../../packages/db/migrations` に変更してください。
