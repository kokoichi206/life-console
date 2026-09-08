# @life-console/db

Drizzle schema、D1 migration、ローカル確認用の架空 seed を管理します。実行時の業務クエリと Result への変換は `apps/api/src/repositories` に置きます。

- `src/schema.ts`: テーブル定義
- `migrations/`: SQL と Drizzle の生成履歴
- `scripts/check-migrations.mjs`: schema と最新 snapshot の一致、journal に記録された SQL ファイルの存在確認
- `seed.sql`: 個人データを含まないローカル確認用データ

ルートから実行します。

```sh
pnpm --filter @life-console/db generate
pnpm migrations:check
pnpm --filter @life-console/db migrate:local
pnpm --filter @life-console/db seed:local
pnpm exec vitest run tests/job-storage.test.ts tests/reply-draft-storage.test.ts
```

storage テストは全 migration を独立したメモリ内 SQLite に適用します。実際の D1、体重、会話、下書きは変更しません。本番 DB に seed を適用しないでください。

`pnpm typecheck` はルートの storage テストと、このパッケージの migration 検査テストも対象にします。テストの実行と型検査の両方で、実装の変更への追従を確認します。

`pnpm migrations:check` は `pnpm check` に含まれ、`develop` / `main` 向け PR の CI でも実行します。schema だけ変更して migration を生成し忘れた場合や、生成した SQL ファイルを追加し忘れた場合は失敗します。schema が一致しなければ `pnpm --filter @life-console/db generate` を実行し、SQL と `migrations/meta/` を変更に含めてください。SQL ファイルの欠落なら、エラーに表示された生成済みのファイルを追加・復元してください。

チェックは Drizzle Kit の API で現在の schema の snapshot をメモリ上に生成して比較するため、ファイルの書き込み、DB 接続、名前変更の対話入力はありません。UUID と rename の履歴は比較から除きます。SQL の実行結果や本番 DB との差は検査対象外で、SQL の適用は storage テストで確認します。

旧 `packages/database` からの移動で SQL の内容や migration ID は変えていません。配置先の非公開 Wrangler 設定でも `migrations_dir` を `../../packages/db/migrations` に変更してください。
