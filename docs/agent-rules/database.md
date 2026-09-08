---
paths:
  - "packages/db/**"
  - "apps/api/src/repositories/**"
  - "tests/*storage.test.ts"
  - "apps/runner/src/repositories/monitor-queue-repository*"
---

# D1 と migration

- schema の正本は `packages/db/src/schema.ts`。変更後は `pnpm --filter @life-console/db generate` で SQL と `migrations/meta/` を生成し、差分を読む。適用済みの migration の内容や ID を書き換えず、新しい migration を追加する。
- `pnpm migrations:check` で schema と最新 snapshot の一致、journal 内の SQL ファイルの存在を確認する。`pnpm check` と PR の CI にも含まれる。生成した SQL と `migrations/meta/` は一緒に追加する。
- API の実行時クエリは `apps/api/src/repositories` に置く。CRUD、JOIN、条件付き保存、集計、定期ジョブの展開は Drizzle の明示的なクエリビルダーを使い、schema から列と型を参照する。runner の監視キューも Drizzle を使い、ローカル専用 schema はその repository に置く。Supabase 用の手順や `db push` に置き換えない。
- JSON・日付・集計関数、CASE、ウィンドウ関数、再帰 CTE の自己参照などは `sql` 式を併用する。条件が複雑、または原子性が必要という理由だけで文全体を raw SQL にしない。条件付き保存は Drizzle の `insert().select()` や `update().where()` で同じ文に保ち、事前 SELECT と書き込みに分離しない。`sql<T>` や型アサーションだけで SQL と結果型の整合性を確認した扱いにしない。移行時は生成 SQL と実行結果を確認し、複雑なクエリでは実行計画とクエリ回数も比較する。
- CTE の SQL 別名を相関サブクエリで使うときは、生成 SQL のテーブル修飾を確認する。内側に同名列があると別の列に解決されるため、対象の異なる行を混ぜた storage テストでも相関条件を確認する。
- SQL は repository メソッドから追える構成にする。調査時はクエリビルダーの `.toSQL().sql` をメソッド名と照合し、バインド値をログへ出さない。通常の実行ログに SQL 全文や新しいログ項目を加えない。
- NOT NULL、列削除、型変更などは既存行と既存の読み書きへの影響を確認する。schema の一致だけでデータ移行が成功したとしない。
- job の claim・lease・heartbeat・完了報告と、下書き保存の lease・更新日時による競合検出は、既存 repository の条件を保つ。再実行で重複や古い実行結果の保存を生まないか確認する。
- [storage テスト](../../packages/db/README.md) は全 migration をメモリ内 SQLite に適用する。変更箇所の storage テストに加え、D1 固有の挙動を変えた場合はローカル D1 でも対象操作を確認する。
- ローカルへの適用は `pnpm --filter @life-console/db migrate:local`。seed は架空のローカル用データに限定し、実データ用 DB へ適用しない。本番への適用は [配置と認証](../operations.md#配置と認証) と依頼の許可範囲を確認する。
