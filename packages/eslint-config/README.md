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

TypeScript のソース・テスト・設定ファイルには `projectService` で型情報を与え、次のルールをすべて `error` で適用します。型検査用の `tsconfig.json` に含まれないファイルも Lint で失敗します。意図的に不正なコードを置く `fixtures` は対象外です。

- `no-floating-promises`: Promise の処理忘れを検出。意図的な非同期実行を示す `void` は許可しますが、失敗の処理を代わりに行うものではありません。
- `no-misused-promises`: 同期の判定や callback に Promise を誤って渡す処理を検出
- `await-thenable`: Promise などの thenable ではない値の `await` を検出
- `switch-exhaustiveness-check`: union / enum の分岐漏れを検出

Web のソース・stories・設定には React Hooks の `rules-of-hooks` と `exhaustive-deps` も `error` で適用します。

### Web のデザインルール

`@shadcn/lint` の次のルールを `apps/web/**/*.{ts,tsx}`（stories を含む）に `error` で適用します。API と runner は対象外です。テーマと共通 UI は `apps/web/components.json` から解決します。

| ルール | 検出する内容 | 修正方法 |
| --- | --- | --- |
| `no-raw-colors` | Tailwind の直接色、未定義の色 token、SVG の直接色 | `src/styles.css` のテーマ色、`currentColor` を使う |
| `no-unknown-classes` | Tailwind が生成できないクラス | 既存の utility に直す |
| `no-inline-styles` | `style` の通常プロパティ、`<style>` | 固定値はクラス、動的な値は CSS カスタムプロパティにする |
| `require-static-classes` | 共通 UI に渡す、静的に解析できないクラス名 | 完全なクラス名を `cn` の条件式・オブジェクトで選ぶ |

`fill-none` は SVG の塗りなしを示すため、`no-raw-colors` で許可します。共通 UI の実装は利用側の `className` を合成するため、`require-static-classes` だけ対象外です。そのディレクトリ内の stories とテストには適用します。

`no-restyle` と `no-arbitrary-values` は有効にしていません。既存の `Panel` などは利用側で余白を指定し、グラフ・レスポンシブレイアウトは任意値を使っています。これらを制限する場合は、部品ごとの変更可能な範囲とテーマの寸法を先に定義します。

```tsx
<div className="w-(--bar-width) bg-primary" style={{ "--bar-width": `${percentage}%` } as CSSProperties} />
```

ルールの有効化と適用範囲は `shadcn-config.test.js` で、実際の ESLint 設定に通る例・違反例を入力して検証します。[公式のルール一覧](https://github.com/shadcn-ui/lint/blob/main/docs/rules.md)も参照してください。

### プロジェクト固有のルール

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
