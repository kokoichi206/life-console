# Life Console

仕事、会話、家計、体重、食事を一か所で扱う、本人用のダッシュボードです。Web/API は Cloudflare、外部サービスとの同期と coding agent の実行は Mac の runner が担当します。

- 仕事: タスク管理、会話の取り込み、返信下書き、GitHub Issue / Project への昇格、Codex / Claude Code の起動
- 健康: 体重・目標・食事の記録、体重グラフ、CSV 取込、Obsidian への書き出し
- お金: 収支・残高・純資産の集計
- 同期・実行状況: 定期実行、バックアップ、runner と外部 CLI の監視、端末への通知

## ローカル起動

Node.js 24 以上と、`package.json` 指定の pnpm を使います。

```bash
pnpm install --frozen-lockfile
pnpm local:setup
pnpm dev
```

- Web: <http://localhost:5173>
- API health: <http://localhost:8788/api/v1/health>

`pnpm local:setup` はローカル D1 の migration と架空 seed を適用します。再実行しても既存の入力は上書きしません。

### runner

同期や agent 実行を使う場合は、別のターミナルで起動します。

```bash
pnpm dev:runner
```

1 回だけ実行する場合は `pnpm dev:runner:once`。ローカルの接続先は `http://localhost:8788` です。

使う連携に応じて `sl`、`cw`、`gog`、`tn`、`orca`、`claude` などの CLI を準備・認証します。[設定例](apps/runner/.env.example)を参照し、必要な環境変数を shell または secret store から渡してください。`.env.example` は自動では読み込みません。コード・環境変数を変更したら runner を再起動します。

CSV の形式は、体重が `date,weight_kg,ma7_kg,window_samples`、家計が [サンプル](apps/runner/examples/finance.csv) の形式です。体重を Obsidian に反映する場合は [書き出し設定](docs/weight-obsidian-export.md) を参照してください。

## 返信下書き

『仕事』で会話を選ぶと、返信案を作成・編集・保存・コピーできます。一括作成はサービスと期間を選んで『未返信の下書きをまとめて作成』から実行します。

| サービス | 取り込み対象・設定 |
| --- | --- |
| Gmail | 既定は直近 7 日の受信トレイのメインカテゴリ。`GMAIL_ACCOUNT` / `GMAIL_SEARCH_QUERY` で指定 |
| Slack | 既定は直近 7 日の本人へのメンション。`SLACK_WORKSPACE` / `SLACK_SEARCH_QUERY` で指定 |
| Chatwork | 本人への To / 返信と未完了タスク。`CHATWORK_ACCOUNT` / `CHATWORK_ROOM_IDS` で指定。room 未指定時は参加中の全 room |
| Talknote | DM と参加ノートの投稿・コメント。`TALKNOTE_ACCOUNT` で指定。セッション切れは `tn auth guide` から再認証 |

生成には認証済みの Claude Code を使い、会話本文をモデルへ送ります。下書きはアプリ内に保存され、生成だけでは送信も Gmail 下書きの作成も行いません。手動編集した本文は再生成で上書きしません。

Slack / Chatwork への送信は、内容を確認して『確認して送信を依頼』を押します。送信結果が不明になった job は `lost` と表示し、自動再送しません。元のサービスで投稿の有無を確認してください。

返信済み・返信不要は既定で非表示です。判断が必要な会話や取得・生成の失敗は確認待ちになります。外部サービスで返信した後は、下書きを再作成すると判定を更新できます。

日程候補を含める場合は、個別の会話で『カレンダーの空き時間を使う』を選びます。`GMAIL_ACCOUNT` のメインカレンダーを参照するため、Calendar の認証権限が必要です。アカウント未指定時は Gmail 用アカウントが 1 件の場合のみ自動選択します。他のカレンダー・祝日・移動時間・相手の予定は確認しません。日程を使う返信案は確認待ちになり、予約や招待への承諾は行いません。

## スマホで使う

本番 URL をブラウザで開き、Cloudflare Access にログインしてからホーム画面に追加します。

