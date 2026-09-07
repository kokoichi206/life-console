# Life Console

仕事、会話、家計、体重、食事、coding agent の実行状況を一か所で扱う、本人用のダッシュボードです。公開コードと個人データを分離し、Web/API は Cloudflare、外部 CLI と agent 実行は Mac の runner が担当します。

[要件定義](docs/requirements.md)に定めた MVP を実装しています。Talknote、栄養推定の自動化、PWA の追加機能、Android/iOS native、複数リポジトリ UI、GitHub との双方向同期は要件上の MVP 対象外です。

## 構成

```text
apps/web       Vite + React + TanStack Router/Query
apps/api       Hono + Workers Static Assets + D1 + R2
apps/runner    Mac で動く CLI/Orca adapter と job executor
packages/core       Result、構造化 logger
packages/contracts  API の Zod schema、共有 DTO
packages/db         Drizzle schema、migration、架空 seed
packages/env        APP_ENV、共通環境変数 schema
packages/eslint-config  Flat Config、ルール別の実装・README・テスト
```

API は `handler -> usecase -> repository` の向きに依存し、外部境界で Zod により検証します。失敗を値として扱う処理には `@life-console/core` の `Result<T, E>` を使い、Worker と runner の共通 logger は本文・token・transcript を出しません。Result の戻り値と捨て忘れも ESLint で検査します。

責務と使い方は [core](packages/core/README.md)、[db](packages/db/README.md)、[env](packages/env/README.md)、[ESLint](packages/eslint-config/README.md)、[Web / Storybook](apps/web/README.md) を参照してください。フロントのページ専用部品・query・テスト・stories はページの近くに配置しています。

## 必要環境

- Node.js 24 以上
- pnpm 10.34.4
- ローカル runner の実機能を使う場合は `orca`、`sl`、`cw`、`wrangler` の各 CLI

## ローカル起動

初回だけ依存関係、ローカル D1 migration、架空 seed を準備します。

```bash
pnpm install
pnpm local:setup
```

Web と API を起動します。

```bash
pnpm dev
```

- Web: <http://localhost:5173>
- API health: <http://localhost:8788/api/v1/health>

ローカル seed は最初から架空の値だけで作っています。`pnpm local:setup` は migration と `INSERT OR IGNORE` の seed を再実行でき、既存の入力は上書きしません。

常駐 runner は別 terminal で起動します。runner は Mac から API を定期 poll し、`sl`、`cw`、Orca が必要な job だけを実行します。

```bash
pnpm dev:runner
```

1 回だけ poll して終了する場合は `pnpm dev:runner:once` を使います。

ローカル既定値では `http://localhost:8788` と `local-runner-token` を使います。外部 connector、CSV、backup を動かす場合は [runner の設定例](apps/runner/.env.example)を参照し、必要な環境変数だけを private な shell 設定または secret store から export してください。このファイルを直接読み込む dotenv 処理は入れていません。

```bash
export WEIGHT_CSV_PATH=/private/path/to/weight-trend.csv
export FINANCE_CSV_PATH=/private/path/to/finance.csv
export SLACK_WORKSPACE=work
export SLACK_SEARCH_QUERY='@your-slack-name'
export CHATWORK_ACCOUNT=work
export CHATWORK_ROOM_IDS=123456789,987654321
pnpm dev:runner
```

`sl auth` と `cw auth` が保持する資格情報は Mac の外へ出しません。『仕事』の『連絡を同期』、または『同期・実行状況』から同期 job を作成すると、Slack は検索 query に一致する会話、Chatwork は自分への mention と自分の open task を取り込みます。`CHATWORK_ROOM_IDS` が空なら参加中の全 room、指定されていればその room だけを対象にします。受信箱はサービス・期間・対応状況で絞り込み、元メッセージを保持したままタスク化できます。送信内容の確認後に『確認して送信を依頼』を押すと、runner が `sl messages reply` または `cw messages reply` で送信します。

返信送信中に runner が停止して結果を確認できなくなった job は `lost` とし、自動再送しません。元のサービスで投稿の有無を確認してください。実行待ちの job は中止するとその場で `canceled` になり、runner は実行開始前にも lease と中止要求を確認します。

金融 CSV の形式は [架空サンプル](apps/runner/examples/finance.csv)を参照してください。体重 CSV は `date,weight_kg,ma7_kg,window_samples` header を受け付けます。

## 実装されている主な機能

