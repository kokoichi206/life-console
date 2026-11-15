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

`createLogger("api")` のようにサービス名を指定します。Pino の browser entry を明示して、Workers と Node.js で同じ同期 JSON 出力を使います。`package.json` の `#pino` は実行時に browser entry、型検査では Pino の公開型を参照します。`info` / `warn` / `error` は同名の console メソッドへ出力します。

共通項目は Pino が付ける `time`（Unix ミリ秒）、`level`、`service` と、許可した `event`、`errorCode`、`jobId`、`runnerId`、`status`、`timestamp`、`method`、`route`、`status_code`、`duration_ms` です。`logger.child({ request_id })` でリクエスト ID を固定した子 logger を作れます。未知の項目、本文、token、例外の cause は出しません。

API は最外周のミドルウェアで UUID を発行し、Hono の `context.get("request_id")` と `context.get("logger")` に保持します。同じリクエスト内で追加のログが必要な処理には、この logger を渡します。外部指定の ID は採用せず、応答の `X-Request-Id` に発行した値を返します。

- Hono がレスポンスを確定したリクエストごとに `request_completed` を `info` で 1 件出力します。
- HTTP 4xx は `request_failed` を `warn`、5xx は `error` で追加の 1 件だけ出力します。`AppError` のコードからステータスへの変換は HTTP 層に置きます。`Result`、認証・検証の早期終了、404、未処理例外も同じ出口で記録します。
- 両ログに同じ `request_id`、メソッド、ルート定義、HTTP ステータス、応答確定までの時間（ミリ秒）を付けます。ルートは `:token` や `:id` を含む定義上のパスで、生の URL・クエリ・ヘッダーは記録しません。未知のルートは一致したミドルウェアのパターンになります。
- `request_failed` には `AppError` の `errorCode`、未処理例外は `internal_error`、フレームワークの HTTP エラーや通常の 404・入力検証は `http_error` を付けます。下位層で同じ失敗を重複記録しません。

対象は Hono に到達した HTTP リクエストです。Worker の強制終了、Cloudflare Access での拒否、静的アセットの直接配信は対象外です。処理時間はストリーミング本文の送信完了までの時間ではありません。

検証: ルートで `pnpm exec vitest run packages/core`。