- Android の Chrome: 『ホーム画面に追加』→『インストール』
- iPhone の Safari: 共有メニュー→『ホーム画面に追加』。『Web アプリとして開く』が表示される場合は有効化

利用にはネットワーク接続が必要です。Access のセッションが切れた場合は再ログインします。

[Android ウィジェット](clients/android/README.md) を使うと、ホーム画面から体重・食事の入力画面を直接開けます。

## Web Push 通知

『同期・実行状況』の『この端末への通知』で、端末ごとに有効・無効を切り替えます。『テスト通知を送る』で OS の通知が届くことを確認してください。

iPhone / iPad は iOS / iPadOS 16.4 以降で、ホーム画面に追加した Web アプリから通知を許可します。通知を押すと『同期・実行状況』を開きます。

通知を使う環境では VAPID 鍵を一度生成し、継続して同じ鍵を使います。

```sh
pnpm --filter @life-console/api exec web-push generate-vapid-keys
```

生成した鍵と本人の連絡先を次の環境変数に設定します。ローカルは `apps/api/.dev.vars`、クラウドは対象環境の Wrangler secret に保存します。

| 環境変数 | 値 |
| --- | --- |
| `WEB_PUSH_PUBLIC_KEY` | public key |
| `WEB_PUSH_PRIVATE_KEY` | private key |
| `WEB_PUSH_SUBJECT` | 本人の連絡先 `mailto:` URL または HTTPS URL |

```sh
pnpm --filter @life-console/api exec wrangler secret put WEB_PUSH_PUBLIC_KEY --config wrangler.production.jsonc
pnpm --filter @life-console/api exec wrangler secret put WEB_PUSH_PRIVATE_KEY --config wrangler.production.jsonc
pnpm --filter @life-console/api exec wrangler secret put WEB_PUSH_SUBJECT --config wrangler.production.jsonc
```

開発環境では `--config wrangler.development.jsonc` を指定します。

## 死活監視

『同期・実行状況』で runner と外部 CLI の状態・履歴を確認できます。通知を有効にした端末には、異常・未復旧・復旧を通知します。

- runner と CLI は起動時と 2 分ごとに確認。runner は最終受信から 3 分で遅延、5 分で応答なしと判定します。
- 明確な認証切れ・権限不足・アカウント未設定は初回から、それ以外は 2 回連続の失敗で通知します。通信断中の観測は Mac に保存し、復旧後に履歴へ反映します。
- 未使用の連携は `LIFE_CONSOLE_MONITOR_SERVICES` から外して runner を再起動します。既定の対象は [設定例](apps/runner/.env.example) を参照してください。
- 初回起動前から runner の未着を検知する場合は、API の `MONITORED_RUNNER_IDS` に対象の `LIFE_CONSOLE_RUNNER_ID` をカンマ区切りで設定します。未指定なら初回接続後から監視します。

CLI の接続確認と通常の同期結果は別です。同期の成否は job の状態で確認してください。Cloudflare 自体の停止を外部から検知する監視はありません。

## 品質確認

```bash
# 初回のみ
pnpm --filter @life-console/web exec playwright install chromium
pnpm check
```

`pnpm check` は migration の生成漏れ・lint・型検査・テスト・ビルド・Storybook のブラウザテスト・AI 指示の整合性を確認します。`develop` / `main` 向け PR の CI でも同じ検査を実行します。

`pnpm storybook` で <http://localhost:6006> に UI カタログを起動できます。Android は別途 [Android の検証手順](clients/android/README.md#lint-と-ci) を使います。

## Cloudflare へ配置する場合

| ブランチ | GitHub Environment / APP_ENV | Worker / D1 | R2 bucket |
| --- | --- | --- | --- |
| `develop` | `development` | `life-console-development` | `life-console-development-meal-photos` |
| `main` | `production` | `life-console` | `life-console-meal-photos` |

Worker・D1・R2・Access・Secrets は環境ごとに分けます。本番データを開発環境へコピーせず、実データ用 D1 にローカル seed を適用しないでください。

### 初回配置

