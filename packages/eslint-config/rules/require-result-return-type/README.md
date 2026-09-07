# require-result-return-type

API の handler / usecase の公開関数、および DI factory が返すメソッドの型を検査します。Result の別名や型推論、Promise<Result> も対象です。

## 通る例

```ts
export const createUsecase = () => ({ get: (): Result<number, string> => ok(1) });
```

## 違反例

```ts
export const createUsecase = () => ({ get: () => 1 });
```

## 対象範囲

projectService を必須にし、型情報が無い場合は設定エラーとします。テスト、HTTP Response を作る app.ts、終了状態を管理する runner は対象外です。

## テスト

ルートで `pnpm --filter @life-console/eslint-config test -- rules/require-result-return-type/test.js`。正常系と違反例を RuleTester で検証します。