- タスク CRUD、期限・状態、会話分類、単一 work リポジトリ選択
- GitHub Issue / Project 4 への一方向昇格 job と専用 skill
- Orca 経由の Codex / Claude Code 起動、fencing token、独立 heartbeat、明示完了、cancel
- Slack `sl search`、Chatwork `cw sync` / open task connector、watermark と冪等取込、手動同期
- 取得会話からのタスク作成と、明示確認後の Slack / Chatwork 返信 job
- 食事写真の client resize / 再 encode による EXIF 除去、R2 upload、食事メモ
- 体重の手入力・CSV 取込、暦日ベースの 7 日移動平均
- 収支の月別・カテゴリ別・支払手段別集計、残高・純資産推移、追記型の補正履歴
- D1 schedule と単一 Cron による catch-up、coalescing、deadline、lost batch の再 queue
- D1 dump と R2 object 本体の Mac 側 backup job
- desktop/mobile responsive UI
- ホーム画面から独立したウィンドウで起動する PWA

## スマホのホーム画面に追加

本番 URL をスマホのブラウザで開き、Cloudflare Access にログインしてから追加します。

- Android の Chrome: メニューの『ホーム画面に追加』から『インストール』を選びます。
- iPhone の Safari: 共有メニューの『ホーム画面に追加』を選びます。『Web アプリとして開く』が表示される場合は有効にします。

追加した Life Console のアイコンから、ホーム画面をアドレスバーなしで開けます。利用にはネットワーク接続が必要です。Access のセッションが切れた場合は再ログインします。

manifest は認証 Cookie を送って取得します。Service Worker とオフラインキャッシュは使いません。アイコンの編集元は `apps/web/public/icons/app.svg`、配信用の PNG は同じディレクトリに置いています。

## 体重の記録

『健康』の『体重を記録』から入力シートを開きます。整数部と小数部をホイールで選び、計測した日付・時刻を指定して保存します。直接の数値入力にも切り替えられます。初期値は直近の計測値、日時はシートを開いた時点の端末の現在日時です。初回は空欄から入力します。

`/health?entry=weight` で入力シートを開いた状態を復元します。再読み込みとブラウザの戻る・進むにも対応し、入力途中の体重・日時は URL には含めません。

Storybook の `Health/体重を記録` でライト・ダーク・初回・保存中・保存失敗を確認できます。`Pages/健康` の『URL から体重記録を開く』では健康画面に重ねた状態を確認します。

## 返信下書き

『仕事』の受信箱（`/tasks`）で会話を選ぶと、返信案の作成・編集・保存・コピー、関連タスク、実行経過を確認できます。『下書きあり』で返信案だけを絞り込めます。旧 `/drafts` はこの表示へ転送します。サイドバーの主要項目は『ホーム・仕事・健康・お金』とし、同期設定と稼働監視は下部の『同期・実行状況』に分けています。

個別の下書きは選択した会話の履歴だけを再取得します。一括作成では、サービスと期間を選んで『未返信の下書きをまとめて作成』を押します。Gmail (`gog`)、Slack (`sl`)、Chatwork (`cw`)、Talknote (`tn`) を runner が同期し、結果をアプリ内に保存します。生成だけでは送信せず、Gmail の下書きフォルダにも作成しません。サービス・期間・表示・選択は URL に保持し、受信箱とタスクの切り替えで編集途中の下書きを失わない構成です。

### カレンダーを使った日程候補

会話詳細の『カレンダーを使って再作成・履歴を再確認』を開き、『カレンダーの空き時間を使う』を選びます。確認期間（最大 31 日）、時間帯、所要時間（30 分 / 60 分）を指定して作成します。初期値は当日から 14 日間、平日 09:00〜18:00、日本時間、30 分です。

- `gog calendar freebusy primary` で、`GMAIL_ACCOUNT` のメインカレンダーを読みます。未指定なら Gmail 用アカウントが一つの場合だけ自動選択し、複数の場合は設定を求めます。Calendar の認証権限も必要です。
- 忙しい時間・過去・土日・指定時間帯外をコードで除外します。モデルが会話条件に合う候補 ID を選び、確認済みの日時をコードで本文に挿入します。所要時間や日付の条件が一致しない場合は確認待ちです。
- 予定の件名や参加者は取得しません。モデルに渡すのは会話履歴と空き時間です。確認したアカウント・期間・取得日時は下書きの『確認事項・判定理由』に保存します。
- 取得失敗やカレンダー単位の権限エラーは空きとして扱わず、作成を中止します。他のカレンダー・祝日・移動時間・相手の予定は未確認です。空いていることを参加への同意とみなさず、日程を使う返信案は確認待ちにします。予約・予定作成・招待への承諾は行いません。
- カレンダー参照は個別作成時に選択します。一括作成では利用しません。手動編集済みの本文は日程を再確認しても上書きしません。

### 取り込みと生成の範囲