1. `pnpm --filter @life-console/api exec wrangler whoami` で配置先アカウントを確認し、対象環境の D1 と非公開 R2 bucket を作成します。
2. [development 設定例](apps/api/wrangler.development.jsonc.example) または [production 設定例](apps/api/wrangler.production.jsonc.example) を、末尾の `.example` を外した名前でコピーします。`account_id`、D1 の `database_id`、bucket 名を設定し、`workers_dev: false`、`preview_urls: false`、`routes: []` のまま migration と初回配置を実行します。
3. Cloudflare Access で対象 Worker の通常 URL とプレビュー URL を保護し、本人メール完全一致の Allow ポリシーを設定します。
4. Access の対象とポリシーを確認してから `workers_dev` を `true` にして再配置します。未ログインの画面・API が Access に転送され、本人のログイン後に開けることを確認します。

開発環境:

```bash
pnpm --filter @life-console/api exec wrangler d1 create life-console-development
pnpm --filter @life-console/api exec wrangler r2 bucket create life-console-development-meal-photos
pnpm --filter @life-console/api exec wrangler d1 migrations apply DB --remote --config wrangler.development.jsonc
pnpm --filter @life-console/api deploy:development
```

本番環境:

```bash
pnpm --filter @life-console/api exec wrangler d1 create life-console
pnpm --filter @life-console/api exec wrangler r2 bucket create life-console-meal-photos
pnpm --filter @life-console/api exec wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
pnpm --filter @life-console/api deploy
```

### GitHub Actions からの更新

初回配置と Access の設定を終えてから、GitHub Environment を作成します。『Deployment branches and tags』で `development` は Branch `develop`、`production` は Branch `main` のみを許可し、各 Environment に次の Secrets を登録します。

| Secret | 値 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 対象環境のデプロイ用 API token |
| `CLOUDFLARE_ACCOUNT_ID` | 配置先アカウント ID |
| `CLOUDFLARE_D1_DATABASE_ID` | 対象環境の D1 ID |
| `CLOUDFLARE_R2_BUCKET_NAME` | 対象環境の R2 bucket 名 |

デプロイ用 API token は Workers の編集権限に `Account / D1 / Edit` と `Account / Workers R2 Storage / Edit` を加え、対象アカウントに絞ります。環境別に発行し、リポジトリ共通の Secrets には置きません。

[deploy workflow](.github/workflows/deploy.yml) が対象ブランチへの push 後に検証・migration・Web/API の配置を実行します。文書だけの変更は自動配置を省略します。同じ環境への配置は直列に実行します。migration 後に配置が失敗すると migration は残るため、稼働中の Worker との互換性を保ってください。

通常は feature ブランチから `develop` へ取り込んで開発環境で確認し、リリース時に `develop` → `main` の PR を merge commit でマージします。

### クラウドに接続する runner

`APP_ENV`、`LIFE_CONSOLE_API_URL`、`LIFE_CONSOLE_RUNNER_TOKEN` を対象環境に合わせ、API 側には同じ値の `RUNNER_TOKEN` を設定します。Access の機械認証には `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` を使います。本人メールの Allow ポリシーだけでは runner の接続は通りません。job report の送信経路も含めて確認してください。

常駐には [LaunchAgent の例](apps/runner/launchd/com.life-console.runner.plist.example) を使えます。例はローカル用なので、接続先と環境名を変更し、secret は plist に直接書かず secret store から渡します。開発用と本番用で token・接続先・保存先を分けてください。GitHub Actions は Mac の runner を更新しません。

## 開発資料

- [要件定義](docs/requirements.md)
- [開発ルール](AGENTS.md) / [AI 設定](docs/agent-configuration.md)
- [Web / Storybook](apps/web/README.md) / [ネイティブクライアント](clients/README.md)
- [core](packages/core/README.md) / [DB](packages/db/README.md) / [環境変数](packages/env/README.md) / [ESLint](packages/eslint-config/README.md)
- [GitHub Actions の検査](.github/README.md)

実データ、資格情報、agent transcript はリポジトリに含めません。設定例・seed・CSV 例には架空データを使います。
