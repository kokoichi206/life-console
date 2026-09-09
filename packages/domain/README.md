# @life-console/domain

状態・種別などの候補値と、その値から導く TypeScript の型を管理します。候補値の正本は `src/index.ts` の名前付き配列です。API の DTO、Zod、Drizzle、実行環境には依存しません。

- `packages/contracts`: Zod の `z.enum(...)` と公開型から参照します。
- `packages/db`: Drizzle の `text(..., { enum: ... })` から参照します。
- API: repository・usecase・handler の引数型から参照し、境界で検証した値を `string` に広げず受け渡します。

全 connector の `connectorKinds` と、リポジトリへの対応付けに使える `sourceMappingConnectors` は対象範囲が違うため、別の名前で管理します。同様に、ジョブの全状態と完了報告で受け付ける状態は別の定義です。

SQLite の `enum` オプションは型推論用です。候補配列の共通化では SQL の列型や CHECK 制約は変わらず、migration は生成されません。DB の制約を追加する場合は `packages/db` の手順で別途管理します。
