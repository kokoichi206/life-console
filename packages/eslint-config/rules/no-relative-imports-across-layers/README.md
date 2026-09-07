# no-relative-imports-across-layers

handler / usecase / repository をまたぐ import にはアプリ内 alias を使います。同じレイヤー内は相対 import を使用できます。

## 通る例

```ts
import { repository } from "@api/repositories/task";
```

## 違反例

```ts
import { repository } from "../repositories/task";
```

## 対象範囲

このルールは相対パスの禁止を担当し、依存方向全体や循環の解析はしません。

## テスト

ルートで `pnpm --filter @life-console/eslint-config test -- rules/no-relative-imports-across-layers/test.js`。正常系と違反例を RuleTester で検証します。
