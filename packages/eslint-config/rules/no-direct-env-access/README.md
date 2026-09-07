# no-direct-env-access

Zod の検証境界以外で process.env と import.meta.env を読む処理を検出します。角括弧での参照も対象です。

## 通る例

```ts
const environment = clientEnv.APP_ENV;
```

## 違反例

```ts
const environment = process.env.APP_ENV;
```

## 対象範囲

runner の config.ts、Web の client-env.ts、ビルド設定と ESLint の実装は直接参照できます。Workers の binding は Hono / Cron の入口で別途検証します。

## テスト

ルートで `pnpm --filter @life-console/eslint-config test -- rules/no-direct-env-access/test.js`。正常系と違反例を RuleTester で検証します。
