# @life-console/db

Drizzle schema、D1 migration、ローカル確認用の架空 seed を管理します。実行時の業務クエリと Result への変換は `apps/api/src/repositories` に置きます。API からこのパッケージの schema を参照し、読み書き・集計・条件付き保存に Drizzle のクエリビルダーを使います。JSON や日付の関数などは `sql` 式を併用します。列の文字列候補は Drizzle の `enum` オプションで定義し、API の入出力 DTO には依存しません。この SQLite の enum 指定は型推論用で、DB の CHECK 制約を追加するものではありません。

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

## 実行時のクエリと確認

API の全 repository は Drizzle の D1 driver を使います。食事・体重・家計・会話・タスク・リポジトリ・runner・ジョブ・監視・通知先・Strava 接続が対象です。列の選択結果から型を推論し、JSON・日付・集計関数、CASE、ウィンドウ関数、再帰 CTE の自己参照は `sql` 式で記述します。

lease や対象・重複の判定を含む保存は `insert().select()`、claim や更新は `update().where()` で同じ SQL 文に保ちます。食事保存と初回ジョブ予約、定期ジョブの展開と次回時刻更新などは Drizzle の `batch()` を通して D1 batch で原子的に実行します。保存条件を raw SQL のまま残す必要はありません。

runner の監視キューはローカルの `node:sqlite` を使う別 DB です。Drizzle に専用 driver がないため `sqlite-proxy` に実行を渡し、テーブル定義は `apps/runner/src/repositories/monitor-queue-repository.ts` に置きます。初期化の DDL はそのファイル、D1 の DDL はこのパッケージの migration で管理します。

SQL の調査時は、repository メソッドのクエリを実行する直前で、デバッガーから `.toSQL().sql` を確認できます。Query Insights のクエリをメソッドと照合するために使います。`.toSQL().params` や `logger: true` によるバインド値の記録は行いません。SQL 式への `sql<T>` は型の指定であり、実際の結果型を検証しません。

storage テストの D1 binding は SQLite を使った代替実装です。Drizzle の D1 driver が列順で結果を復元する `raw()` も SQLite の配列形式で実行します。driver の変更はこのテストだけで完了扱いにせず、ローカル D1 で保存・再取得と失敗時の結果を確認してください。
