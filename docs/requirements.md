# Life Console 要件定義

更新日: 2026-09-01

状態: Grok、Claude Code / Fable の設計レビューと技術選定を反映済み

## 1. 目的

仕事、お金、体重、食事、agent の実行状況を一か所で管理する、自分専用のダッシュボードを作る。情報を見るだけではなく、その場で記録、整理、タスク化、agent の起動まで進められることを目指す。

### 1.1 仕事

- 自分が対応すべき仕事のタスクを一覧で管理する。
- Slack、Chatwork、Talknote のメンションと必要な会話を定期取得する。
- 取得した会話をタスク候補、参考情報、対応不要に整理し、必要なものだけ記録する。
- 取得にはローカルの `sl`、`cw` などを使えるようにする。local agent や CLI が止まった場合は、ダッシュボードからエラーと最終成功時刻を確認できるようにする。
- タスクは原則としてダッシュボード内で完結させる。
- コード作業として追跡する必要があるものだけ、対象リポジトリの GitHub Issue や非公開の [GitHub Project 4](https://github.com/users/kokoichi206/projects/4/views/1?query=sort%3Aupdated-desc+is%3Aopen) へ昇格する。
- 会話、タスク、ローカルリポジトリを紐付け、Codex または Claude Code へ作業を渡せるようにする。

### 1.2 お金

- 収入と支出を管理し、期間、カテゴリ、支払手段ごとに分析する。
- 口座残高、金融資産、負債を記録し、純資産と資産配分の推移をグラフで確認する。
- 現在、必要なときに個別に確認している収支分析と資産確認を、ダッシュボード上で継続的に行えるようにする。
- 自動取得できないデータは、手入力またはファイル取込で補う。

### 1.3 体重と食事

- 体重の実測値と 7 日移動平均を管理し、推移をグラフで確認する。
- 食事は写真とメモを中心に記録する。入力時にカロリーや栄養素を手で埋める必要はない。
- coding agent が写真とメモを定期解析し、推定カロリーと栄養素を後から追記する。
- 記録した事実と agent の推定結果は分けて保存する。

### 1.4 ダッシュボードとモバイル

- デスクトップのダッシュボードでは、仕事の整理、agent と runner の監視、金融と健康の分析を行う。
- モバイルでは、食事、体重、支出、メモを短時間で記録し、最低限の状態を確認する。
- 最初から Android native を作らず、レスポンシブ Web から始める。必要になった PWA 機能だけを段階的に追加する。

### 1.5 公開方針

- コードは、実装内容を外部へ示せるように public repository で公開する。
- 実データ、認証情報、ローカル設定は公開しない。
- DB を使うこと自体は公開の妨げにならない。公開コードと非公開データを設計上分離する。
- 当面は本人だけが使う。SaaS 提供、他人向けアカウント、ロール管理は扱わない。

## 2. 基本方針

- 利用者は本人 1 人とする。
- ダッシュボードをタスク管理の source of truth とする。
- GitHub への昇格は一方向のコピーと逆リンクにする。GitHub 側の状態は読み取り専用でミラーし、双方向同期は行わない。
- 同期はリアルタイムでなくてよい。無料枠、安定性、外部サービスへの負荷を優先する。
- 手入力と写真の保存は local runner を経由させない。Mac が停止していても記録を続けられる構成にする。
- Slack、Chatwork、Talknote などの資格情報は Mac から外へ出さない。
- 外部 API、CLI、ユーザー入力はシステム境界で検証する。内部コードでは不要な fallback やバリデーションを重ねない。
- agent の session、terminal、worktree は自動削除しない。
- job のスケジュールと状態は D1 を正とする。Orca Automations を第二のスケジューラにはしない。

## 3. Source of truth

| 対象 | Source of truth |
|---|---|
| タスク | Life Console の D1 |
| schedule / job 状態 | Life Console の D1 |
| 食事の入力事実 | D1 と R2 |
| 食事の栄養推定 | D1 の派生レコード |
| 体重の実測値 | DB にある日は D1、DB にない過去分は既存 CSV（Obsidian 同期） |
| 金融取引と残高 | 取込元の明細、手入力、補正レコード |
| agent session / worktree / 詳細ログ | ローカルの Orca と各 agent |
| チャンネル・ルームとリポジトリの対応 | D1 または非公開のローカル設定 |

体重 CSV の実体は別リポジトリにある。公開コードには絶対パスを書かず、runner の非公開設定から解決する。

## 4. 採用技術

### 4.1 全体構成

`pnpm workspace` の monorepo とし、Web、API、runner、共有 schema を分ける。

```text
life-console/
├── apps/
│   ├── web/        Vite + React の SPA
│   ├── api/        Hono + Cloudflare Workers
│   └── runner/     TypeScript + launchd
└── packages/
    ├── contracts/  Zod schema と共有型
    └── database/   Drizzle schema と migration
```

| 領域 | 採用技術 |
|---|---|
| 言語 | TypeScript strict mode |
| パッケージ管理 | pnpm workspace |
| Web build | Vite |
| UI | React |
| Routing | TanStack Router |
| Server state | TanStack Query |
| API | Hono |
| Web 向け型付き API client | Hono RPC |
| 境界 schema | Zod |
| ORM / migration | Drizzle ORM / Drizzle Kit |
| Hosting | Cloudflare Workers Static Assets |
| API runtime | Cloudflare Workers |
| DB | Cloudflare D1 |
| 写真 | Cloudflare R2 |
| 本人認証 | Cloudflare Access |
| Local executor | TypeScript 製 runner + launchd |
| Agent adapter | Orca CLI |

TanStack Start は採用しない。現時点で SSR と server functions は不要であり、Workers Free の CPU 上限を考えて SPA と薄い API に分ける。

### 4.2 Web と API の接続

TanStack Router と Hono を直接結合しない。それぞれの責務は次の通り。

- TanStack Router: 画面 URL、検索条件、loader、画面遷移
- TanStack Query: API データの取得、キャッシュ、mutation
- Hono RPC: Hono API の入力型とレスポンス型を TypeScript client へ共有
- Hono: `/api/v1` 以下の HTTP/JSON API

`apps/api` が Hono app の型を export し、`apps/web` は `hc<AppType>()` から型付き client を作る。TanStack Query の query function と mutation function から Hono client を呼び、TanStack Router の loader では Query の `ensureQueryData` を使う。

Hono RPC は tRPC に近い開発体験を提供するが、通信は通常の HTTP/JSON とする。runner、curl、将来の Android client からも同じ API を利用できる。

Android native を追加する場合、TypeScript の Hono RPC 型は直接使えない。`packages/contracts` の schema から OpenAPI を生成し、Kotlin client を作る。MVP では OpenAPI 生成まで実装しない。

### 4.3 Cloudflare 上の配信

- Web は Workers Static Assets から SPA として配信する。
- SPA の static assets と Hono Worker は一つの Cloudflare deployment として配信する。
- static asset に一致しない画面 URL は `index.html` へ戻す。
- Worker を先に実行するのは `/api/*` だけとする。
- API は `/api/v1` から始める。
- SSR は行わない。
- チャット解析、画像解析、ローカル CLI、coding agent などの重い処理は Mac の runner で実行する。

## 5. 公開範囲とデータ保護

### 5.1 公開するもの

- Web、API、runner のアプリケーションコード
- D1 schema と migration
- connector interface と runner protocol
- Hono API の契約
- ダミーデータ生成処理
- ローカル開発とデプロイの手順

### 5.2 公開しないもの

- Slack、Chatwork、Talknote の本文、ID、token、Cookie
- タスク本文と元会話
- 金融取引、口座、残高、資産、負債
- 体重、食事写真、食事メモ、栄養推定
- チャンネル・ルームとリポジトリの対応表
- `japagate-dev` などの既定リポジトリ設定
- ローカルリポジトリの絶対パス
- agent の session log、環境変数、認証情報
- Cloudflare の account ID、database ID など実環境固有の設定

公開用データは、実データをマスクして作らない。最初から架空の値で生成する。README、Issue、PR、CI log、公開 artifact に実データを含むスクリーンショットを置かない。

## 6. 機能要件

### 6.1 ホーム

- 今日対応するタスクを表示する。
- 未処理のメンションとタスク候補を表示する。
- runner、Orca、connector の異常を表示する。
- 収支、純資産、体重の直近推移を表示する。
- 食事、体重、支出、メモをすぐ追加できる導線を置く。

### 6.2 仕事とタスク

- Slack、Chatwork、Talknote から、メンションと必要な会話を定期取得する。
- Slack は `sl`、Chatwork は `cw sync` を runner から実行する。Chatwork は既存 CLI の重複排除と取得漏れ検出を利用する。
- 取得した内容をタスク候補、参考情報、対応不要に分類する。
- タスクの作成、編集、期限設定、状態変更、完了ができる。
- 元会話への参照を保持する。
- タスクを GitHub Issue または非公開の GitHub Project 4 へ昇格できる。
- GitHub Project 4 への書き込みは専用 skill から行う。既存の read-only skill だけでは足りないため、昇格用 skill を別途作る。
- GitHub へ昇格したタスクにも、ダッシュボード側の ID と逆リンクを保持する。

2026-09-06 追加: Gmail は `gog`、Talknote は `tn` を使って取り込む。資格情報は引き続き本人の Mac で保持する。

- 取得した連絡から返信下書きを生成し、仕事から開ける一覧に表示する。アプリ内で編集・保存・コピーできるようにする。
- 既に本人が返信した連絡には下書きを出さない。受信だけでなく本人の送信履歴・返信先・内容を照合し、別件の発言を返信済みの根拠にしない。
- 未回答の質問や本人の判断が必要な点を、返信本文とは別に残す。不明な日程・事実・同意を補わない。
- 下書きの生成を送信の許可と解釈しない。外部サービスへの送信や Gmail の下書き作成は、この追加要件の対象外。
- 手動編集した本文を再生成で失わない。再確認で返信済みになったものは通常の一覧から外す。

現在の実装・取得範囲・認証手順は README の「返信下書き」を参照する。Talknote の実データ検証は本人セッションの再認証待ち。

2026-09-06 更新: 機能追加のたびにサイドバーを増やさず、仕事の流れに沿って画面をまとめる。

- 主要なナビゲーションは『ホーム・仕事・健康・お金』。『同期・実行状況』は補助導線に置く。
- 『仕事』に受信箱とタスクを置く。会話詳細で本文、返信下書き、タスク化、関連タスク、実行経過を扱う。返信下書きは独立したナビゲーション項目にしない。
- サービス・期間・対応状況による絞り込みを受信箱内に置く。切り替えでサイドバーと仕事の見出しを再マウントせず、編集中の下書きを保持する。
- 一覧・詳細を扱う画面は表示領域の高さに収め、見出し・タブ・フィルターをスクロール領域の外に置く。『仕事』では受信箱／タスクの切り替えとサービス・期間・対応状況を上部に固定し、会話一覧・詳細・タスクのコンテンツ領域だけをスクロールさせる。同期履歴の展開でも上部の操作欄を動かさない。
- スクロール領域の高さは親の残り領域で決める。ヘッダーの高さを推測した固定値で計算せず、スクロールバーの出入りによる横幅の変化と、末端でのページ全体へのスクロール連鎖を防ぐ。
- gog CLI の空き時間を使った日程候補の返信案を作成できる。本人が指定した期間・時間帯・所要時間と、相手が提示した条件を照合する。
- 現在の対象は Gmail と同じアカウントのメインカレンダー。平日の日本時間を扱い、他カレンダー・祝日・移動時間・相手の予定は未確認と明示する。取得失敗を空きとみなさない。
- 予定の件名・参加者はモデルに渡さない。確認範囲と取得日時を記録し、候補提案と参加確約を区別する。予定の予約・作成・招待承諾はこの要件に含めない。

### 6.3 会話ソースとリポジトリ

- Slack workspace / channel、Chatwork account / room とローカルリポジトリを紐付ける。
- リポジトリは monorepo とは限らない。一つのタスクから複数リポジトリを参照できるデータモデルにする。
- agent 起動時に作業リポジトリが未確定なら、modal または selector を表示する。
- 選択は今回だけ、channel / room 単位、workspace / account 単位で記憶できる。
- 対応先がない場合の初期候補は `japagate-dev` とする。ただし公開コードにはハードコードせず、非公開設定から読み込む。
- Japagate 関連では `japagate-dev` を `always_read` の context として設定できる。

リポジトリには次の役割を持たせる。

| 役割 | 意味 |
|---|---|
| `work` | agent が変更するリポジトリ |
| `context` | 読み取り専用の参考リポジトリ |
| `default_work` | 選択がない場合の作業候補 |
| `always_read` | 関連タスクで毎回読むリポジトリ |

MVP の UI は、一つのタスクに一つの `work` リポジトリを選ぶところまでとする。複数リポジトリと各役割はデータモデルに残し、実際の利用例が出てから UI を追加する。

### 6.4 Agent 実行

- タスクごとに Codex または Claude Code を選んで起動できる。
- 調査や一般的な作業は、既存の main checkout で実行できる。
- 実装は新しい worktree で実行できる。
- 起動した session、terminal、worktree を残し、後から再開できる。
- 同じ worktree で agent を切り替える場合、新しい terminal と session を作る。以前の session は閉じない。
- 一つのタスクが複数リポジトリにまたがる場合、変更対象ごとに job を分ける。context リポジトリは読み取り専用とする。
- Orca CLI を agent、terminal、worktree の adapter として使う。
- Orca CLI を呼ぶ skill を agent に渡し、Orca 管理下の session や worktree を操作できるようにする。
- 初期実装では高度な provider 切り替え UI を作らない。job に provider を保存し、Codex と Claude Code を選べればよい。
- agent の idle やプロセス終了だけで完了扱いにしない。
- job ごとの短命な capability とローカル報告コマンドを agent に渡し、明示的な成功または失敗を runner へ返す。
- Orca の `worker_done` は adapter 内部の情報として利用できるが、D1 の job 状態を直接更新する source of truth にはしない。
- agent の詳細ログはローカルに残す。クラウドへ送るのは状態、時刻、個人情報を含まない要約、エラーコードだけとする。

Orca を経由しない暗黙的な fallback は設けない。Orca が使えない場合は専用エラーとして表示し、別 adapter を追加するかは実測後に決める。

### 6.5 お金

- 収入と支出を記録または取り込む。
- 期間、カテゴリ、支払手段ごとに集計する。
- 口座残高、金融資産、負債を記録する。
- 純資産と資産配分の推移を表示する。
- 自動取得できない項目は手入力またはファイル取込に対応する。
- 取込元の値は上書きせず、補正を別レコードとして保持する。
- 手動補正の履歴を確認できるようにする。
- 金融データの具体的な最初の取込元は、実装開始前に現在の管理方法を確認して決める。

### 6.6 体重

- 実測値と 7 日移動平均を表示する。
- Obsidian 同期では、DB にある日は D1、DB にない過去分は既存 CSV を正とする。
- CSV の手動取込に対応する。
- runner から自動取込できるようにする。
- 手入力にも対応する。
- 体重には `occurred_at` と `recorded_at` を持たせる。
- Obsidian への同期では、runner が D1 の記録を既存の weight-trend.csv に日付でマージする。D1 にない過去分は削除せず、アーカイブを含めたグラフ用データを再生成する。日本時間で最後の測定を日別の代表値とし、同日の CSV と D1 の値が異なれば D1 を採用する。実行頻度と相対ディレクトリは DB、vault の実パスは Mac の非公開設定に置く。候補と制約は [同期仕様](weight-obsidian-export.md) を参照。

Simple アプリは Health Connect へ体重を出力しない。現在の同期処理には Pixel の USB 接続、USB debugging、画面点灯、ロック解除が必要なため、固定の日次 job にはしない。手動または端末条件が揃ったときの日和見実行とし、条件不足は `skipped_precondition` として記録する。

### 6.7 食事

- 写真、メモ、発生日時、記録日時、食事区分、任意の tag を記録する。
- 写真とメモだけで登録を完了できる。
- 端末に保存済みの写真を選ぶ操作と、カメラで撮影する操作を分ける。選択した写真を確認し、選び直し・取り消しができる。
- 食事記録は写真を並べた一覧で見返し、写真・日時・メモの詳細を開ける。
- 写真は client 側で縮小し、EXIF を除去する。
- 短命な署名付き URL を使い、R2 へ直接アップロードする。
- 入力した事実と agent の推定結果を別レコードにする。
- coding agent が定期的に写真とメモを解析し、推定カロリーと栄養素を追記する。
- 推定結果には使用 model、解析日時、入力 hash を持たせる。
- 同じ入力 hash を再解析した場合も履歴を残す。
- 推定値を医療用途の正確な値として扱わない。

### 6.8 モバイル

最初はレスポンシブ Web だけを作る。写真入力は保存済み写真の選択用の `<input type="file" accept="image/*">` と、カメラ撮影用の `capture="environment"` を付けた入力を使い分け、実際の記録時間と操作数を測る。

必要になった順に次を追加する。

1. Web App Manifest と install 対応
2. 食事、体重、支出への home screen shortcut
3. Web Push
4. Web Share Target
5. IndexedDB を使った offline outbox

モバイルでは、食事、体重、支出、メモの入力と最小限の確認だけを扱う。会話分類、リポジトリ設定、agent 起動、金融の突合はデスクトップ画面で行う。

次のいずれかが実際に問題になった場合、Android native の薄い記録 client を追加する。

- PWA の撮影または共有導線が原因で、週単位の記録漏れが起きる。
- offline outbox で再現可能な欠損が起きる。
- home screen widget が shortcut では代替できない。
- 体重などの source of truth を Health Connect に移す。
- Cloudflare Access の再ログインが日常利用を妨げる。

## 7. 定期実行基盤

### 7.1 責務

| コンポーネント | 責務 |
|---|---|
| D1 | schedule、job、runner、connector cursor の状態管理 |
| Cloudflare Cron Trigger | `next_run_at` を過ぎた schedule から job を作る |
| `life-console-runner` | 外向き poll、claim、CLI と importer の実行、heartbeat、結果報告 |
| Orca CLI | agent、terminal、worktree の操作 |
| Orca Automations | ダッシュボード外で既に動いている独立 automation |

Cloudflare Cron Trigger は一つだけ使う。schedule ごとに Cron Trigger を増やさない。runner に外部から接続する port は開けず、Mac から Cloudflare への outbound 通信だけを使う。

Orca Automations で既に動いている job はそのまま残す。D1 に job を作る処理は runner が実行し、同じ処理を Orca Automations と二重管理しない。

### 7.2 Schedule

- schedule は `next_run_at` と timezone を持つ。
- 処理別の入力は `payload_json` に保存し、job 作成時にコピーする。実際の個人設定はリポジトリに含めない。
- JST の実行時刻を UTC に変換して保存する。
- Cron は `next_run_at <= now` の schedule を job 化する。
- Cron が失敗した場合、次回の成功時に未処理分を catch-up する。
- job 生成には `schedule_id` と実行対象期間から作る一意な idempotency key を使う。
- schedule ごとに `skip_if_pending` または `queue_all` を決める。
- 古くなった job には `deadline_at` を設定し、実行せず `expired` にできる。
- MVP の schedule は hourly、daily、weekly などの interval で表現する。任意の cron expression editor は作らない。

### 7.3 Job 状態

job は次の状態を持つ。

| 状態 | 意味 |
|---|---|
| `queued` | 実行待ち |
| `claimed` | runner が lease を取得し、プロセス起動前 |
| `running` | 実行中 |
| `waiting_for_user` | agent がユーザー入力を待っている |
| `succeeded` | 明示的に成功した |
| `failed` | 明示的に失敗した |
| `canceled` | ユーザーが中止した |
| `lost` | lease が切れ、実行主体を確認できない |
| `expired` | deadline を過ぎ、実行しなかった |
| `skipped_precondition` | 端末接続などの実行条件が揃わず、異常として扱わずに見送った |

### 7.4 Claim、lease、重複防止

- claim は `queued` を条件にした一つの更新で行う。
- lease には世代を表す fencing token を持たせる。
- heartbeat、進捗、完了報告は現在の fencing token と一致する場合だけ受け付ける。
- runner の heartbeat と job の heartbeat を分ける。
- runner の heartbeat と CLI の接続確認は job の完了を待たず 2 分ごとに実行し、正常を含む全観測を保存する。通信断中は Mac に保持し、後送によって最新状態や lease を更新しない。
- runner の 5 分未着、明確な認証失効、CLI の連続失敗を Web Push で通知する。障害と端末ごとの重複予約を DB で防ぎ、未復旧は 30 分ごと、復旧は異常通知の受付を確認できた端末に通知する。
- job の heartbeat は実行ループと独立して送る。
- `waiting_for_user` 中も heartbeat を継続する。
- lease は Cloudflare 側の時刻で判定し、Mac の時計を信用しない。
- `lost` になった batch job は種別ごとの方針で再実行できる。
- 外部への返信送信は結果不明時に `lost` とし、自動再送しない。元のサービスの投稿を確認してから本人が次の操作を判断する。
- interactive agent job は自動再起動しない。session と worktree を残し、ユーザーが判断する。
- heartbeat は続いているが進捗が止まった job は、状態を自動変更せず停滞として通知する。

冪等性は次の三層で持つ。

1. schedule からの job 生成
2. Slack message、金融取引、体重行など外部データの取込
3. runner の job claim

connector ごとに watermark を保存し、前回の成功位置から再開する。Mac の停止後も「直近 1 時間」ではなく watermark から取得する。

### 7.5 Cancel と完了報告

- cancel 要求は job heartbeat の応答で runner に返す。
- cancel は実行の追跡と子プロセスを止めるが、agent session と worktree は削除しない。
- batch job は終了 code と構造化 JSON で完了を判断する。
- interactive agent job は、短命な capability を使った明示的な報告で完了する。
- 報告がないまま idle になった場合、成功とは判定しない。
- Orca が到達不能な場合は、runner の異常とは分けて表示する。

### 7.6 初期の実行間隔

| 対象 | 初期値 |
|---|---|
| runner の job poll | 1〜5 分。実測後に固定 |
| Slack / Chatwork | 1 時間ごと |
| GitHub | 1 時間ごと |
| 体重 | 手動または日和見実行 |
| 食事の登録 | 即時 |
| 食事の栄養解析 | 1 日ごと |
| 金融取引 | 1 日ごと |
| 資産残高 | 1 週間ごと、または手動 |
| ローカルリポジトリ一覧 | 1 日ごと |

## 8. 認証、秘密情報、ログ

- 人間のアクセスは Cloudflare Access で本人だけに許可する。
- アプリ内の user table と role は作らない。
- runner は Cloudflare Access の Service Auth 用資格情報を使う。
- runner token の有効期限を health として表示する。
- Slack、Chatwork、Talknote の資格情報は Mac の local secret store に保存する。
- launchd は本人の user session で動く LaunchAgent とする。
- connector の資格情報を Cloudflare Secrets、D1、公開設定へ保存しない。
- Worker log には ID、状態、時刻以外の本文を出さない。
- runner がクラウドへ送るエラー概要には redaction と長さ制限を適用する。
- agent の transcript と terminal 出力はローカルにのみ保持する。

Cloudflare Access の session が切れた場合、PWA の API request が JSON ではなく login redirect を返す可能性がある。client は redirect と content type を確認し、未送信記録を成功扱いせず再ログインを促す。

## 9. バックアップ

- D1 と R2 は Mac 側から非公開領域へ定期バックアップする。
- D1 Free の Time Travel だけをバックアップとして扱わない。
- バックアップにチャット本文や金融情報が含まれるため、public repository には置かない。
- backup job の成功時刻と失敗をダッシュボードに表示する。

## 10. 非機能要件

- 無料枠内での運用を目標とする。
- Workers、D1、R2 の使用量を測定し、無料枠に対する割合を確認できるようにする。
- Workers Free の CPU 上限を前提に、Worker では重い計算を行わない。
- runner が停止していても、記録済みデータの閲覧と手入力を続けられる。
- 同期処理は再実行でき、同じ入力を二重登録しない。
- connector ごとに最終成功時刻、watermark、次回実行時刻、直近のエラーを確認できる。
- 個人データを Git、CI log、Worker log、公開 artifact に残さない。
- D1 schema から削除・訂正・派生レコードの追跡ができるようにする。
- 派生レコードは元データと生成元 job を参照できるようにする。
- 食事、体重、支出には、出来事の時刻 `occurred_at` と記録時刻 `recorded_at` を持たせる。

## 11. MVP の実装順

1. monorepo、Vite、React、TanStack Router、TanStack Query、Hono、Hono RPC、Zod、Drizzle の土台
2. Workers Static Assets、Cloudflare Access、D1、`/api/v1`
3. タスクの手入力と一覧
4. モバイル Web からの食事写真・メモ、体重手入力
5. 体重 CSV の手動取込とグラフ
6. local runner の登録、claim、fencing、heartbeat、job 状態表示
7. Slack と Chatwork の取込と分類
8. 会話ソースと一つの作業リポジトリの選択・記憶
9. Orca 経由の agent 起動、明示的完了、`waiting_for_user`、状態監視
10. GitHub Issue / Project 4 への一方向の任意昇格
11. 収支、残高、純資産の取込とグラフ

PWA の追加機能、栄養推定の自動化、複数リポジトリ UI、高度な provider 切り替え、Android native は MVP 後に実装する。Talknote と返信下書きは 2026-09-06 の追加要件として実装対象に含める。

## 12. 実装中に実測して決めること

設計を変えず、数値だけ実測して決める項目は次の通り。

- runner の poll 間隔
- lease の長さと heartbeat 間隔
- schedule ごとの coalescing と deadline
- Slack / Chatwork の 1 時間間隔が実用上十分か
- Pixel 上の写真登録時間と操作数
- Web Share Target の Pixel / Chrome / Google Photos での動作
- offline outbox の欠損率
- Cloudflare Access の再ログイン頻度
- Workers の CPU time と request 数
- D1 の read / write 数
- R2 の写真容量
- Mac の稼働率とスリープ頻度
- launchd から local secret store と Orca CLI を安定して利用できるか
- 金融データの最初の取込元とファイル形式
- Talknote の認証維持と取得上限（`tn` の本人ブラウザセッションを使用）

## 13. MVP の対象外

- 他人向けアカウント
- role と権限管理
- SaaS 提供
- Android native client
- iOS native client
- SSR
- 任意 cron expression の editor
- Cloudflare Queues、Workflows、Durable Objects を使った汎用 workflow engine
- GitHub との双方向同期
- agent session と worktree の自動削除
- Orca 以外への暗黙的 fallback

## 14. 設計レビュー

- [Grok の設計レビュー](reviews/grok-design-review-2026-09-01.md)
- [Claude Code / Fable の設計レビュー要約](reviews/claude-code-fable-summary-2026-09-01.md)
