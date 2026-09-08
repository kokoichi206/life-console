# API と runner の E2E

実際の Worker を Wrangler のローカル runtime で起動し、ビルド済み runner を別の Node.js プロセスで実行します。HTTP、D1 binding、Cron handler、ファイル保存を差し替えずに検証します。

```sh
pnpm test:e2e
```

Web / API / runner のビルドから実行します。ビルド済みなら `pnpm test:e2e:run` で E2E だけを実行できます。`pnpm check` と CI もビルド直後に同じ E2E を実行します。Node.js 24 以上と `pnpm install --frozen-lockfile` が必要です。

## 検証する経路

`weight-export.test.mjs` は、HTTP で架空の体重と定期設定を登録し、Cron が作ったジョブを runner が取得するところから、CSV・グラフ用 JS の更新と成功報告まで確認します。DB にない過去の体重が残ること、認証なし・不正な token で取得できないこと、既存 CSV がない場合に失敗結果が記録されることも確認します。

Cron は Wrangler の [ローカル実行用の入口](https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers-locally)から呼びます。実際の時刻到来は待たず、アプリの `scheduled` handler を実行します。runner は通常の entry point に `--once` を渡します。

## 実行環境

- 一時フォルダ内に全 migration を適用した専用 D1、runner の監視キュー、架空の体重ファイルを作ります。普段の開発用 DB や seed は使いません。
- API は `127.0.0.1` の自動割り当てポートで起動します。`pnpm dev` や常駐 runner の事前起動は不要です。
- API の設定は `apps/api/wrangler.jsonc` から生成し、パスを絶対化して `/__scheduled` を Worker に通します。個人の `.dev.vars` や shell の連携設定を引き継ぎません。
- runner の外部サービス監視は無効にし、外部 CLI のない `PATH` で実行します。専用 D1 に登録した体重ジョブだけを処理します。
- 終了時は起動した Worker を停止し、一時フォルダを削除します。失敗時は HTTP 応答と Worker のログをエラーに含めます。

ブラウザ操作、Cloudflare 上の配置・Access 認証、Mac の常駐設定、外部サービスの実アカウントは対象外です。UI の検証は Storybook、保存条件の細かな検証は [API の DB 結合テスト](../apps/api/tests/integration/README.md) が担当します。
