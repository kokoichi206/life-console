# no-discarded-result

API / runner で Result または Promise<Result> を返す式文を検査します。await や void で結果を捨てる場合も検出します。

## 通る例

```ts
const result = await repository.save();
if (!result.ok) return result;
```

## 違反例

```ts
await repository.save();
void repository.save();
```

## 対象範囲

戻り値を変数へ保存した後の全経路の判定までは追跡しません。テストは対象外です。型情報が必要です。

## テスト

ルートで `pnpm --filter @life-console/eslint-config test -- rules/no-discarded-result/test.js`。正常系と違反例を RuleTester で検証します。
