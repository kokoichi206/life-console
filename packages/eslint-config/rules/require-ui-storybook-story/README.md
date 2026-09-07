# require-ui-storybook-story

apps/web/src/components/ui の TSX ファイルに、同じ名前の .stories.tsx を要求します。

## 通る例

```ts
// Button.tsx の隣に Button.stories.tsx がある
export const Button = () => null;
```

## 違反例

```ts
// Button.stories.tsx がない
export const Button = () => null;
```

## 対象範囲

stories・test・spec・index は対象外です。ページ専用部品の全件強制はせず、主要な画面状態をページの story で検証します。

## テスト

ルートで `pnpm --filter @life-console/eslint-config test -- rules/require-ui-storybook-story/test.js`。正常系と違反例を RuleTester で検証します。