- Gmail は既定で直近 7 日の受信トレイのメインカテゴリが対象です。`GMAIL_ACCOUNT` / `GMAIL_SEARCH_QUERY` で指定できます。検索はページを最後まで取得し、メールスレッドの最新受信を取り込みます。`gog` は `--gmail-no-send --no-input --wrap-untrusted --sanitize-content` を使用します（検索は sanitize 非対応のため本文を取得しません）。
- Slack は既定で直近 7 日の本人へのメンションを全ページ取得します。Chatwork は本人への To / 返信と open task を取り込み、`cw sync` の差分だけでなく local 履歴も読みます。
- Talknote は `tn` の本人セッションを使って DM と参加ノートの投稿・コメントを読みます。現行 CLI はページ取得を公開していないため、取得上限で履歴が欠ける場合は成功扱いにしません。セッション切れは `tn auth guide` の手順で本人が再ログインしてください。認証情報をこのアプリに入力する必要はありません。
- 返信の生成前に履歴を読み直します。Chatwork は明示的な返信先を照合し、それ以外は本人の送信履歴と内容をモデルが照合します。「返信済み」には対象以後の本人メッセージ ID を根拠として要求します。後から別件で発言しただけでは返信済みとしません。
- 返信済み・返信不要は既定で非表示です。履歴不足、日程・方針など本人の判断が必要なもの、取得・生成に失敗したものは確認待ちにします。生成後に外部サービスで返信した場合は、再度作成を実行すると判定が更新されます。常時リアルタイムの判定ではありません。
- 生成には認証済みの `claude --print` を使います。外部の会話を信頼しないデータとして渡し、ツール、MCP、カスタマイズ、セッション保存を無効化します。会話本文は Claude Code のモデルへ送られますが、サービスの token / Cookie は渡しません。
- 手動編集した本文は再生成で上書きしません。保存には job の有効な lease が必要で、画面からの編集は更新日時による競合検出を行います。下書き作成は現在、画面からの手動実行です。

ローカル DB の更新: `pnpm --filter @life-console/db migrate:local`。runner のコード・環境変数を変えた場合は runner を再起動してください。

## 品質確認

`develop` 向けの PR では GitHub Actions の `CI / Quality checks` が `pnpm check` を実行します。PR の CI は本番の Secrets を使わず、デプロイも行いません。

```bash
pnpm check
```

上記で ESLint、TypeScript strict、Vitest、Web/API/runner の production build、Storybook のビルドとブラウザテストを順に実行します。初回だけ `pnpm --filter @life-console/web exec playwright install chromium` でテスト用 Chromium を準備してください。自動修正は `pnpm lint:fix` です。

runner のビルドには TS ソースを公開する共通パッケージも含めます。ビルド後に Node.js で実行し、テスト専用 API への登録・heartbeat・空のジョブ取得まで確認します。このテストは外部 CLI を探索せず、実 API や実ジョブを使用しません。

`pnpm storybook` で <http://localhost:6006> に共通 UI と画面状態のカタログを起動します。ライト・ダーク、空の状態、取得失敗も実データなしで確認できます。

### 環境変数

APP_ENV は `local` / `development` / `production` を使い、Zod で検証します。API は Wrangler の vars、Web は `VITE_APP_ENV`、runner は起動時の環境変数で指定します。`pnpm dev:runner` は local を明示指定します。本番用の `pnpm --filter @life-console/runner start` は APP_ENV、接続先、専用 token の設定が必要です。

環境名の未指定を local とみなす処理はありません。local 以外では API の runner token が未設定なら認証を拒否します。R2 直接 upload を選んだ場合だけ S3 の資格情報も要求します。環境変数を追加する際は各アプリの検証境界に定義し、利用箇所で直接読み直さないでください。

## Cloudflare へ配置する場合

1. 配置先アカウントを `pnpm --filter @life-console/api exec wrangler whoami` で確認し、専用の D1 と非公開 R2 bucket を作成します。
2. [production 設定例](apps/api/wrangler.production.jsonc.example)を `apps/api/wrangler.production.jsonc` にコピーし、`account_id` を追加して、D1 ID と bucket 名を private な値へ変更します。初回は `workers_dev: false`、`preview_urls: false`、`routes: []` のままにします。
3. remote D1 に既存 migration を適用し、公開 URL がない状態で Worker と静的ファイルを deploy します。
4. Cloudflare One の Access アプリケーションで、その Worker の本番 URL とプレビュー URL を保護します。単一の Allow ポリシーに本人のメールアドレスを完全一致で指定します。他の Worker は対象に含めず、Bypass は追加しません。
5. 保存済みの対象 Worker とメール条件を確認してから、private 設定の `workers_dev` だけを `true` にして再 deploy します。未ログインの画面・API リクエストが Access に転送されることと、本人のログイン後の画面表示を確認します。

