# @life-console/eslint-config

共通 Flat Config と、このアプリの構成を守るカスタムルールです。ルートの `eslint.config.mjs` はこのパッケージだけを参照します。

```text
packages/eslint-config/
  index.js
  lib/                          型判定の共有処理
  rules/
    index.js                    plugin の公開口
    <ルール名>/
      rule.js                   ESLint RuleModule
      test.js                   RuleTester + Vitest
      README.md                 目的・対象・通る例・違反例
      fixtures/                 型情報が必要なテストのみ
```

## ルール

- [no-throw-statement](rules/no-throw-statement/README.md): handler / usecase / repository での throw を禁止
- [require-result-return-type](rules/require-result-return-type/README.md): API の公開業務処理と factory が返すメソッドに Result を要求
- [no-discarded-result](rules/no-discarded-result/README.md): API / runner で Result の戻り値を捨てる式を禁止
- [no-relative-imports-across-layers](rules/no-relative-imports-across-layers/README.md): レイヤーをまたぐ相対 import を禁止
- [no-direct-env-access](rules/no-direct-env-access/README.md): 検証境界の外で環境変数を直接読む処理を禁止
- [require-ui-storybook-story](rules/require-ui-storybook-story/README.md): 共通 UI の隣に story を要求

## 追加・変更

1. ルールのディレクトリを作り、RuleTester に通る例と違反例を追加します。
2. テストが失敗することを確認してから `rule.js` を実装します。
3. `rules/index.js` に登録し、`index.js` で実際の対象ファイルと適用レベルを指定します。
4. README に対象外と理由も書き、テストとリポジトリ全体の Lint を実行します。

```sh
pnpm --filter @life-console/eslint-config test
pnpm lint
```

Result のルールは TypeScript の型情報を使います。API の DI factory 自体を Result に包むのではなく、返される業務メソッドを検査します。runner の実行ループは終了状態を扱うため一律の Result 戻り値強制の対象外ですが、取得・保存から返る Result の捨て忘れと throw は検査します。ブラウザの Query / Mutation に例外を伝える処理は、サーバーの throw 禁止対象に含めません。
