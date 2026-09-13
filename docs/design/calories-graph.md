# 日別カロリー収支グラフの設計

作成日: 2026-09-13。状態: 設計確定（未実装）。

決定済み:

- レイアウト: 1 日 1 行の横棒リスト（HTML の `<table>`）。案 1「ゼロ中央の収支棒」（2.1 節）。期間の累計は入れない（後から足せる拡張として 2.3 節に残す）。
- 判定基準: `基準消費量 + 運動消費 − 摂取` の収支。±0 が基準。
- 運動消費: Strava の実測値（DetailedActivity の `calories`）を活動ごとに D1 へ永続保存し、runner のジョブで非同期に取得する（1.3〜1.7 節）。Strava API Policy に反する選択であることをユーザーが承知の上で決定した。

未確定: Strava が `calories` を持たない活動の応答形式（1.6 節。実装時に実データで確認する）。表示は実物を見た後に 2.4 節の改訂で確定した。

本書は実装担当への指示書を兼ねる。確定事実はファイル位置を添え、推測と未確定は明示する。レビュー観点と動作確認手順は [calories-graph-verification.md](calories-graph-verification.md)。実装が本書と食い違った場合は実コードを優先し、差分を報告する。

## 0. 前提と確認済みの事実

| 項目 | 確認結果 | 根拠 |
| --- | --- | --- |
| 食事ごとのカロリー | `MealNutrition` に `manualCaloriesKcal`（手入力）と `estimate.caloriesKcal`（推定）がある。手入力を優先する | `packages/contracts/src/nutrition.ts`、`apps/web/src/pages/health/nutrition-summary.ts` |
| 日別集計 | `summarizeDailyNutrition` が日本時間の日付で `{ date, caloriesKcal, recordedMeals, totalMeals }` を新しい順に返す。カロリー未確定の食事は合計に入れず `recordedMeals < totalMeals` で分かる。食事のない日は配列に現れない | 同上 |
| 食事一覧の期間指定 | API は `+09:00` の暦日境界で絞る。Web 側で `MealNutrition.occurredAt` を日本時間の日付で絞れば同じ結果になる | `apps/api/src/repositories/d1-life-console-repository.ts` の `listMeals`、`tests/meal-period-storage.test.ts` |
| 栄養情報の取得 | `GET /api/v1/nutrition` は期間指定を受け取らず、削除されていない全食事を `occurredAt` 降順で件数制限なく返す。Web の `nutritionQuery` はこれを 5 秒ごとに再取得する（解析中の反映のため） | `apps/api/src/repositories/nutrition-repository.ts` の `list()`、`apps/web/src/pages/health/queries.ts` |
| 未記録の扱い | 「日本時間の日別合計を表示する。カロリー未記録の件数を明示し、値がない食事を 0 kcal と扱わない」が記録済みの要件 | `docs/requirements.md` 6.7 |
| Strava の取得内容 | 一覧 API から `id`, `name`, `sportType`, `occurredAt`, `distanceMeters`, `movingSeconds`, `elapsedSeconds`, `averageHeartrate`。接続済みなら「走行距離を重ねる」の有無に関係なく表示期間の全ページを Web が順に取得する。一覧の Query は `gcTime: 0` で自動再取得しない | `packages/contracts/src/strava.ts`、`apps/web/src/pages/health/use-strava-activities.ts` |
| Strava の calories | 一覧 API の SummaryActivity に `calories` はない。`GET /activities/{id}` の DetailedActivity にのみ定義される | [API リファレンス](https://developers.strava.com/docs/reference/) の `DetailedActivity` |
| Strava のレート制限 | 読み取りは 15 分あたり 100 リクエスト、1 日 1,000 リクエスト | [Rate Limits](https://developers.strava.com/docs/rate-limits/) |
| Strava API Policy | 保持は 7 日以内の一時キャッシュに限る（6.2）。Persistent Index への保存禁止（5.5）。削除は 48 時間以内に反映（6.3）。原文は 1.3 節に引用 | [API Policy](https://www.strava.com/legal/api_policy)（2026-09-13 に原文を取得） |
| Strava の認証情報の所在 | API（Worker）が D1 の `strava_connection` に暗号化して保持し、lease で更新を直列化する。runner は持たない | `apps/api/src/usecases/strava-usecase.ts`、`docs/strava-integration.md` |
| 本プロジェクトの現行方針 | 運動データは D1・ファイル・ブラウザの永続ストレージへ保存しない。本設計で書き換える（1.3 節） | `docs/strava-integration.md` |
| 既存の 429 の扱い | `strava-api-repository.ts` の `send` は 429 を `upstream_error` の専用メッセージで `err` にする。`AppErrorCode` にレート制限専用の種別はない | `apps/api/src/repositories/strava-api-repository.ts`、`apps/api/src/shared/app-error.ts` |
| runner のジョブ機構 | `jobs` テーブル（`idempotencyKey` の unique 制約、`leaseToken` / `leaseExpiresAt` で排他、`attempt`）と `schedules`。`jobKinds` は `packages/domain/src/index.ts` の配列。runner は `job-executor-usecase.ts` の `execute(job, signal)` で種別ごとに処理し `JobExecution`（succeeded / failed / canceled / skipped_precondition と summary）を返す。heartbeat は実行ループと独立に送られ、中止は `signal` で届く。`nutrition_analysis` は runner が `/api/v1/runner/nutrition/*` を呼び、API 側が lease を検証して保存する | `packages/db/src/schema.ts`、`apps/runner/src/usecases/job-executor-usecase.ts`、`apps/api/src/repositories/nutrition-repository.ts` の `save` |
| Cron Trigger | 1 つだけ使い、`next_run_at` を過ぎた schedule から job を作る役割。job のスケジュールと状態は D1 を正とする | `docs/requirements.md` 7 章 |
| 体重 | `weights` テーブルに実測値がある。身長・年齢・性別は DB にない | `packages/db/src/schema.ts` |
| 基準値 | 体重の目標は `weight_goal`（単一行、`PUT /api/v1/weight-goal` に null 可）。1 日の基準消費量はどこにも保存されていない | 同上、`apps/api/src/app.ts` |
| URL の状態 | `HealthSearch` は `strava`, `entry`, `meal`, `range`, `running`, `from`, `to`。`from < to` が必須で、1 日だけの期間は URL で表現できない | `apps/web/src/pages/health/health-search.ts` |

## 1. 全体方針

### 1.1 このグラフが答える問い

「表示期間の各日について、基準消費量と運動消費の合計から摂取を引いた収支はプラス（貯金）かマイナス（超過）か、その額はいくらか」に答える。

ユーザーの例: 基準消費量 1,500 kcal、運動 500 kcal、摂取 1,900 kcal なら `1,500 + 500 − 1,900 = +100`、「+100 kcal 貯めれた」。

### 1.2 収支モデル

| 項 | 意味 | 出所 | 確度 |
| --- | --- | --- | --- |
| 基準消費量（baseline） | 基礎代謝と日常活動で 1 日に使う量の目安。本人が 1 つの数値として設定する | 本人の設定（1.8 節） | 本人の判断値。計算しない |
| 運動消費 | Strava の活動による消費。その日の活動の `calories` の合計 | Strava の DetailedActivity。D1 に保存（1.4 節） | 実測・取得待ち・算入外のいずれか。活動ごとに持ち、日ごとに表示する |
| 摂取 | その日の食事のカロリー合計 | 手入力または AI 推定（既存） | 未記録の食事があれば暫定 |
| 収支 | `基準消費量 + 運動消費 − 摂取` | 計算 | 上 3 項の確度に従う |

- 正の収支を「貯金」、負の収支を「超過」、0 を「±0」と表示する。
- 基準消費量は身長・年齢・性別からは計算しない。本人が決めた数値をそのまま使う。個人属性を DB に増やさない。
- 基準消費量は現在の 1 値だけを持ち、過去日も現在の値で計算する。履歴は持たない。
- 運動消費は実測値だけを使う。MET などによる概算は行わない（暗黙の代替値を作らない）。

摂取のデータ経路は既存の `nutritionQuery` をそのまま使い、日本時間の日付で表示期間に絞る（絞り込みには `weightCalendarDate` を使う。`summarizeDailyNutrition` の `Asia/Tokyo` と同じ結果になる）。期間は体重グラフの期間セレクター（`HealthPage` の `periodFrom` / `periodTo`）に連動させ、カロリー用の期間状態は増やさない。

期間の絞り込みをクライアント側で行う理由（却下した案: `GET /api/v1/nutrition` に期間パラメーターを足す）:

- `MealGallery` が同じ全件レスポンスを表示中の食事 ID で絞って日別表を作っており、グラフも同じデータから作れば表と数値がずれない。期間付きの query を別に持つと、5 秒ごとの再取得のタイミング差で表とグラフの値が食い違う瞬間ができる。
- 1 食あたりのデータは小さく、本人 1 人の記録量（1 日数件）では全件でも数千件に収まる。件数が問題になったら、新しいエンドポイントではなく既存の `GET /api/v1/nutrition` に `mealPeriodQuerySchema` と同じ任意の期間指定を足し、`MealGallery` と一緒に切り替える。

5 秒ごとの再取得への対処:

- `useQuery` の structural sharing により、応答内容が前回と同じなら `nutrition.data` の参照は変わらない（[Render Optimizations](https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations)）。日別の行は `useMemo` で `nutrition.data`、`periodFrom`、`periodTo`、運動の集計結果、基準消費量をキーに導出し、応答が変わったときだけ再計算する。
- 一覧は状態を持たない DOM なので、再描画されても見た目は変わらない。
- 再取得間隔は変えない。グラフ用に別の間隔の query を足すと、表とグラフで解析結果の反映時刻がずれる。

### 1.3 運動消費の取得方式（確定）と Strava API Policy との関係

決定: Strava の DetailedActivity の `calories` を活動ごとに取得し、D1 に永続保存する。取得は runner のジョブで非同期に行い、レート制限の範囲で順に進める（1.5 節）。

規約との関係を明記する。[Strava API Policy](https://www.strava.com/legal/api_policy)（2026-09-13 取得）の原文は次のとおり。

> Section 6.2 Cache and Retention: "You may not retain Strava Data in your cache for longer than seven (7) days. If your Developer Application checks for a resource (for example, a segment) and that resource is no longer available from Strava, you must remove it from your cache immediately, regardless of how frequently your cache is refreshed. Except for such limited caching, you may not store Strava Data, or provide or display Strava Data or any associated service, to any third party other than the Strava user using your Developer Application."

> Section 5.5: "You may not store Strava Data, or any data derived from Strava Data, in any Persistent Index. The foregoing prohibits indefinite storage in vector stores, embedding stores, search indexes, knowledge graphs, retrieval-augmented data stores, archives, and any other storage configured to enable subsequent retrieval, query, or use. The seven-day cache permitted under Section 6.2 is not a Persistent Index, provided that the cache is operated as a transient cache and is not used to enable any prohibited purpose under this Section 5.5."

> Section 6.3 Reflecting User Deletions: "Deletions must be reflected in your Developer Application expeditiously but in all cases within forty-eight (48) hours."

**Strava API Policy 6.2 は 7 日を超える Strava Data の保持を禁じ、5.5 は後から取り出せる形での保存を禁じている。本設計の永続保存はこれらに反する。6.3 の 48 時間以内の削除反映も、本設計の同期方式（1.7 節）では保証できない。本人専用・外部非公開のダッシュボードであり、保存する項目を活動 ID・開始日時・消費 kcal に限ることを前提に、ユーザーが 2026-09-13 に上記の原文を確認した上で永続保存を選択した。この判断はユーザーのものであり、本書は規約適合を主張しない。**

却下した案:

| 案 | 却下理由 |
| --- | --- |
| (i) 一覧の種目・距離・時間と体重から MET 法で概算（保存なし） | ユーザーが Strava の実測値を希望。Strava アプリの表示と一致しない |
| (ii) 直近 7 日だけ実測を 7 日間キャッシュし、それ以前は概算 | 規約の引用範囲には収まるが、同じ日の表示が 7 日を境に実測から概算へ変わる。ユーザーが実測の永続保存を選択 |

この決定に伴い書き換える既存ドキュメント（実際の書き換えは実装で行う）:

| ファイル | 箇所 | 変更内容 |
| --- | --- | --- |
| `docs/strava-integration.md` | 「取得と保存」の「運動データは D1・ファイル・ブラウザの永続ストレージへ保存しない。表示用の Query は…」 | 活動一覧はメモリ内のままとし、活動ごとの `calories` だけを `strava_activity_calories` に永続保存する旨と、規約 6.2 / 5.5 / 6.3 に反する選択である旨（上の太字の趣旨と日付）に書き換える |
| 同上 | 「`運動を更新` で再取得する。常駐 runner、webhook、過去全履歴の自動保存は今回の実装に含まない。」 | 「`運動を更新` と画面表示で一覧を再取得し、未取得の活動があれば `strava_calories_sync` ジョブを予約する。runner が順に取得する。webhook は使わない」に書き換える |
| 同上 | 「`接続を解除` は … 画面の運動データを消す。」 | 「保存済みの消費 kcal も全件削除する」を加える（1.7 節） |
| 同上 | 冒頭の機能説明と「設計判断と確認範囲」 | 収支グラフへの言及と、2026-09-13 の決定（永続保存の選択と規約との関係、確認した範囲）を追記する |
| `README.md` | 「健康と家計」の運動の行と食事の行 | 「活動ごとの消費カロリーを Strava から取得して保存し、基準消費量との収支を日別に表示する」を追記する |
| `docs/requirements.md` | 3 章の Source of truth 表 | 「Strava の活動ごとの消費 kcal: D1（Strava からの取得値）」の行を追加する |
| 同上 | 6.6 の Strava の項「初回実装は表示期間ごとの取得とし、保存・認可の仕様は…」 | 消費 kcal の永続保存と非同期取得、規約との関係を追記する |
| 同上 | 6.7 | 基準消費量の設定、収支の定義、未記録・取得待ち・算入外の扱いを 2026-09-13 付けで追記する |
| 同上 | 7.6 初期の実行間隔の表 | 「Strava の消費 kcal: 画面表示・運動の更新時に予約。runner がレート制限内で順次」を追加する |

### 1.4 保存する単位とスキーマ（活動ごと）

活動 1 件につき 1 行を `strava_activity_calories` に保存する。日別合計ではなく活動ごとにする理由: 削除の同期（1.7 節）と再取得の防止（活動 ID を主キーにする）は活動単位でしかできない。日本時間の日付への変換を保存時に固定せず、表示側で行える。行数は本人の活動数（年に数百件）なので問題にならない。

| 列 | 型 | 意味 |
| --- | --- | --- |
| `activity_id` | text PRIMARY KEY | Strava の活動 ID。同じ活動を 2 度取得しない |
| `occurred_at` | text NOT NULL | 活動の開始日時（一覧の `start_date`、UTC の ISO 文字列）。日別集計と期間の切り出しに使う |
| `status` | text NOT NULL | `pending`（取得待ち）/ `measured`（実測を保存済み）/ `unavailable`（Strava が値を持たない）。候補は `packages/domain` の `stravaCaloriesStatuses` を正本にする |
| `calories_kcal` | integer | `measured` のときの値。それ以外は NULL |
| `registered_at` | text NOT NULL | 行を登録した日時 |
| `seen_at` | text NOT NULL | 一覧にこの活動が最後に現れた日時。削除の同期（1.7 節）に使う |
| `fetched_at` | text | 詳細を取得した日時。`pending` は NULL |

- インデックス: `strava_activity_calories_pending_idx (status, occurred_at)`。取得待ちを新しい順に選ぶため。
- migration: `calorie_baseline`（1.8 節）と `strava_activity_calories` の `CREATE TABLE`、上のインデックスの `CREATE INDEX`。`pnpm --filter @life-console/db generate` で生成し、`migrations/meta/` と一緒に追加する。既存テーブルの変更はない。
- 期間での絞り込み（`GET /api/v1/strava/calories`、削除の同期）は `listMeals` と同じ `+09:00` の暦日境界を `occurred_at` に適用する。
- 名前・種目・距離・時間・心拍は保存しない。一覧の Query（メモリ内）が引き続き持つ。保存する Strava Data を消費 kcal の表示に必要な最小限にとどめる。
- `measured` / `unavailable` の行は再取得しない。`unavailable` の再確認は今回のスコープ外。

### 1.5 非同期取得の経路（runner のジョブ）

Strava の認証情報は API（Worker）だけが持つので、Strava を呼ぶのは API に限られる。非同期化の経路は「runner がジョブとして API のエンドポイントを叩き、API が Strava を呼ぶ」と「Worker の Cron Trigger で API 側だけで回す」の 2 択で、前者を採る。

| 観点 | runner のジョブ（採用） | Worker の Cron Trigger（却下） |
| --- | --- | --- |
| 実行状況と中止 | `jobs` に状態・summary・errorCode が残り、既存の実行状況画面と cancel が使える | Cron の実行は `jobs` に残らず、「job のスケジュールと状態は D1 を正とする」（`docs/requirements.md` 7 章）に反する |
| レート制限の窓またぎ | runner のループが `retryAfterSeconds` だけ待って続行できる | Worker は 1 回の実行内で待てず、Cron の周期（固定）と Strava の 15 分窓を合わせる仕組みを別に持つ必要がある |
| Worker の制約 | 1 回の API 呼び出しを小さく保てる（Workers Free の subrequest 上限と CPU 時間の中で K 件だけ処理） | 1 回の Cron 実行で処理できる件数が同じ上限で頭打ちになり、続きの状態を D1 に別途持つ |
| 既存の作法 | `nutrition_analysis` と同じ形（runner が `/api/v1/runner/*` を叩き、API が lease を検証） | Cron Trigger は 1 つだけで schedule から job を作る役割に限っている |
| Mac 停止時 | 取得が止まり `pending` のまま残る（`nutrition_analysis` と同じ。画面は「取得待ち」を出す） | Mac が止まっていても進む |

Mac 停止時の弱点は受け入れる。理由: 既存の食事解析も同じ前提で運用しており、取得待ちは画面で見える。

| 項目 | 設計 |
| --- | --- |
| ジョブ種別 | `strava_calories_sync`。`packages/domain` の `jobKinds` に追加 |
| payload | `{ from, to }`（日本時間の暦日、`from <= to`）。登録契機になった表示期間 |
| ジョブの単位 | 期間ごとに 1 件。活動ごとにジョブを作らない（活動数だけ `jobs` 行が増え、claim のたびに runner のポーリング間隔がかかる） |
| 登録契機 | `GET /api/v1/strava/activities` の各ページ応答で、保存行のない活動を `pending` で登録し（既存の行は `seen_at` を更新）、**表示期間内に取得待ちの行が 1 件以上あり**、未完了（queued / claimed / running / waiting_for_user）の同種ジョブがなければ 1 件作る。新規登録の有無を条件にしない: 日次上限で中断したジョブが残した取得待ちは、新規登録がなくても次の表示で再開する必要がある。「運動を更新」も同じ経路。作成は `insert().select()` の 1 文で未完了ジョブの不在を条件にし、二重登録を防ぐ（`createJob` の隣に条件付きの作成メソッドを追加する）。`idempotencyKey` は `nutrition` と同様に作成ごとの一意値にする。期間で固定すると完了後の再予約ができなくなるため使わない |
| runner の処理 | `job-executor-usecase.ts` の `case "strava_calories_sync"`。(1) `POST /api/v1/runner/strava/calories/reconcile`（jobId, leaseToken, from, to, page）を `nextPage` が null になるまで繰り返す。(2) `POST /api/v1/runner/strava/calories/fetch`（jobId, leaseToken）を `remaining` が 0 になるまで繰り返す。各呼び出しの間で `signal.aborted` を確認し、中止なら `canceled` を返す |
| reconcile（API、ページ単位） | lease を検証してから、期間の一覧の当該ページを Strava から取得する（既存の `activities` と同じ呼び出し）。ページ内の活動を `pending` で登録または `seen_at` を更新し、`{ nextPage, registered }` を返す。空ページ（`nextPage` が null）を受けたら、期間内の保存行のうち `seen_at` がこのジョブの `startedAt` より古い行を削除し、`{ nextPage: null, registered: 0, deleted }` を返す（1.7 節）。一覧の取得に失敗したら削除も登録もせずエラーを返す（取得失敗を削除の根拠にしない）。ページ単位にするのは、Worker の 1 リクエストあたりの subrequest 上限（[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)。実装時に Free プランの値を確認する）に全ページの取得が収まらない期間があるため |
| fetch（API） | lease を検証してから、`pending` の行を `occurred_at` の新しい順に定数 K 件選び、順に `GET /activities/{id}` を呼ぶ。K は Worker の subrequest 上限と CPU 時間の中に収まる件数としてコードに定数で置く。結果ごとに `measured` / `unavailable`（1.6 節）/ 404 なら行を削除。応答は `{ fetched, unavailable, deleted, failed, remaining, retryAfterSeconds, dailyLimitReached }` |
| 1 ジョブで処理する件数 | 上限を固定しない。fetch を繰り返し、`remaining` が 0 になるか、日次の閾値に達するまで続ける。15 分の閾値では待って続行する。したがって 1 ジョブで進むのは最大で日次の予算分（上限 1,000 回から一覧取得の分を引いた件数）。全期間のバックフィルは日をまたいで複数のジョブで進む |
| レート制限の制御 | API に置く。Strava の応答ヘッダーが 15 分・日次の読み取り使用量と上限を返すので（[Rate Limits](https://developers.strava.com/docs/rate-limits/)。ヘッダー名と窓の境界は実装時にこの頁で確認する）、`strava-api-repository.ts` で読み取って詳細取得の結果に添える。15 分の使用量が閾値（上限に対する割合。定数）に達したら fetch を中断し、次の 15 分境界までの秒数を `retryAfterSeconds` に入れる。日次の使用量が閾値に達したら `dailyLimitReached: true` で中断する。画面表示の一覧取得も同じ予算を使うため、閾値は上限より余裕を持たせる |
| 429 | `app-error.ts` に `rate_limited` の種別を追加し、`send` は 429 をこの種別で返す（一覧取得の利用者向けメッセージは現状のまま）。fetch では 429 を受けた行を `pending` のまま残し、`failed` に数えず、`retryAfterSeconds` を次の 15 分境界までにして中断する。reconcile で 429 を受けたらそのページの登録・削除を行わずエラーを返し、ジョブは `failed` になる（次の表示で再予約される） |
| runner の終了判定 | `remaining === 0` → `succeeded`（summary: 取得 n 件、値なし m 件、削除 d 件）。`dailyLimitReached` → `succeeded`（summary: 「1 日の上限で中断。残り r 件。次回の表示か『運動を更新』で再開」。異常ではなく想定内の見送りなので `failed` にしない）。`retryAfterSeconds` あり → `signal` を見ながら待って続行（待つ上限は次の 15 分境界まで。定数）。`failed > 0` かつ `fetched + unavailable + deleted === 0`（進捗なし）→ `failed`（`strava_calories_partial`）。API がエラー（認可失効など）→ `failed` |
| 個別の失敗 | 401 は既存の「認可が失効」で API がエラーを返し、ジョブは `failed`。再接続後の次の登録で再開する。404 は一覧と詳細の間に削除された活動として行を削除する。その他の upstream エラーは行を `pending` のまま `failed` に数え、次の行へ進む |
| 自動リトライ | しない。`failed` のジョブは残し、次の画面表示か「運動を更新」で新しいジョブを予約する。`jobs.attempt` は既存機構のまま使い、本設計で増やさない |
| lease の検証 | reconcile / fetch は Strava を呼ぶ前に、`jobs` の `leaseToken` 一致・`status = running`・`leaseExpiresAt > now` を確認する（`nutrition-repository.ts` の `save` が使う条件と同じ）。失効した runner の呼び出しに Strava の予算を使わせない。D1 への書き込みは活動 ID をキーにした冪等な upsert / delete で、古い runner が書いても内容は同じになる |
| 定期実行 | 初回実装では登録しなかった。運用で「画面を開いたときだけ予約される」弱点が出たため、2 時間ごとの定期同期と初回の遡りを [calories-sync-schedule.md](calories-sync-schedule.md) で設計した。payload `{}` の定期同期は API が窓を決め、画面契機の `{ from, to }` は残す |

日次上限に達した日は、画面を表示するたびに短いジョブが登録され、一覧取得だけして終わる。一覧取得 1〜2 回の消費で済むため許容する。

そのほかの却下案:

| 案 | 却下理由 |
| --- | --- |
| `GET /api/v1/strava/activities` の中で同期的に取得 | ページ表示のたびに詳細取得が走り、レート制限の制御とユーザーの待ち時間が結び付く。バックフィルが画面操作に依存する |
| Worker の `waitUntil` で応答後に取得 | 実行状況と失敗が `jobs` に残らず、レート制限の窓をまたぐ継続ができない |

### 1.6 `calories` が取れない活動

Strava の DetailedActivity で `calories` が値を持たない活動（手動入力の活動など）は `unavailable` として保存し、画面では「算入外 n 件」と表示する。MET 概算などへ落とさない（実測だけを使う方針。暗黙の代替値を作らない）。

未確定: Strava が値を持たない活動で `calories` が省略されるのか `0` になるのかは確認していない。実装時に本人の実データで確認する。仮の規則: 省略または null は `unavailable`。`0` かつ `moving_time > 0` も `unavailable` として扱う（時間のある活動の消費が 0 kcal になることは現実的でないため）。実データで `0` が別の意味を持つと分かれば見直す。

判定への影響（1.9 節）: 算入外の活動はいつまで待っても値が出ないので、収支の確定を妨げない。合計に含めず、注記で示す。

### 1.7 削除された活動の同期と接続解除

削除の同期は実装する。ただし規約 6.3 の 48 時間以内の反映は保証できない（同期は本人が画面を開いたときに限られる）。

- 画面表示と「運動を更新」は一覧を再取得してジョブを予約する。ジョブの reconcile が期間の全ページを読み終えた時点で、期間内の保存行のうち `seen_at` がジョブの `startedAt` より古い行（今回の一覧に現れなかった行）を削除する。表示している期間についてはそのときに同期される。
- 詳細取得で 404 が返った活動も削除する。
- 表示していない期間の削除は反映されない。全期間の同期はユーザーが「全期間」を表示したときに行われる。定期同期（[calories-sync-schedule.md](calories-sync-schedule.md)）が突き合わせるのは直近 30 日だけで、それより古い削除は同じく表示したときにだけ反映される。
- 画面表示側の登録は削除を行わない。ページごとに応答が返るため、期間全体を見終えたことを画面側の 1 リクエストでは判定できない。

接続解除時: `接続を解除`（Strava の revoke 成功後）で `strava_activity_calories` を全件削除する。既存の「接続解除で画面の運動データを消す」と揃える。再接続後は再取得が必要で、活動数が多いと日次上限のため数日かかる。残す案は再取得を避けられるが、revoke 後もデータを保持することになり規約との乖離が大きくなるため採らない。

### 1.8 基準消費量の保存先

`weight_goal` と同じ形の単一行テーブル `calorie_baseline` を新設し、`GET/PUT /api/v1/calorie-baseline`（null 可）で保存・解除する。

- 列: `id integer PRIMARY KEY`（常に 1）、`daily_expenditure_kcal integer NOT NULL`。
- 契約: `calorieBaselineSchema = { dailyExpenditureKcal: 正の整数 }`。上限は現実的な値（例として 10,000）で境界検証する。
- 名前は「上限」ではなく「基準消費量」であることを表す。

却下した案:

| 案 | 却下理由 |
| --- | --- |
| `weight_goal` に列を足す | 体重の目標を解除（行削除）すると基準消費量も消える。寿命が独立しているのでテーブルを分ける |
| `system_state` の key-value に JSON で保存 | 型がなく、`packages/db` のルール（schema を正本にする）に合わない |
| 身長・年齢・性別から計算 | 個人属性の保存が増える。ユーザーは本人が決めた数値を想定している |

設定 UI は `WeightGoalDialog` と同じ作りの `CalorieBaselineDialog`。項目は「1 日の基準消費量（kcal）」の整数入力 1 つ、「保存」、設定済みなら「解除」。説明文は「基礎代謝と日常の活動で 1 日に使う量の目安。運動は Strava の記録から別に加えます。」。開閉は URL の `entry` に `"baseline"` を追加して既存の `entry=goal` と同じ扱いにする（`docs/agent-rules/web-ui.md` の「入力シートの開閉は既存の search schema に合わせる」）。

### 1.9 未確定・欠測の扱い

`docs/requirements.md` 6.7 の「値がない食事を 0 kcal と扱わない」を収支にも適用する。取得待ちの運動も 0 kcal と扱わない。

前提の検証: 摂取は未記録の食事にカロリーが付くと増えるだけで減らない（手入力の 0 kcal は「増えない」だけ）。したがって収支は下がる方向にしか動かない。一方、取得待ちの活動があると収支は上がる方向にしか動かない。符号の確定条件は上下で非対称になる。

| 収支の値 | 摂取 | 運動 | 符号 | 額 | 表示 |
| --- | --- | --- | --- | --- | --- |
| 負 | 全件記録済み | 取得待ちなし | 超過で確定 | 確定 | 赤の棒。「超過 −222」 |
| 負 | 未記録あり | 取得待ちなし | 超過で確定（さらに下がるだけ） | 未確定 | 赤の棒に破線枠。「超過 −222・未記録 1 件」 |
| 負 | 任意 | 取得待ちあり | 未確定（運動で上がりうる） | 未確定 | 灰色の破線枠。「未確定・取得待ち 1 件」 |
| 0 以上 | 全件記録済み | 取得待ちなし | 貯金で確定 | 確定 | 通常色の棒。「+117」 |
| 0 以上 | 全件記録済み | 取得待ちあり | 貯金で確定（さらに上がるだけ） | 未確定 | 通常色の棒に破線枠。「+117 以上・取得待ち 1 件」 |
| 0 以上 | 未記録あり | 任意 | 未確定（摂取で下がりうる） | 未確定 | 灰色の破線枠。「未確定・未記録 1 件」 |
| 計算しない | 記録なし（`totalMeals === 0`） | 任意 | — | — | 棒なし。「食事の記録なし」。運動があればその値だけ表示 |
| 計算しない | 任意 | 任意 | — | — | 基準消費量が未設定。摂取と運動の数値だけ表示し、ヘッダーに「基準消費量を設定」 |

- 判定は `符号が確定するか` と `額が確定するか` の 2 つのフラグで表す。額の確定は「摂取が全件記録済み かつ 取得待ちの活動がない」。符号の確定は「収支 < 0 かつ 取得待ちなし」または「収支 ≥ 0 かつ 摂取が全件記録済み」。
- 算入外（`unavailable`）の活動は確定を妨げない。合計に含めず「算入外 n 件」と注記する。
- 未記録の食事は解析が進むと 5 秒ごとの再取得で、取得待ちの運動は runner の取得が進むと D1 の再読み込み（1.10 節）で確定に変わる。
- `recordedMeals === 0` かつ `totalMeals > 0` の日は摂取を 0 とせず「未記録 n 件」だけを出す。収支は上の表の「未記録あり」に従う。

### 1.10 Strava の状態ごとの見せ方

摂取は Strava と無関係に描く。運動と収支だけが状態で変わる。

| 状態 | 判定 | 運動 | 収支 |
| --- | --- | --- | --- |
| 未設定・未接続 | `status.data.configured === false` または `athleteId === null` | 列を出さない | 「運動を含めない収支」として `基準消費量 − 摂取` を描く。パネルの注記に「Strava 未接続のため、運動を含めていません」。符号・額の判定は運動を取得済み（0）として扱う。この扱いは注記で見える形にする |
| 一覧の取得中 | `connected && !complete && !isError` | `role="status"` で「運動を取得しています。取得後に収支を表示します」 | 描かない（取得後に棒が飛ぶのを避ける） |
| 一覧の取得失敗 | `activities.isError` | 1 行の注記「運動を取得できていないため、収支を表示していません」。再接続ボタンは既存パネルにあるので置かない | 描かない |
| 一覧の取得完了 | `complete` | 日ごとの実測値。取得待ち・算入外があれば件数。期間内に取得待ちがある間はパネルに `role="status"` で「消費カロリーを取得中（残り n 件）。Mac の runner が順に取得します」。`n` は期間全体の件数で、表示を直近 7 日に絞っていても変わらない（2.1 節） | 描く。「Powered by Strava」を figcaption に入れる（[表示ガイドライン](https://developers.strava.com/guidelines/)） |

消費 kcal の読み込み経路: 一覧の Query は自動再取得しない（`gcTime: 0`、Strava の予算を使うため）。消費 kcal は D1 だけを読む `GET /api/v1/strava/calories?from&to` を別の Query で読み、一覧と活動 ID で突き合わせる。表示期間に取得待ちがある間だけ数十秒間隔で再取得し（間隔はコードの定数）、なくなれば止める。Strava を呼ばないので予算を消費しない。

一覧の取得中・失敗を運動 0 として収支に入れない。これは `docs/strava-integration.md` の「取得途中・失敗を走行距離ゼロとして扱わない」と同じ規則。

### 1.11 置き場所

新しいパネルを **体重の推移セクションの直後、「この期間の運動」パネルの前** に置く。

- 期間セレクターは体重セクションのヘッダーにあり、`periodFrom` / `periodTo` を通じて全パネルに効く。期間に連動する 2 つのグラフを隣り合わせにすると「上のボタンで両方の期間が変わる」ことが分かる。カロリー収支の取得範囲はこの期間全体だが、表示は既定で直近 7 日に絞り、表の下のボタンで期間全体に広げる（2.1 節の表示範囲）。
- 「この期間の運動」は `<details>` 中心の詳細パネルなので、その前に一覧性の高いグラフを置くと画面の流れが「目標 → 体重 → カロリー収支 → 運動の詳細 → 食事の写真」になる。

パネルの見出しは隣の「この期間の運動」に揃える: `<h2>` に「カロリー収支」、副題に「基準消費量 1,500 kcal・体重と同じ期間・日本時間・新しい順」。未設定なら副題は「基準消費量が未設定・体重と同じ期間・日本時間」。右上に「基準消費量を設定」または「基準消費量を編集」ボタン。

`MealGallery` 内の「日別のカロリー」表は今回そのまま残す。統合は実装後にユーザーが判断する。

### 1.12 スコープ

今回やること:

- 日別の収支の可視化（案 1）。符号・額の確定状態と、運動の確度（実測 / 取得待ち / 算入外）の表示。既定の直近 7 日表示と期間全体への展開（URL に保持）。
- 基準消費量の保存（テーブル、migration、契約、API、ダイアログ、URL の `entry`）。
- 消費 kcal の永続保存（テーブル、migration、domain の候補値、契約）、登録とジョブ予約、runner のジョブ、reconcile / fetch のエンドポイント、レート制限の制御、削除の同期、接続解除時の削除、D1 だけを読む消費 kcal の API と Web の再読み込み。
- 上記の状態を再現する stories と純粋関数のテスト、storage テスト、runner の executor テスト。
- README・要件定義・Strava 連携ドキュメントへの反映（1.3 節の表）。

やらないこと:

- MET 概算などの代替値。
- 身長・年齢・性別の保存、基礎代謝の計算。
- 基準消費量の履歴。
- 期間の累計（2.3 節）、週・月単位の集計。
- webhook、自動リトライ。定期スケジュールと初回の遡りは [calories-sync-schedule.md](calories-sync-schedule.md) で別途設計した。
- `unavailable` の活動の再確認。
- 一覧が取得できないときに保存済みの kcal だけで収支を出すこと（一覧が活動の存在の正であり続ける）。
- 日をタップして食事へ絞り込む導線（URL が 1 日だけの期間を表現できないため。導入するなら `parseHealthSearch` の `from < to` の契約を先に見直す）。
- `MealGallery` の日別表の統合・削除。
- ホーム画面への転記、通知。

## 2. UI

### 2.1 採用: 案 1「ゼロ中央の収支棒」

1 行に収支の棒を 1 本。ゼロを中央に置き、右へ伸びれば貯金、左へ伸びれば超過。摂取の数値を棒の左端、運動の数値を右端に置き、「摂取」「運動」の語はヘッダーだけに出す。副行は状態の件数だけ（2.4 節の改訂を反映済み）。

サンプル（基準消費量 1,500 kcal、表示期間 9/2〜9/13。9/8 がユーザーの挙げた例）:

| 日 | 食事 | 摂取 | 運動 | 収支 | 状態 |
| --- | --- | --- | --- | --- | --- |
| 9/13 | 3 件すべて記録済み | 1,703 | ラン 5.0 km +320（実測） | +117 | 貯金・確定 |
| 9/12 | 3 件のうち 2 件記録済み | 1,082（暫定） | ウォーク 取得待ち 1 件 | +418 | 未確定（未記録 1 件・取得待ち 1 件） |
| 9/11 | 2 件記録済み | 1,345 | 手動記録 算入外 1 件 | +155 | 貯金・確定（算入外を除く） |
| 9/10 | 3 件記録済み | 1,902 | 筋トレ +180（実測） | −222 | 超過・確定 |
| 9/9 | 記録なし | — | ラン +410（実測） | — | 食事の記録なし |
| 9/8 | 3 件記録済み | 1,900 | ラン +500（実測） | +100 | 貯金・確定 |
| 9/2〜9/7 | 記録なし | — | なし | — | 食事と運動の記録なし |

```text
カロリー収支                                          [基準消費量を編集]
基準消費量 1,500 kcal・体重と同じ期間・日本時間・新しい順
消費カロリーを取得中（残り 1 件）。Mac の runner が順に取得します。

 日付    摂取                  0                  運動      収支
 9/13    1,703                 │█████             +320      +117
 9/12    1,082                 │░░░░░░░░░░░░░░░░░          未確定
         未記録 1 件・取得待ち 1 件
 9/11    1,345                 │██████                      +155
         算入外 1 件
 9/10    1,902        ▓▓▓▓▓▓▓▓▓│                  +180  超過 −222
 9/9         —                 │                  +410         —
         食事の記録なし
 9/8     1,900                 │████              +500      +100
 9/2〜9/7  食事と運動の記録なし（6 日）

 █ 貯金  ▓ 超過  ░ 未確定  │ ±0
 収支 = 基準消費量 + 運動 − 摂取。運動は Strava の記録の消費カロリーです。Powered by Strava
```

- ゼロ基準: 中央の縦線が ±0。右が `primary`、左が `destructive`。符号は数値の `+` / `−` と「超過」の語でも示し、色だけに頼らない。
- 摂取と運動の数値: 棒トラックの中に絶対配置し、左端に摂取、右端に運動を置く。摂取は収支を左（超過側）へ、運動は右（貯金側）へ押す要因なので、配置が力の向きと一致する。列を増やさないのは 390 px で棒の幅を確保するため。棒の最大幅は数値の手前で止め、収支が `±scale` に近い日でも重ねない。
- 語: 「摂取」「運動」はヘッダーだけに出す（「摂取 / 0 / 運動」）。「消費」は使わない（副題の「基準消費量」と混同する）。`−500 / +500` の目盛りは出さない。
- 運動の列: 実測の値があるときだけ `+320` の形で出す。活動なし・取得待ち・算入外は空にし、`…` や `—` で表さない。状態は副行の件数が伝える。
- 摂取の列: 食事の記録がない日（`totalMeals === 0`）だけ `—`。全件が未記録の日は 0 を出さず空にする（`docs/requirements.md` 6.7）。
- 副行: 状態の件数（「未記録 n 件」「取得待ち n 件」「算入外 n 件」）と「食事の記録なし」だけ。状態がない日は 1 行で終わる。
- 未確定: 破線枠と薄い塗り（1.9 節の表）。符号だけ確定している行は色を付けた破線、符号も未確定なら灰色の破線。
- 記録なし: 棒なし。摂取は `—`、運動があれば右端に値。連続する空白日は「9/2〜9/7 食事と運動の記録なし（6 日）」の 1 行にまとめる。食事はないが運動がある日（9/9）はまとめない。
- 並び順: 新しい日を上にする。既存の日別表・食事一覧の「新しい順」と揃える。
- 表示範囲: 既定は表示期間の終端から直近 7 暦日（行の `from` を `max(periodFrom, periodTo の 6 日前)` に絞る）。期間セレクターが 30 日・90 日・全期間のどれでも既定は 7 日。表の下のボタンで期間全体に広がり、折りたたみ時の文言は「すべて表示（他 n 日）」、展開時は「直近 7 日だけ表示」。`n` は期間全体の暦日数 − 7。期間が 7 日以下ならボタンを出さない。展開状態は URL の search に持ち（`parseHealthSearch` に追加。既定のときは載せない）、期間セレクターを変えても維持する。取得範囲は変えない: `stravaCaloriesQuery` と `mealsForPeriodQuery` は期間全体を取り、表示だけを絞る（折りたたみ中に取得を止めると展開時に空になるため）。「消費カロリーを取得中（残り n 件）」の `n` は期間全体の件数のまま。上の図は展開後（期間全体）で、既定では 9/13〜9/7 の 7 行が出て 9/7 は単独の記録なしの行になり、ボタンは「すべて表示（他 5 日）」になる。
- スケール: 表示している行の収支の最大絶対値を 500 kcal 単位に切り上げ、左右対称にする。最小は ±500。目盛りの数値は表示しない（各行に数値があるため）。表示範囲を展開するとスケールが変わりうる。
- 読み上げ: 各行に `sr-only` の文（「摂取 1,703 kcal、運動 320 kcal、収支 +117 kcal」と状態）を残す。棒と絶対配置の数値は `aria-hidden` で、読み上げはこの文だけを使う。
- 実装: 素の HTML `<table>`。日付・収支の列を持ち、収支セルの中に棒トラック（`div`、中央から左右へ幅 %）、その左右端に絶対配置の数値、右に収支ラベル、状態があるときだけ副行を置く。ゼロ線は各セルの棒トラック中央の 1 px の縦線で、行が隙間なく並ぶことで連続した線に見せる。数値は `tabular-nums` と `Intl.NumberFormat("ja-JP")`。スクロール領域は既存の表と同じく高さを制限する。

狭い画面（390 px）:

```text
 9/13  1,703    │████       +320     +117
 9/12  1,082    │░░░░░░░░░           未確定
       未記録 1 件・取得待ち 1 件
 9/10  1,902  ▓▓│           +180  超過 −222
 9/8   1,900    │███        +500     +100
```

- 数値を棒トラックの中に置くため列は増えない。トラックの両端の数値の分だけ棒の領域が狭くなる（約 180 px のトラックで数値に各 3 rem 弱を使うと棒は片側 50 px 前後。+117 は 12 px 程度）。数値と棒が重ならないよう棒の最大幅を数値の手前で止める。
- 状態のある行だけ 2 行目。行の高さは状態がなければ 1 行分。

採用理由: ユーザーの言葉「正味の ± が 0 が基準となるようなグラフ」をそのまま形にしており、棒の向きと色で符号、長さで額が分かる。摂取と運動は数値として毎行違う値を持つので冗長にならず、語をヘッダーへ出すことで行の中は図と数値だけになる。HTML の表で作れ、既存の `MealGallery` の日別表と同じ a11y（実際の `<table>`）になる。

### 2.2 却下した案

| 案 | 要約 | 却下理由 |
| --- | --- | --- |
| 案 2 消費の枠と摂取 | 「基準消費量 + 運動」を今日食べられる枠の棒として描き、摂取でどこまで埋めたかを塗る。余りが貯金、はみ出しが超過 | 「あとどれだけ食べられるか」には向くが、日どうしの収支の比較は棒の右端付近の差を読む必要があり、案 1 より読み取りに時間がかかる。棒の構成要素が 4 種で凡例が必須。取得待ちの活動が埋まると枠の長さが変わる |
| 案 4 参考画像型 | 摂取の絶対値を棒にし、基準消費量の位置に線を引く。運動は別の細い棒。収支は数値のみ | 赤の意味が収支と一致しない。9/8 は摂取 1,900 が基準 1,500 を超えるので赤くなるが、収支は +100 の貯金。ユーザーの「±0 が基準」に合わない |

### 2.3 後から足せる拡張: 期間の累計（旧案 3）

今回は入れない。必要になった場合は案 1 の行構造を変えずに、残高の列と上部の合計行を足す。

- 累計は表示期間の最初の日から新しい日へ、額が確定した日（摂取が全件記録済み かつ 取得待ちの活動がない）の収支を足した値。記録なしの日と未確定の日は足さず、行に「累計に含めない」と書く。算入外の活動がある日は含める。
- 上部の合計には、確定・未確定・記録なしの日数を必ず添える。既定の 90 日では記録なしの日が多くなるため、日数なしの合計は誤解を生む。
- 純粋関数は `calorie-balance.ts` に累計の関数を 1 つ足す形になる（3.4 節の行の型に `cumulativeKcal` を加える）。

### 2.4 実物を見た後の改訂

実装済みの案 1（副行に「摂取 1,703・運動 +320」の定型文）を Storybook とローカルアプリで見たユーザーの指摘:

> 「なんかさ、もうちょっとだけ表示工夫してみて？」
> 「食事と運動のカロリーが文字で書かれることで統一感無くなるのと、毎回同じ文言と決まった形式の数値だけだと、別にこれである必要ないなあ」

設計側は「摂取と運動が文字でしか見えない」と読み、数値まで減らして図に置き換える 3 案を出した。実装済みの配色・スケールで HTML に起こして比較した結果、どれも採用されなかった。

| 案 | 要約 | 結果 |
| --- | --- | --- |
| 改-1 運動なしの収支を重ねる | 棒 1 本のまま「基準消費量 − 摂取」を薄く重ね、濃い棒との差を運動とする | 摂取そのものが見えず、薄い棒の読み方を覚える必要がある |
| 改-2 枠と摂取の内訳棒 | 収支棒の下に「基準 + 運動」の枠と摂取の塗りを描く 2 段 | 「トータル 2 行がいいので 2 かなと思ったけど、ちょっとぱっと見でわかりにくいかも」 |
| 改-3 別々の棒 | 摂取と運動を独立した棒にした 3 段 | 行が高く、収支との対応が図から消える |

採用したのはユーザー自身の案:

> 「やっぱ 1 行の収支だけにして、右と左にカロリー摂取と消費をかいて、それを 1 行のグラフのところに重ねて書いて、で、ヘッダーのみに消費・摂取とか書けばいいんじゃないなか」

変更点（現在の仕様は 2.1 節に反映済み）:

- 棒は 1 本のまま。収支ラベル・破線・色の規則、`calorie-balance.ts` は変更しない。
- 摂取の数値を棒トラックの左端、運動の数値を右端に絶対配置する。列を増やさず、棒の最大幅は数値の手前で止める。
- 「摂取」「運動」の語はヘッダーだけに出す（「摂取 / 0 / 運動」）。「消費」は使わず、`−500 / +500` の目盛りも出さない。
- 運動の列は実測の値があるときだけ出し、活動なし・取得待ち・算入外は空にする。摂取は食事の記録がない日だけ `—`。
- 副行は状態の件数だけにし、状態がない日は 1 行で終える。
- 読み上げ用の `sr-only` の文は各行に残す。

```text
変更前  9/13          │█████                 +117
              摂取 1,703・運動 +320

変更後  9/13   1,703  │█████         +320    +117
```

3 案が採用されなかった理由の記録: 冗長だったのは毎行繰り返される「摂取」「運動」という語であって、数値ではなかった（数値は毎行違う）。3 案はどれも数値まで減らして図に置き換える方向で、語をヘッダーへ追い出すだけで済む解を見落とした。表示の指摘を受けたら、対象が語・数値・図のどれかを切り分けてから案を作る。

## 3. 実装の全体方針

### 3.1 層ごとの配置

| 層 | 置くもの |
| --- | --- |
| `packages/domain` | `jobKinds` に `strava_calories_sync`。`stravaCaloriesStatuses = ["pending", "measured", "unavailable"]` |
| `packages/db` | `calorie_baseline`、`strava_activity_calories` と migration |
| `packages/contracts` | `calorieBaselineSchema` / `CalorieBaseline`。`stravaCaloriesQuerySchema`（from, to）と `StravaActivityCalories`。`stravaCaloriesSyncPayloadSchema`（from, to）。runner 用の `stravaCaloriesReconcileSchema`（jobId, leaseToken, from, to, page）、`stravaCaloriesFetchSchema`（jobId, leaseToken）と応答型 |
| `apps/api` | `app-error.ts` に `rate_limited`。`strava-api-repository.ts` に `activityDetail` と使用量ヘッダーの読み取り。新規 `strava-calories-repository.ts`（D1）。`life-console-repository.ts` に条件付きのジョブ作成と lease の検証。`strava-usecase.ts` の拡張。`app.ts` に `GET /api/v1/strava/calories`、`POST /api/v1/runner/strava/calories/reconcile`、`POST /api/v1/runner/strava/calories/fetch`、`GET/PUT /api/v1/calorie-baseline` |
| `apps/runner` | `api-repository.ts` に reconcile / fetch の呼び出し。`job-executor-usecase.ts` に `case "strava_calories_sync"` |
| `apps/web`（ページ隣） | 純粋関数 `calorie-balance.ts`、`exercise-calories.ts`（日別集計のみ）、部品 `DailyCalorieBalanceList.tsx`、`CalorieBaselineDialog.tsx`、query、search、stories、テスト |

収支の計算と日別集計は Web 側の純粋関数に置く。活動一覧はブラウザのメモリ、消費 kcal は D1 の読み取り API から得る。

### 3.2 触るファイルと作業

domain、DB、contracts:

| ファイル | 作業 |
| --- | --- |
| `packages/domain/src/index.ts` | `jobKinds` に `"strava_calories_sync"` を追加。`stravaCaloriesStatuses` を追加 |
| `packages/db/src/schema.ts` | `calorieBaseline = sqliteTable("calorie_baseline", { id: integer("id").primaryKey(), dailyExpenditureKcal: integer("daily_expenditure_kcal").notNull() })`。`stravaActivityCalories = sqliteTable("strava_activity_calories", { activityId: text("activity_id").primaryKey(), occurredAt: text("occurred_at").notNull(), status: text("status", { enum: stravaCaloriesStatuses }).notNull(), caloriesKcal: integer("calories_kcal"), registeredAt: text("registered_at").notNull(), seenAt: text("seen_at").notNull(), fetchedAt: text("fetched_at") }, (table) => [index("strava_activity_calories_pending_idx").on(table.status, table.occurredAt)])` |
| `packages/db/migrations/0011_*.sql`, `migrations/meta/` | `pnpm --filter @life-console/db generate` で生成し、SQL を読んで確認。`pnpm migrations:check` を通す |
| `packages/contracts/src/nutrition.ts` | `calorieBaselineSchema = z.object({ dailyExpenditureKcal: z.number().int().positive().max(上限) })` と `CalorieBaseline` 型 |
| `packages/contracts/src/strava.ts` | `stravaCaloriesQuerySchema`（`stravaActivityQuerySchema` から `page` を除いた形）。`StravaActivityCalories = { activityId: string; status: StravaCaloriesStatus; caloriesKcal: number \| null }`。`stravaCaloriesSyncPayloadSchema`、`stravaCaloriesReconcileSchema`、`stravaCaloriesFetchSchema`、`StravaCaloriesReconcileResult = { nextPage: number \| null; registered: number; deleted: number }`、`StravaCaloriesFetchResult = { fetched: number; unavailable: number; deleted: number; failed: number; remaining: number; retryAfterSeconds: number \| null; dailyLimitReached: boolean }` |

API:

| ファイル | 作業 |
| --- | --- |
| `apps/api/src/shared/app-error.ts` | `AppErrorCode` に `"rate_limited"` と `appError.rateLimited(message)` を追加。HTTP へのステータス変換（`app.ts` の `respond`）に 429 を対応付ける |
| `apps/api/src/repositories/strava-api-repository.ts` | `send` の 429 を `rateLimited` に変更（メッセージは現状のまま）。`activityDetail(accessToken, id)` を追加し、`calories` だけを読む（`z.object({ calories: z.number().nonnegative().nullish() })`）。応答ヘッダーの読み取り使用量・上限を結果に添える。404 は `notFound` |
| `apps/api/src/repositories/strava-calories-repository.ts` | 新規（D1、Drizzle）。`registerOrTouch(activities: { id, occurredAt }[], now)`（存在しない ID は `pending` で挿入、存在する ID は `seen_at` を更新。`insert … onConflictDoUpdate` の 1 文）、`deleteUnseen(from, to, seenBefore)`、`listPending(limit)`（`occurredAt` 降順）、`saveMeasured(id, kcal, now)`、`markUnavailable(id, now)`、`delete(id)`、`listByPeriod(from, to)`、`deleteAll()`、`countPending()`。期間の境界は `listMeals` と同じ `+09:00` の暦日 |
| `apps/api/src/repositories/life-console-repository.ts`, `d1-life-console-repository.ts` | `createJobUnlessActive(input)`（同種の未完了ジョブがなければ挿入。`insert().select()` の 1 文）と `findRunningJobExecution(jobId, leaseToken, now)`（`nutrition-repository.ts` の `save` の条件を読み取り用にしたもの。`startedAt` を返す）を追加 |
| `apps/api/src/usecases/strava-usecase.ts` | `activities`: 上流の応答後に `registerOrTouch` し、表示期間内に取得待ちの行があれば `createJobUnlessActive` で `strava_calories_sync` を予約する（payload は入力の from / to）。`calories(from, to)`: D1 だけを読む。`reconcile(input)` / `fetchCalories(input)`: 1.5 節。`disconnect`: revoke 成功後に `deleteAll`。依存に `strava-calories-repository` と `LifeConsoleRepository`（ジョブ）を追加 |
| `apps/api/src/app.ts` | `GET /api/v1/strava/calories`（`zValidator("query", stravaCaloriesQuerySchema)`）、`POST /api/v1/runner/strava/calories/reconcile`、`POST /api/v1/runner/strava/calories/fetch`（既存の `/api/v1/runner/*` 認証の下）、`GET/PUT /api/v1/calorie-baseline`（`weight-goal` の隣、`zValidator("json", calorieBaselineSchema.nullable())`） |
| `apps/api/src/repositories/life-console-repository.ts` ほか | `getCalorieBaseline` / `saveCalorieBaseline` を `getWeightGoal` / `saveWeightGoal` の隣に追加（`id = 1` の select / `insert ... onConflictDoUpdate` / null なら delete）。`health-usecase.ts` と `life-console-handlers.ts` に pass-through |

runner:

| ファイル | 作業 |
| --- | --- |
| `apps/runner/src/repositories/api-repository.ts` | `reconcileStravaCalories(input, signal)` と `fetchStravaCalories(input, signal)` を追加。既存の `request` を使い、応答を contracts の schema で検証 |
| `apps/runner/src/usecases/job-executor-usecase.ts` | `case "strava_calories_sync"`: payload を `stravaCaloriesSyncPayloadSchema` で検証。lease token がなければ `missing_lease_token`。reconcile を `nextPage` が null になるまで、fetch を `remaining` が 0 になるまでループ。終了判定と待機は 1.5 節の表。中止は `signal` |
| `apps/runner/src/usecases/strava-calories-job.test.ts` | 新規。`nutrition-job.test.ts` と同じ粒度 |

Web:

| ファイル | 作業 |
| --- | --- |
| `apps/web/src/api.ts` | `calorieBaseline`, `saveCalorieBaseline`, `stravaCalories(from, to)` |
| `apps/web/src/pages/health/queries.ts` | `calorieBaselineQuery`。`stravaCaloriesQuery(from, to)` は `refetchInterval` を関数にし、応答に `pending` が含まれる間だけ定数の間隔で再取得する |
| `apps/web/src/router.tsx` | 健康ルートの loader に `ensureQueryData(calorieBaselineQuery)` を追加（`weightGoalQuery` と同じ扱い） |
| `apps/web/src/pages/health/health-search.ts` | `entry` の候補に `"baseline"` を追加。`parseHealthSearch` の判定にも加える。カロリー収支の展開状態のキー（実装の名前に従う。既定の直近 7 日のときは載せない）を追加 |
| `apps/web/src/pages/health/HealthRoutePage.tsx` | `baselineEntryOpen={search.entry === "baseline"}` と `onBaselineEntryOpenChange`（`goal` と同じ navigate）。展開状態の切り替えは `replace` で navigate し、期間変更の navigate でも引き継ぐ |
| `apps/web/src/pages/health/HealthPage.tsx` | `useSuspenseQuery(calorieBaselineQuery)`。`nutritionQuery` を `useQuery`。`strava.complete` のときだけ `stravaCaloriesQuery(periodFrom, periodTo)` を有効にし、`exerciseCaloriesByDay(strava.records, calories)` で日別に集計して `ExerciseInput` を組み立て、`calorieBalanceRows` に渡す。折りたたみ時は `calorieBalanceRows` の `from` を直近 7 日に絞り、取得の from / to は変えない。日別の行は `useMemo` で導出する。`CalorieBaselineDialog` と `DailyCalorieBalanceList` を体重セクションの直後に描く |
| `apps/web/src/pages/health/HealthPage.test.tsx` | `client.setQueryData(calorieBaselineQuery.queryKey, null)` を追加（suspense query が増えるため必須） |
| `apps/web/src/pages/health/calorie-balance.ts`, `.test.ts` | 新規。3.4 節 |
| `apps/web/src/pages/health/exercise-calories.ts`, `.test.ts` | 新規。3.4 節（日別集計のみ） |
| `apps/web/src/pages/health/_components/DailyCalorieBalanceList.tsx`, `.stories.tsx` | 新規。案 1 の表部品と stories。表の下に表示範囲の切り替えボタン（期間が 7 日以下なら出さない）。stories に既定の 7 日表示と展開後の story |
| `apps/web/src/pages/health/_components/CalorieBaselineDialog.tsx` | 新規。`WeightGoalDialog` と同じ構造（1.8 節） |
| `apps/web/src/pages/health/HealthPage.stories.tsx` | `handlers()` に `GET/PUT */api/v1/calorie-baseline` と `GET */api/v1/strava/calories` を追加（既存の全 story が suspense で待つため前者は必須）。基準消費量の設定・解除・保存失敗と、Strava 込みの統合 story を追加 |

ドキュメント: 1.3 節の表。

### 3.3 DB と migration

- `calorie_baseline`: `id integer PRIMARY KEY NOT NULL`, `daily_expenditure_kcal integer NOT NULL`。行は常に 1 件（`id = 1`）か 0 件。
- `strava_activity_calories`: 1.4 節の列とインデックス。
- 既存行への影響なし（新規テーブル 2 つ）。
- ローカル適用は `pnpm --filter @life-console/db migrate:local`。本番適用は依頼の許可範囲に従う。

### 3.4 純粋関数の仕様

`apps/web/src/pages/health/exercise-calories.ts`（日別集計のみ。概算は行わない）:

```ts
type ExerciseDayCalories = {
  readonly kcal: number;                       // measured の合計
  readonly pendingActivities: number;          // 保存行がない、または status が pending の活動数
  readonly unavailableActivities: number;      // status が unavailable の活動数
};

exerciseCaloriesByDay(activities: ReadonlyArray<StravaActivity>, calories: ReadonlyArray<StravaActivityCalories>): ReadonlyMap<string, ExerciseDayCalories>
```

- 日付は `weightCalendarDate(activity.occurredAt)`（日本時間）。`id` の重複は `exerciseWeeks` と同じく除く。
- `calories` に行のない活動は取得待ちとして数える（登録直後で D1 に行がない時間帯があるため）。

`apps/web/src/pages/health/calorie-balance.ts`:

```ts
type ExerciseInput =
  | { readonly mode: "untracked" }                                             // Strava 未設定・未接続。運動を含めない収支
  | { readonly mode: "tracked"; readonly byDay: ReadonlyMap<string, ExerciseDayCalories> };
type CalorieBalanceDay = {
  readonly date: string;
  readonly intakeKcal: number;                 // 記録済みの食事の合計
  readonly recordedMeals: number;
  readonly totalMeals: number;
  readonly exercise: ExerciseDayCalories | undefined; // undefined = その日の活動なし、または untracked
  readonly balanceKcal: number | null;         // null = 記録なし、基準未設定、または exercise 入力が undefined（一覧の取得中・失敗）
  readonly signKnown: boolean;                 // 1.9 節の条件
  readonly amountKnown: boolean;               // 1.9 節の条件
};
type CalorieBalanceRow = { kind: "day"; day: CalorieBalanceDay } | { kind: "gap"; from: string; to: string; days: number };

calorieBalanceRows(from: string, to: string, nutrition: ReadonlyArray<MealNutrition>, exercise: ExerciseInput | undefined, baselineKcal: number | null): ReadonlyArray<CalorieBalanceRow>
```

- `nutrition` を日本時間の日付で `from`〜`to` に絞り、`summarizeDailyNutrition` で日別にまとめ、`to` から `from` へ全暦日を列挙する。
- 食事も運動もない日が 2 日以上連続したら 1 つの `gap` 行にまとめる。`exercise` が `untracked` または `undefined` のときは食事の有無だけで判定する。
- `exercise` が `undefined`（一覧の取得中・失敗）のときは `balanceKcal` を null にし、摂取と食事件数だけを返す。
- `untracked` のときは運動 0・取得待ち 0 として計算し、`signKnown` / `amountKnown` は摂取だけで決める。
- `unavailableActivities` は判定に使わない（1.9 節）。

### 3.5 テストの観点

`calorie-balance.test.ts`（`nutrition-summary.test.ts` と同じ粒度、`toEqual` で配列全体を比較）:

- 基準消費量 + 運動 − 摂取で収支を計算し、`1,500 + 500 − 1,900` が `+100` になる。
- 期間内の全暦日を新しい順に並べ、食事のない日を 0 kcal ではなく記録なしとして返す。日本時間の午前 0 時で日を分ける（`14:59:00Z` と `15:00:00Z` の境界）。
- 連続する記録なしの日を 1 行にまとめ、運動だけある日はまとめない。
- 摂取に未記録がある日は額を未確定にし、収支が負で取得待ちがなければ符号だけ確定、収支が非負なら符号も未確定。
- 取得待ちの運動がある日は、収支が非負で摂取が全件なら符号だけ確定、収支が負なら符号も未確定。算入外の運動は確定を妨げない。
- `untracked` は運動 0 として計算する。`undefined` は収支を null にする。基準未設定・記録なしは null。

`exercise-calories.test.ts`（`exercise-weeks.test.ts` と同じ粒度）:

- 日本時間の日付で `measured` を合計し、同じ ID の重複を除く。
- 行のない活動と `pending` を取得待ちに、`unavailable` を算入外に数え、どちらも kcal に加えない。

`tests/calorie-baseline-storage.test.ts`（`weight-goal-storage.test.ts` を写す）:

- 未設定は `null`。保存・更新・解除を HTTP で読み直せる。
- `0`、小数、上限超過、文字列は 400 で、保存済みの値が変わらない。

`tests/strava-calories-storage.test.ts`（`tests/strava-storage.test.ts` の隣。架空の Strava 応答を注入）:

- 一覧の取得で保存行のない活動を `pending` で登録し、既存の行は `seen_at` だけ更新し、新規登録があればジョブを 1 件だけ予約する。未完了ジョブがあれば予約しない。完了後は再び予約できる。
- reconcile はページごとに登録・`seen_at` 更新を行い、空ページで期間内の `seen_at` がジョブの `startedAt` より古い行を削除する。一覧の取得に失敗したら削除も登録もしない。
- fetch は `pending` を新しい順に定数件だけ取得し、`measured` / `unavailable` を保存し、404 の行を削除する。`measured` / `unavailable` の行は再取得しない。
- 429 は行を `pending` のまま残し、`failed` に数えず、`retryAfterSeconds` を返す。使用量ヘッダーが閾値に達したら中断し、日次なら `dailyLimitReached` を返す。
- lease が一致しない・失効した・`running` でない呼び出しは Strava を呼ばずに拒否する。
- `GET /api/v1/strava/calories` は期間内の行を `+09:00` の暦日境界で返し、Strava を呼ばない。
- 接続解除は revoke 成功後に保存行を全件消し、revoke 失敗なら残す。

`apps/api/src/repositories/strava-api-repository.test.ts` に追加:

- 詳細 API の応答から `calories` だけを読み、省略・null・0 を 1.6 節の規則で扱う。使用量ヘッダーを結果に添える。429 は `rate_limited`、404 は `not_found`。

`apps/runner/src/usecases/strava-calories-job.test.ts`（`nutrition-job.test.ts` と同じ粒度）:

- reconcile を `nextPage` が null になるまで、fetch を `remaining` が 0 になるまで呼び、summary に件数を入れて `succeeded`。
- `dailyLimitReached` で `succeeded`（残り件数を summary に含む）。`retryAfterSeconds` で待ってから続行し、待機中の中止で `canceled`。
- 進捗なしの失敗で `failed`（`strava_calories_partial`）。reconcile の失敗で `failed`。lease token がなければ `missing_lease_token`。

`HealthPage.test.tsx`: `calorieBaselineQuery` のデータを設定するだけ。追加の検証は不要。

### 3.6 Storybook stories

`DailyCalorieBalanceList.stories.tsx`（部品単体。props で状態を渡す。MSW は不要）:

| story | 再現する状態 | play で確認すること |
| --- | --- | --- |
| 貯金と超過の日がある | 2.1 節のサンプル | 「+117」「+100」「超過 −222」が見える。9/8 の行が `+100` |
| 基準消費量が未設定 | `baseline: null` | 収支の棒がなく「基準消費量を設定」ボタンがある。摂取と運動の数値は見える |
| 符号だけ確定した日 | 未記録ありで収支が負 / 取得待ちありで収支が非負 | 色付きの破線と「未記録 1 件」「取得待ち 1 件」 |
| 符号も未確定の日 | 未記録ありで収支が非負 | 灰色の破線と「未確定」 |
| 算入外の運動がある日 | 9/11 | 「算入外 1 件」があり、収支は確定として表示される |
| 取得待ちがある期間 | 9/12 | パネルに `role="status"` の「消費カロリーを取得中（残り 1 件）」 |
| 記録なしの日と空白期間 | 9/9 と 9/2〜9/7 | 「記録なし（6 日）」の行が 1 つ。9/9 は運動だけの行 |
| 運動を含めない収支 | `exercise: { mode: "untracked" }` | 注記「運動を含めていません」があり、収支は基準 − 摂取 |
| 一覧を取得中 | `exercise: undefined` と取得中の状態 | `role="status"` の文言があり、収支の棒がない。摂取は見える |
| 一覧の取得失敗 | 失敗の状態 | 注記があり、収支の棒がない |
| カロリーの読み込み中 / 取得失敗 | `nutrition` の pending / error | `role="status"` / `role="alert"` |
| ダーク | `globals: { theme: "dark" }` | 目視 |
| モバイル | 390 px の decorator | 数値・副行が切れない |

`HealthPage.stories.tsx`（MSW 経由。既存の `handlers()` を拡張）:

| story | 内容 |
| --- | --- |
| URL から基準消費量を開く | `?entry=baseline` でダイアログが開き、保存後に副題「基準消費量 1,500 kcal」が出る。再度開くと入力値が復元される。「解除」で「基準消費量を設定」に戻る |
| 基準消費量の保存失敗 | PUT が 500。`role="alert"` が出て入力値が残る |
| 摂取と運動を同じ期間で見る | Strava 接続済み + 活動 + 消費 kcal + 食事 + 栄養の架空データ。「+100」「超過」が見え、期間ボタンで行が変わる |
| 取得待ちが埋まる | `GET */api/v1/strava/calories` が 1 回目は `pending`、2 回目以降は `measured` を返す。「取得待ち 1 件」が消えて収支が確定に変わる |

既存の Strava 系 story（`ExerciseFetchFailure` など）は handler の追加以外は変更しない。

### 3.7 検証

- `pnpm check`（lint、型、Vitest、build、Storybook のビルドとブラウザテスト、`migrations:check`）。
- ローカル: `pnpm local:setup` → `pnpm --filter @life-console/db migrate:local` → `pnpm dev`。健康画面で基準消費量を設定・解除し、食事を数件記録して収支の符号・額・破線の表示、期間ボタンでの切り替え、再読み込み後の復元を確認する。
- Strava の実データ確認は本人の接続と runner の起動が必要（`docs/agent-rules/runner-integrations.md` に従い、対象アカウント・期間・書き込みを確認してから起動する）。接続後に一覧取得でジョブが予約され、runner が取得し、画面の「取得待ち」が実測に変わること、保存した kcal が Strava の元記録と一致すること、`calories` を持たない活動が「算入外」になること、Strava 側で削除した活動が「運動を更新」後の同期で消えることを確認する。未確認なら報告で「未確認」と分ける。
- 390 px のカード表示を Storybook のモバイル story と実機のどちらかで確認する。
