---
paths:
  - "apps/api/src/**"
  - "apps/runner/src/**"
  - "packages/core/**"
  - "packages/contracts/**"
  - "packages/domain/**"
  - "packages/env/**"
---

# サーバーと共有パッケージの境界

- API の依存は `handler -> usecase -> repository`。HTTP の入力検証・ステータス変換は `apps/api/src/app.ts`、業務判断は usecase、D1 の読み書きは repository に置く。新たな認証ラッパーや別の DB 接続経路を持ち込まない。
- API の公開業務処理は `@life-console/core` の `Result<T, E>` を返す。成功は `value`、失敗は `error`。API のエラーは `apps/api/src/shared/app-error.ts`、runner は `apps/runner/src/errors.ts` の実際の型に合わせる。
- 外部 I/O の例外を repository などの境界で Result に変換し、上位へ返す。handler / usecase / repository の throw と Result の捨て忘れを ESLint が検査する。Web の Query / Mutation への例外伝達に同じ禁止を広げない。
- 状態・種別の候補値と共通型は `packages/domain` を正本にし、Zod と DB schema から参照する。domain は DTO・Zod・Drizzle に依存させない。
- API の入出力を変える場合は `packages/contracts` の Zod schema と呼び出し元を照合する。外部入力の検証を通った内部値へ同じ検証を重ねない。
- `APP_ENV` は明示する。API、runner、Web それぞれの検証境界と `packages/env` に環境変数を定義し、利用箇所で `process.env` や `import.meta.env` を読み直さない。
- ログは共通 logger の許可された項目で記録する。エラー調査のためでも会話本文・token・transcript をログへ追加しない。

機械的な制約と適用範囲は [ESLint](../../packages/eslint-config/README.md)、Result と logger は [core](../../packages/core/README.md) を参照する。