```bash
pnpm --filter @life-console/api exec wrangler d1 migrations apply life-console --remote --config wrangler.production.jsonc
pnpm --filter @life-console/api deploy
```

写真は `PHOTO_UPLOAD_MODE=worker` で同一 origin の API から非公開 R2 bucket に保存します。この方式では R2 S3 API の secret と bucket の CORS 設定は不要です。Access は静的ファイルと `/api/*` を含む Worker 全体に適用します。

初回配置では本番 DB を空のままにし、ローカルの会話・下書き・体重データ、runner の接続先は変更しません。Cron は 5 分間隔ですが、本番 DB に同期 schedule がなく、runner も未接続なら外部サービスの取り込みは動きません。

runner を本番へ接続するときは、別途 `RUNNER_TOKEN` と Access の機械認証を設定します。本人メールのみの Allow ポリシーでは runner の HTTP リクエストも拒否されます。job report の capability は Access を通過する資格情報ではないため、runner だけでなく job report の送信経路も含めて認証を設計・検証してから接続します。現時点の配置では認証を迂回する例外を設けません。

実データ用 D1 に `packages/db/seed.sql` は適用しません。runner の LaunchAgent は [plist 例](apps/runner/launchd/com.life-console.runner.plist.example)を private な場所へコピーして使います。例は `APP_ENV=local` でローカル API に接続します。本番向けには `APP_ENV=production` と接続先を設定し、専用 token と Access の資格情報を渡してください。secret は plist に書かず、本人の user session から local secret store を介して渡します。

Workers、D1、R2 の使用量は Cloudflare dashboard で実測します。account token をアプリへ渡していないため、Life Console 内には未取得値やゼロ固定値を表示しません。

### GitHub Actions からの更新

[Deploy production](.github/workflows/deploy.yml) は `develop` への push、または Actions 画面の『Run workflow』で実行します。Markdown、`docs/`、`.agents/`、`.claude/` だけの変更では自動実行を省略します。手動実行でも `develop` を選択してください。他のブランチではデプロイ job を実行しません。

この workflow は、上記の初回配置と Cloudflare Access の保護設定を済ませた本番 Worker の更新用です。production 設定例から設定を生成し、`workers_dev: true`、`preview_urls: false`、`routes: []` で既存の Worker を更新します。配置設定を変える場合は、設定例と workflow も更新してください。

GitHub リポジトリの Settings → Environments で `production` を作成します。『Deployment branches and tags』を『Selected branches and tags』にし、種類を Branch、名前を `develop` としたルールだけを登録してください。workflow の条件に加えて、Environment 側でも他のブランチやタグからのデプロイと Secrets の利用を制限します。

次の Environment secrets を登録します。

| Secret | 値 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 配置先アカウントに限定したデプロイ用 API token |
| `CLOUDFLARE_ACCOUNT_ID` | private 設定の `account_id` |
| `CLOUDFLARE_D1_DATABASE_ID` | private 設定の `d1_databases[0].database_id` |
| `CLOUDFLARE_R2_BUCKET_NAME` | private 設定の `r2_buckets[0].bucket_name` |

API token は [Cloudflare の GitHub Actions 手順](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)の『Edit Cloudflare Workers』を基に、D1 の migration 適用に必要な `Account / D1 / Edit` 権限も付けます。`Account / Workers R2 Storage / Edit` 権限も含めてください。権限名は [API token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)を参照してください。対話ログイン用の OAuth token は使いません。API token は次のコマンドでも入力できます。

```bash
gh secret set CLOUDFLARE_API_TOKEN --env production
```

Node.js 24 と `package.json` 指定の pnpm を使い、lockfile に従ってインストールします。`pnpm check` と本番設定の dry-run が成功した後、remote D1 に未適用の migration を適用し、ビルド済みの Web と API をまとめて deploy します。Mac の runner の更新と本番 seed の投入は含みません。

同時に実行できる本番デプロイは 1 件です。後続の push が来ても実行中の migration と deploy は自動キャンセルしません。migration 成功後に deploy が失敗した場合、適用済みの migration は残るため、変更は稼働中の Worker と互換性を保ってください。

## データ保護

`.dev.vars`、`.env`、`.env.local`、production Wrangler 設定、`private/`、`backups/` は Git 対象外です。リポジトリの seed、CSV 例、設定例には実データやローカル絶対パスを入れないでください。agent transcript、terminal 出力、connector 資格情報は Mac の外へ送らない設計です。
