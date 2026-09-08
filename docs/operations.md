# 運用上の注意

コマンドは [package.json](../package.json)、環境変数は [runner の設定例](../apps/runner/.env.example) と [API の環境変数定義](../apps/api/src/shared/environment.ts)、配置処理は [deploy workflow](../.github/workflows/deploy.yml) を参照します。ここでは、設定値だけでは分からない運用上の前提を扱います。

## 配置と認証

`develop` は開発環境、`main` は本番環境に対応します。Worker・D1・R2・Access・Secrets を環境ごとに分け、本番データを開発環境へコピーしません。ローカル用の架空 seed は実データ用 D1 に適用しないでください。

初回配置では [開発用](../apps/api/wrangler.development.jsonc.example) / [本番用](../apps/api/wrangler.production.jsonc.example) の設定例を使い、次の順序で公開範囲を確認します。

1. 配置先アカウントを確認し、対象環境の D1 と非公開 R2 bucket を作成する。
2. 非公開の Wrangler 設定に接続先を記入し、`workers_dev: false`、`preview_urls: false`、`routes: []` のまま migration と初回配置を実行する。
3. Cloudflare Access で通常 URL とプレビュー URL を保護し、本人メール完全一致の Allow ポリシーを設定する。
4. Access の対象とポリシーを確認してから `workers_dev` を `true` にする。未ログインの画面・API が Access に転送され、本人のログイン後に開けることを確認する。

GitHub Environment の配置許可ブランチは `development` が `develop`、`production` が `main` のみとします。デプロイ用 API token は対象アカウントに絞り、Workers・D1・R2 の編集権限を付けて環境別に発行します。Secrets はリポジトリ共通ではなく、各 Environment に登録します。

migration 後に配置が失敗すると、適用済みの migration は残ります。稼働中の Worker との互換性を保ってください。通常の変更は feature ブランチから `develop` へ取り込み、開発環境で確認後、`develop` → `main` の PR を merge commit でマージします。

## Mac runner の接続

runner は起動すると API を poll し、実際の同期や job を実行します。画面確認だけなら起動は不要です。環境変数は shell または secret store から渡し、コード・設定を変えたら再起動します。`.env.example` は自動では読み込みません。

クラウドへ接続するときは、runner の `LIFE_CONSOLE_RUNNER_TOKEN` と API の `RUNNER_TOKEN` を一致させます。Cloudflare Access には別途 Service Auth の設定が必要で、runner に `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` を渡します。本人メールの Allow ポリシーだけでは機械接続は通りません。agent の job report の送信経路も含めて接続を確認してください。

常駐用の [LaunchAgent の例](../apps/runner/launchd/com.life-console.runner.plist.example) はローカル環境向けです。クラウド用には接続先と環境名を変更し、開発用・本番用の token と保存先を分けます。secret は plist に直接書かず secret store から渡します。GitHub Actions は Mac の runner を更新しません。

## 外部サービスとファイル連携

利用するサービスの CLI を Mac で準備・認証します。取り込み対象のアカウント、検索条件、room は [runner の設定例](../apps/runner/.env.example) で指定します。Chatwork の room 未指定時は参加中の全 room が対象です。Talknote のセッション切れは `tn auth guide` から再認証します。

日程候補の生成には、Gmail 用アカウントの Calendar 認証権限も必要です。アカウント未指定時に自動選択するのは、Gmail 対応アカウントが 1 件の場合だけです。

外部サービスで返信した後は、会話の下書きを再作成すると履歴と返信判定を更新できます。送信 job が `lost` になった場合は、再度送信する前に元のサービスで投稿の有無を確認します。

体重 CSV の列は `date,weight_kg,ma7_kg,window_samples`。家計 CSV は [サンプル](../apps/runner/examples/finance.csv)、体重の Obsidian 連携は [書き出し設定](weight-obsidian-export.md) を参照します。実データ・資格情報・agent transcript はリポジトリへ含めず、設定例と検証資料には架空データを使います。

## ホーム画面と通知

Android の Chrome は『ホーム画面に追加』→『インストール』、iPhone の Safari は共有メニュー→『ホーム画面に追加』から Web アプリを追加します。『Web アプリとして開く』が表示される場合は有効化します。Access のセッションが切れた場合は再ログインが必要です。

Web Push は API に VAPID の公開鍵・秘密鍵と本人の連絡先を設定して使います。鍵は一度生成したものを継続して使い、ローカルでは `apps/api/.dev.vars`、クラウドでは対象環境の Wrangler secret に保存します。

『同期・実行状況』の『この端末への通知』で端末ごとに有効化し、『テスト通知を送る』で OS に届くことを確認します。iPhone / iPad は iOS / iPadOS 16.4 以降で、ホーム画面に追加した Web アプリから通知を許可します。通知を押すと『同期・実行状況』を開きます。

runner と外部 CLI は起動時と 2 分ごとに確認します。runner は最終受信から 3 分で遅延、5 分で応答なしと判定します。認証切れ・権限不足・アカウント未設定は初回から、それ以外は 2 回連続の失敗で通知します。通信断中の観測は Mac に保存し、復旧後に履歴へ反映します。

使わない連携は `LIFE_CONSOLE_MONITOR_SERVICES` から外します。runner の初回接続前から未着を検知したい場合は、API の `MONITORED_RUNNER_IDS` に対象 ID を設定します。未指定なら初回接続後から監視します。
