# @life-console/env

共通の APP_ENV と Zod schema だけを公開します。`process.env` や `import.meta.env` の読み込み、アプリ固有の secret は持ちません。

```ts
import { APP_ENV, baseEnvSchema } from "@life-console/env";
import { z } from "zod";

const schema = baseEnvSchema.extend({ SERVICE_URL: z.url() });
const configuration = schema.parse({ APP_ENV: APP_ENV.LOCAL, SERVICE_URL: "http://localhost:8788" });
```

APP_ENV は `local`、`development`、`production` のいずれかで、未指定や略称を受け付けません。NODE_ENV はライブラリの最適化用であり、この実行環境の区分とは別です。

各アプリの検証境界:

- API: `apps/api/src/shared/environment.ts`。HTTP と Cron の入口で検証。Workers の DB / R2 binding 自体はプラットフォームの保証を使います。
- runner: `apps/runner/src/environment.ts` で定義し、`config.ts` で起動時に検証。local 以外では接続先と専用 token が必要です。Access の ID / secret は片方だけ指定できません。
- Web: `apps/web/src/env/client-env.ts`。公開可能な `VITE_APP_ENV` だけを明示的に読み、共通の APP_ENV に変換します。secret を client schema へ足さないでください。

API の RUNNER_TOKEN は未設定なら runner 認証を拒否します。local のみローカル用 token を使用します。写真を Worker 経由で保存する場合は S3 の secret を要求せず、R2 直接 upload を選択した場合だけ必要な設定を要求します。

検証: ルートで `pnpm exec vitest run packages/env apps/api/src/shared/environment.test.ts apps/runner/src/environment.test.ts apps/web/src/env`。
