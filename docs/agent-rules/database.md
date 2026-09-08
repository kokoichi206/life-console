---
paths:
  - "packages/db/**"
  - "apps/api/src/repositories/**"
  - "tests/*storage.test.ts"
---

# D1 と migration

- schema の正本は `packages/db/src/schema.ts`。変更後は `pnpm --filter @life-console/db generate` で SQL と `migrations/meta/` を生成し、差分を読む。適用済みの migration の内容や ID を書き換えず、新しい migration を追加する。
- `pnpm migrations:check` で schema と最新 snapshot の一致、journal 内の SQL ファイルの存在を確認する。`pnpm check` と PR の CI にも含まれる。生成した SQL と `migrations/meta/` は一緒に追加する。
- 実行時のクエリは `apps/api/src/repositories` に置く。新規・変更対象の通常の CRUD と JOIN は Drizzle の明示的なクエリビルダーを使い、schema から列と型を参照する。既存 SQL は一括変換せず、SQL の方が条件を追いやすい箇所は残す。Supabase 用の手順や `db push` に置き換えない。
- JSON 関数などは `sql` 式を併用する。`sql<T>` や型アサーションだけで SQL と結果型の整合性を確認した扱いにしない。移行時は生成 SQL と実行結果を確認し、複雑なクエリでは実行計画とクエリ回数も比較する。
- SQL は repository メソッドから追える構成にする。調査時はクエリビルダーの `.toSQL().sql` をメソッド名と照合し、バインド値をログへ出さない。通常の実行ログに SQL 全文や新しいログ項目を加えない。
- NOT NULL、列削除、型変更などは既存行と既存の読み書きへの影響を確認する。schema の一致だけでデータ移行が成功したとしない。
- job の claim・lease・heartbeat・完了報告と、下書き保存の lease・更新日時による競合検出は、既存 repository の条件を保つ。再実行で重複や古い実行結果の保存を生まないか確認する。
- [storage テスト](../../packages/db/README.md) は全 migration をメモリ内 SQLite に適用する。変更箇所の storage テストに加え、D1 固有の挙動を変えた場合はローカル D1 でも対象操作を確認する。
- ローカルへの適用は `pnpm --filter @life-console/db migrate:local`。seed は架空のローカル用データに限定し、実データ用 DB へ適用しない。本番への適用は [配置と認証](../operations.md#配置と認証) と依頼の許可範囲を確認する。
