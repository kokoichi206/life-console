# no-throw-statement

API の handler / usecase / repository と runner の usecase / repository で、期待される失敗を Result に統一します。テスト用コードも同じルールに従います。

## 通る例

```ts
return err(appError.validation("入力を確認してください。"));
```

## 違反例

```ts
throw new Error("入力を確認してください。");
```

## 対象範囲

外部例外は core の safeTry で受けます。環境変数の起動時検証と、ブラウザの Query / Mutation への例外伝播は対象外です。

## テスト

ルートで `pnpm --filter @life-console/eslint-config test -- rules/no-throw-statement/test.js`。正常系と違反例を RuleTester で検証します。
