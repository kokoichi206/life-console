# @life-console/core

API、runner が使う Result と構造化 logger。DB、環境変数、アプリの業務型には依存しません。

```ts
import { err, ok, safeTry, type Result } from "@life-console/core";

const read = async (): Promise<Result<string, string>> => {
  const result = await safeTry(() => externalService.read());
  if (!result.ok) return err("取得に失敗しました。");
  return ok(result.value);
};
```

期待される失敗は Result で返します。例外を投げる外部ライブラリだけ `safeTry` で囲み、業務エラーへの変換はアプリ側で行います。エラーコードや HTTP ステータスはアプリ固有なので、ここへ集約しません。

`createLogger("api")` のようにサービス名を指定します。ログ項目は event、errorCode、jobId、requestId、runnerId、status、timestamp に限定し、本文、token、例外の cause は出しません。

検証: ルートで `pnpm exec vitest run packages/core`。
