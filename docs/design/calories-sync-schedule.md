# 消費カロリーの定期同期と初回の遡り

作成日: 2026-09-14。定期同期は実装済み。画面表示時の取得・保存範囲は後続の [運動データの保存と表示](calorie-balance-loading.md) で変更した。以下は定期同期を設計した時点の記録。前提の設計は [calories-graph.md](calories-graph.md)（1.4〜1.7 節）。検証は [calories-graph-verification.md](calories-graph-verification.md) の 1.6 節と 2.4 節。

## 0. 背景と要件

本番で「取得待ち」が全日付に残ったままになった。直接の原因は Mac の runner が古いビルドで `strava_calories_sync` を知らなかったことだが、現行設計の弱点が明らかになった。

- 消費 kcal の取得は本人が健康画面を開いたときにだけジョブが積まれる。
- 毎日見る画面ではないので、たまに開くと取得待ちだらけで使えず、待ってから開き直すことになる。
- runner が止まっていても、この画面からは気づけない。

ユーザーの要望:

> その strava からの取得も runner が裏で勝手にやるのが理想なんだけど、そうするようにできる？

> 初回のみ直近九十とか登れるだけ全部遡りたい。で、それ以降は 2 時間に 1 回で直近 30 日でいい、で、その時に、詳細取得とかは 1 回やったら 2 度とやらないように db でロックというか unique とるようにしてね

要件:

1. 初回は遡れるだけ全部取る。
2. 定常は 2 時間に 1 回、直近 30 日。
3. 詳細取得は 1 活動につき 1 回だけ。DB の一意制約で担保する。
4. 同期の状態（最後の実行の成否と遡りの進捗）を健康画面で確認できる。runner が古いビルドで動かなかった実害の再発防止として、2026-09-14 に必須と決めた（2.7 節）。

3 は現行実装で満たしている（確定事実）: `strava_activity_calories.activity_id` が PRIMARY KEY、`registerOrTouch` は `onConflictDoUpdate` で `seen_at` だけを更新し `status` を変えない、`listPendingActivityIds` は `status = 'pending'` だけを返す。本設計はこの不変条件を壊さないことを 4 章のテストと検証で固定する。

## 1. 確認した現行の仕組み

| 項目 | 確認結果 | 根拠 |
| --- | --- | --- |
| ジョブの契機 | `GET /api/v1/strava/activities` の各ページ応答で `pending` を登録し、期間内に取得待ちがあれば `createJobUnlessActive` で `strava_calories_sync` を 1 件予約。`createJobUnlessActive` は同じ種別の未完了ジョブがあれば挿入しない | `apps/api/src/usecases/strava-usecase.ts` の `queueSyncIfPending` |
| runner の実行 | payload `{ from, to }`。reconcile をページごとに呼び、fetch を `remaining` が 0 になるまで繰り返す。`retryAfterSeconds` は上限付きで待ち、`dailyLimitReached` は `succeeded` で終える | `apps/runner/src/usecases/job-executor-usecase.ts` の `case "strava_calories_sync"` |
| 削除同期 | reconcile の最終ページで、期間内の行のうちジョブの `startedAt` より前にしか見ていない行を消す | 同 usecase の `reconcileCalories`、`deleteUnseen` |
| レート制限 | 15 分 0.8、日次 0.9 で中断。一覧取得と詳細取得が同じ予算 | 同 usecase の定数と `pausedByRateLimit` |
| 定期実行の機構 | `schedules`（`interval`, `timezone`, `nextRunAt`, `coalescing`, `deadlineSeconds`, `payload_json`）。毎分の Cron が到来した schedule から job を作る。idempotency key は `scheduleId:periodStart`。`skip_if_pending` は同じ `scheduleId` の未完了ジョブがあるときだけ抑止。`deadlineAt = periodStart + deadlineSeconds` を過ぎた queued は `expired` | `apps/api/src/repositories/d1-life-console-repository.ts` の schedule 展開、`apps/api/wrangler.jsonc` の `crons` |
| interval の候補 | `hourly` / `daily` / `weekly`。2 時間ごとはない。次回時刻の加算は D1 の CASE 式（2 箇所）で、UI のラベルは `ConnectorSchedules.tsx` の `intervalLabels` | `packages/domain/src/index.ts`、`d1-life-console-repository.ts`、`apps/web/src/pages/operations/ConnectorSchedules.tsx` |
| 登録経路 | 認証済みの `POST /api/v1/schedules`（`createScheduleSchema`）。既存の定期ジョブ（体重の Obsidian 同期、栄養解析）は seed や migration に入れず、本人が API で登録する | `apps/api/src/app.ts`、`docs/weight-obsidian-export.md`、`README.md` |
| runner の並行度 | 1 件ずつ claim して実行する。長いジョブは他の種別を待たせる | `apps/runner/src/usecases/runner-loops.ts` |
| 画面の「残り n 件」 | 表示期間内の活動の取得待ち件数（全体ではない） | `apps/web/src/pages/health/HealthPage.tsx` の `pendingActivities` |
| Strava の一覧 API | `after` / `before` の epoch と `page` / `per_page`（100）で、期間内の活動を新しい順に返す | `apps/api/src/repositories/strava-api-repository.ts` の `activities` |

## 2. 設計

### 2.1 論点 1: 初回の「遡れるだけ」

遡りは「終端から 90 日ずつ古い方へ」のチャンクで行い、チャンクごとに既存の reconcile（from / to / page）をそのまま使う。進捗はチャンク単位で保存する。

| 決めること | 採用 | 却下した案 |
| --- | --- | --- |
| 下限（どこまで遡るか） | 固定の下限日をコードの定数に置く（Strava のサービス開始年の 1 月 1 日）。チャンクの `from` がこれより前になったら完了 | (a) `GET /athlete` の `created_at`: 追加の API 呼び出しが要り、`activity:read_all` だけの token では summary 表現になる可能性がある（要確認）。過去日付の活動の取り込みで作成日より古い活動もありうる。(b) 保存済み体重の最古日: 運動と体重は無関係で、体重の記録が新しいと遡れない。(c) 空チャンクが連続したら停止: 長い空白期間で誤って止まる |
| 進捗の保持 | 単一行テーブル `strava_calories_backfill`（2.6 節）。`cursor_to`（次に遡るチャンクの終端日）、`started_at`、`completed_at`、`updated_at` | `system_state` に JSON: 型がなく、基準消費量のときと同じ理由で採らない。保存行の最古日から推定: 削除・空白期間・途中終了を区別できない |
| 初回の判定 | 状態行がない = 未開始。最初の定期ジョブで作る。接続解除で状態行も消し、再接続後は初回からやり直す（消費 kcal の行も消えるため） | テーブルが空かどうか: 直近 30 日の同期で行が入るので判定にならない |
| チャンクの長さ | 90 日（定数）。空のチャンクは一覧取得 1 回で済み、下限まで約 70 チャンクでも一覧取得は 70 回程度 | 365 日: 1 チャンクの途中で日次上限に達したときのやり直しが大きい。30 日: チャンク数が 3 倍になり、空のチャンクの一覧取得が増える |
| 遡りの順序 | 新しい方から古い方へ。直近 30 日の窓の直前から始める | 古い方から: 見たい直近が最後になる |

チャンクの進め方:

- `cursor_to` から 89 日前を `from`、`cursor_to` を `to` としてチャンクを作る。reconcile をページごとに呼び、最終ページ（空ページ）を処理した時点で `cursor_to` を `from − 1 日` に進める。`from` が下限より前なら `completed_at` を入れる。
- 日次上限や 15 分の閾値でチャンクの途中で終わったときは `cursor_to` を進めない。次のジョブが同じチャンクを最初のページからやり直す。行は活動 ID をキーにした冪等な登録なので重複しない。一覧取得の数ページ分が無駄になるだけ。
- 遡り中の削除同期は、保存行がまだないので実質何もしない。同じチャンクをやり直したときは今回見なかった行を消す既存の規則がそのまま働く。
- 遡りの取得順: fetch は `pending` を `occurred_at` の新しい順に取る（現行）。直近 30 日の登録を先に行うので（2.2 節）、見たい直近の日が先に埋まる。

### 2.2 論点 2: 定常の 2 時間ごと・直近 30 日

| 決めること | 採用 | 却下した案 |
| --- | --- | --- |
| interval | `scheduleIntervals` に `every_2_hours` を追加する。D1 の次回時刻の CASE 式 2 箇所に `'+2 hours'` を足し、`ConnectorSchedules.tsx` の `intervalLabels` に「2 時間ごと」を足す（連絡の定期実行でも選べるようになるが、候補値は共通なので揃える） | `hourly` で代用: 要望と違い、直近 30 日の一覧取得が 2 倍になる。API 側で「前回から 2 時間未満なら何もしない」: 見えない規則になる |
| schedule の登録 | 本人が認証済みの `POST /api/v1/schedules` で 1 回登録する（既存の定期ジョブと同じ作法。seed や migration に入れない）。値: `name`「Strava の消費カロリー同期」、`jobKind` `strava_calories_sync`、`interval` `every_2_hours`、`timezone` `Asia/Tokyo`、`nextRunAt` 登録直後、`coalescing` `skip_if_pending`、`deadlineSeconds` 7200、`payload` `{}` | seed に入れる: 本番の schedule を勝手に足さないという既存の方針に反する |
| `deadlineSeconds` | 7200（1 周期）。runner が止まっている間は各周期の queued が期限切れになり、復旧後は最新の周期の 1 件だけが動く | 長い期限: 復旧時に古い job が積み上がる |
| payload | `{}` = 定期同期。窓は API が決める（2.4 節）。`{ from, to }` = 画面契機（従来どおり）。契約は 2 つの形の union | 定期にも `{ from, to }`: 登録時に固定した期間しか同期できない |
| 画面契機の予約 | 残す。新しい活動をすぐ見たいときに 2 時間待たずに済む。`createJobUnlessActive` は種別で未完了を見るので、定期の job が queued / running の間は積まれない。逆に定期の `skip_if_pending` は `scheduleId` 単位なので、画面契機の job の実行中でも定期の job は積まれるが、runner は 1 件ずつ実行し、後の job は残りだけを処理する | やめる: 2 時間の待ちが常に発生する |
| ジョブ内の待機 | 定期の job は `retryAfterSeconds` を受けたら待たずに `succeeded` で終える。2 時間後の job が続きを処理する。runner は 1 件ずつ実行するので、15 分ずつ待ち続けると食事解析などを長時間止める | 画面契機の job は従来どおり上限付きで待つ（本人が待っている） |

定期の job 1 件の処理順（2.4 節の `plan` が窓を返す）:

1. `plan(recent)` → 直近 30 日（ジョブの `startedAt` を日本時間の暦日にした日を終端とし、29 日前を `from`）。reconcile をページごとに呼び、削除同期まで行う。
2. fetch を繰り返す。`remaining` が 0、`retryAfterSeconds`、`dailyLimitReached` のいずれかで抜ける。後の 2 つなら job を終える。
3. `plan(backfill)` → 遡りが未完了なら次のチャンク。reconcile をページごとに呼び、最終ページで `cursor_to` が進む。fetch を繰り返す。`plan(backfill)` が null（完了）を返すまで 3 を繰り返す。
4. summary に「直近 30 日: 取得 n 件・値なし m 件・削除 d 件」「遡り: 2024-03-01 まで完了」または「遡り: 完了」を入れる。活動名や kcal は入れない。

予算の見積もり: 定期の job は 15 分の閾値（0.8）で止まるので 1 件あたり最大 80 回程度。1 日 12 件で最大 960 回、日次の閾値（900 回）で頭打ちになる。活動 3,000 件の遡りは 4 日前後で終わる。遡り完了後は直近 30 日の一覧取得（1〜2 回）と新しい活動の詳細だけになる。

### 2.3 論点 3: 削除同期との関係

- 定常は直近 30 日だけを突き合わせる。30 日より古い活動が Strava 側で削除されても反映されない。これを許容する。理由: 全期間を毎回突き合わせると一覧取得が活動数 / 100 回ずつかかり、規約 6.3 の 48 時間以内はどのみち満たさない。
- 本人が「全期間」など長い期間を表示したときは、従来の画面契機の job（`{ from, to }`）がその期間の削除同期を行う。
- 初回の遡りでは、チャンクごとの reconcile が削除同期を含むが、保存行がないので実質何もしない。これは意図した動きで、チャンクのやり直しのときだけ働く。
- 詳細取得で 404 が返った活動を消す規則は変えない。

### 2.4 論点 4: レート制限の予算

閾値は分けず、現行の 15 分 0.8・日次 0.9 のままにする。

- 余白: 15 分枠で 20 回、日次で 100 回が画面用に残る。画面の一覧取得は 1 表示あたり 1〜2 回、全期間でも 20 回程度。
- 定期の job は 15 分の閾値で待たずに終わるので、1 つの 15 分枠を使い切らない。
- 別の閾値を持つと設定が増えるだけで、必要になる証拠がない。運用で画面に 429 の表示が出るようなら再検討する。

初回の遡り中の画面: 直近 30 日は最初の定期 job で登録され、fetch は新しい順なので、既定の 7 日表示と 30 日表示は初日に埋まる。それより古い期間を表示すると「取得待ち n 件」の行と「消費カロリーを取得中（残り n 件）」が出る。`n` は表示期間内の件数（全体ではない）。数日で解消する。

API が窓を決める `plan` エンドポイント:

- `POST /api/v1/runner/strava/calories/plan`（jobId, leaseToken, phase: `recent` | `backfill`）。lease を検証してから、`recent` なら直近 30 日の `{ from, to }`、`backfill` なら状態行を読み（なければ作り）、未完了なら次のチャンクの `{ from, to }`、完了なら `null` を返す。
- Strava に未接続なら `plan` は precondition の失敗を返し、runner は `skipped_precondition` で終える（2 時間ごとに `failed` を積まないため）。
- 時刻は API（Cloudflare）の時計を使う。runner の時計で窓を決めない。

reconcile は入力に `backfill: boolean`（既定 false）を足す。true のときは窓が状態行の現在のチャンクと一致することを確認し（不一致は `conflict`）、最終ページで `cursor_to` を進める。false のときは従来どおり。

### 2.5 論点 5: 規約ドキュメントの更新

定期同期は「本人が画面を見ていなくても 2 時間ごとに Strava から取得して保存する」形で、API Policy 6.2 からさらに遠ざかる。ユーザーの判断（2026-09-13、永続保存の選択）は変わらないが、記述を正確にする。実際の書き換えは実装で行う。

| ファイル | 箇所 | 変更内容 |
| --- | --- | --- |
| `docs/strava-integration.md` | 「取得と保存」の永続保存の段落（6.3 に触れている文） | 「本人が画面を開いたときだけ同期する方式では保証できない」を「定期同期は直近 30 日だけを突き合わせるため、それより古い削除は反映されない。本人が画面を見ていなくても 2 時間ごとに取得・保存する」に書き換える |
| 同上 | 「`運動を更新` と画面表示で一覧を再取得し、…ジョブを予約する」 | 定期同期（2 時間ごと、直近 30 日、初回は下限日まで 90 日ずつ遡る）を主にし、画面表示と `運動を更新` は即時の補助として残す旨に書き換える |
| 同上 | レート制限の段落の末尾「取得待ちのまま残った行は次の表示か `運動を更新` で再開する」 | 「次の定期同期で再開する」に書き換える |
| 同上 | 削除同期の段落の末尾「表示していない期間の削除は反映されない」 | 「定期同期は直近 30 日だけを突き合わせる。それより古い削除は、本人がその期間を表示したときの同期でだけ反映される」に書き換える |
| 同上 | 「`接続を解除` は …」 | 遡りの状態行も消し、再接続後は初回からやり直す旨を加える |
| 同上 | 「設計判断と確認範囲」 | 2026-09-14 の決定（定期同期と遡り、規約との距離、schedule の登録は本人が行う）を追記する |
| `README.md` | 栄養解析の schedule 登録例の近く | `jobKind: "strava_calories_sync"`、`interval: "every_2_hours"`、`payload: {}` の登録例と「この変更だけでは本番の schedule を追加しない」を追記する |
| `docs/requirements.md` | 6.6 の Strava の項、7.6 初期の実行間隔の表 | 「Strava の消費 kcal: 2 時間ごとに直近 30 日。初回は下限日まで 90 日ずつ遡る」を追記する |
| `docs/design/calories-graph.md` | 1.5 節の「定期実行」の行、1.7 節、1.12 節 | 本書への参照に置き換える（本書の作成と同時に反映済み） |

### 2.6 スキーマ

`strava_calories_backfill`（単一行。`weight_goal` と同じ形）:

| 列 | 型 | 意味 |
| --- | --- | --- |
| `id` | integer PRIMARY KEY | 常に 1 |
| `cursor_to` | text NOT NULL | 次に遡るチャンクの終端日（日本時間の暦日）。初期値は直近 30 日の窓の `from` の前日 |
| `started_at` | text NOT NULL | 遡りを始めた日時 |
| `completed_at` | text | 下限まで遡り終えた日時。NULL なら未完了 |
| `updated_at` | text NOT NULL | 最後に `cursor_to` を進めた日時 |

- migration: `CREATE TABLE` 1 つ。既存テーブルの変更はない。
- `strava_activity_calories` は変更しない（要件 3 の一意制約はこのテーブルの PRIMARY KEY）。
- 下限日とチャンク長は列に持たず、コードの定数にする。

### 2.7 同期の状態の表示（必須）

「runner が止まっていても気づかない」への対応として、カロリー収支パネルの副題の下に 1 行出す。要件 4。

- `GET /api/v1/strava/calories/sync-status` を追加し、`strava_calories_sync` の最新の job（`status`、`at`、`errorCode`。`at` は終わっていれば `finishedAt`、実行中なら `createdAt`）と遡りの状態（`cursorTo`、`completedAt`）を返す。D1 だけを読み、Strava を呼ばない。job がなければ `lastJob` は null、状態行がなければ `backfill` は null。表示に要らない項目（遡りの `startedAt` など）は返さない。
- 最新の job は種別 `strava_calories_sync` の `createdAt` 降順の 1 件。画面契機の job も定期の job も同じ種別なので区別しない。
- 文言は `apps/web/src/features/jobs/JobProgress.tsx` の `jobStatusLabels` を正本にし、健康画面と `/operations` で同じ job を同じ語で呼ぶ。この行用の対応表を別に持たない。
- **`jobStatusLabels` の型は `Readonly<Record<JobStatus, string>>` に保つ。** `Record<string, string>` に緩めると、状態の候補を足したときのラベルの書き忘れが型検査を素通りし、利用側の `?? job.status` で英語の内部識別子が画面へ漏れる。`JobStatus` で締めておけば書き忘れは型エラー（`TS2741`）になる。DTO の `status` も `string` ではなく `JobStatus` にそろえる（`packages/contracts/src/models.ts` の `Job`、`connector-schedules.ts` の `latestJob`、`apps/api/src/repositories/life-console-repository.ts` の `Job`）。
- 利用側でフォールバック（`?? job.status`）を書かない。書くと上の担保が意味を失う。英語が画面に出る経路は `failed` の `errorCode` だけにする。
- 経緯の記録（2026-09-14）: `jobStatusLabels` を正本にする案は、当時の型が `Record<string, string>` でフォールバック付きだったため「網羅性が型で保証されない」と一度否定し、この行専用の `switch` に置き換えた。その後、型を `Record<JobStatus, string>` に締めれば同じ担保が得られ、`/operations` と同じ語を使う利点も保てると分かり、正本に戻した。「一貫性か網羅性か」の二者択一ではなく、型の緩さの問題だった。同じ検討が起きたら、先に型を締める選択肢を確認する。
- 括弧書きは `failed` の `errorCode` だけ。理由が状況で変わる `skipped_precondition` には付けない（この行は接続済みのときにしか出ないので、「Strava 未接続」のような理由は表示された時点で嘘になる）。`expired` / `lost` の説明はリンク先の `/operations` で読む。
- 表示の文言（時刻は `at` を日本時間で。語は `jobStatusLabels`、下の表は組み立て方の例）:

| job の状態 | 表示 |
| --- | --- |
| `succeeded` | 「最後の同期: 9/14 06:12 完了」 |
| `failed` | 「最後の同期: 9/14 04:10 失敗（unknown_job_kind）」。`errorCode` をそのまま添える |
| `canceled` | 「最後の同期: 9/14 04:10 中止」 |
| `expired` | 「最後の同期: 9/14 04:10 期限切れ」 |
| `lost` | 「最後の同期: 9/14 04:10 結果不明」 |
| `skipped_precondition` | 「最後の同期: 9/14 04:10 前提条件待ち」 |
| `queued` / `claimed` / `running` / `waiting_for_user` | 「同期: 実行待ち（9/14 06:00 に予約）」のように、`activeJobStatuses` で未完了を判定し、状態ごとの語（実行待ち / 開始準備 / 実行中 / 確認待ち）と予約時刻を出す。runner が止まると「実行待ち」のまま時刻が古くなるので気づける |
| job なし | 「まだ同期していません」 |

- 遡りの進捗は同じ行に続けて出す: 「遡り: 2024-03-01 まで完了」（`cursorTo` の翌日を表示。runner の summary と同じ日付になる）、完了後は「遡り: 完了」、状態行がなければ出さない。
- `failed` / `expired` / `lost` のときは `FormError` ではなく注記の文字色で出し、`/operations` へのリンク「実行状況を見る」を添える。
- Strava 未設定・未接続なら出さない。
- Web は Strava に接続済み（`strava.connected`）なら読む。D1 だけを読むので一覧の取得完了を待たない。取得待ちがある間の再取得と同じ間隔で更新し、画面を開いたまま同期が進んでも行が追随するようにする。

## 3. 触るファイルと作業

| ファイル | 作業 |
| --- | --- |
| `packages/domain/src/index.ts` | `scheduleIntervals` に `"every_2_hours"` を追加。触る箇所は下の一覧のとおり |
| `packages/db/src/schema.ts`、`migrations/` | `stravaCaloriesBackfill` テーブルを追加し、`pnpm --filter @life-console/db generate` で SQL と `meta/` を生成。`pnpm migrations:check` を通す |
| `packages/contracts/src/strava.ts` | `stravaCaloriesSyncPayloadSchema` を `{ from, to }` と `{}`（strict）の union にする。`stravaCaloriesPlanSchema`（jobId, leaseToken, phase）と結果型 `{ from, to } \| null`。`stravaCaloriesReconcileSchema` に `backfill: z.boolean().default(false)`。`StravaCaloriesSyncStatus`（2.7 節の項目） |
| `apps/api/src/repositories/d1-life-console-repository.ts` | 次回時刻の CASE 式 2 箇所に `every_2_hours` → `'+2 hours'` を追加 |
| `apps/api/src/repositories/strava-calories-repository.ts` | 遡りの状態: `readBackfill()`、`startBackfill(cursorTo, now)`、`advanceBackfill(cursorTo, now)`、`completeBackfill(now)`、`deleteBackfill()`。`cursor_to` の更新は `update().where(eq(cursorTo, 現在値))` で同じ文に保ち、二重に進めない |
| `apps/api/src/usecases/strava-usecase.ts` | `planCalories(input)`（2.4 節）。`reconcileCalories` に `backfill` の分岐（窓の一致確認と最終ページでの `advanceBackfill` / `completeBackfill`）。`disconnect` で `deleteBackfill`。直近 30 日の窓とチャンクの計算は日本時間の暦日で行い、`weightCalendarDate` と同じ境界を使う |
| `apps/api/src/app.ts` | `POST /api/v1/runner/strava/calories/plan`、`GET /api/v1/strava/calories/sync-status` |
| `apps/api/src/repositories/life-console-repository.ts`、`d1-life-console-repository.ts` | 種別を指定して最新の job を 1 件読む query（`findLatestJobByKind`）。既存の job 一覧の query があれば流用する |
| `apps/runner/src/repositories/api-repository.ts` | `planStravaCalories(input, signal)` |
| `apps/runner/src/usecases/job-executor-usecase.ts` | payload が `{}` のときの流れ（2.2 節の処理順）。`retryAfterSeconds` で待たずに `succeeded`。`plan` の precondition 失敗で `skipped_precondition`。payload が `{ from, to }` のときは従来どおり |
| `apps/web/src/pages/operations/ConnectorSchedules.tsx` | `intervalLabels` に `every_2_hours: "2 時間ごと"` |
| `apps/web/src/api.ts`、`queries.ts`、`HealthPage.tsx`、`DailyCalorieBalanceList.tsx`、`.stories.tsx` | `stravaSyncStatusQuery`（`strava.complete` のときだけ有効）と同期の状態の 1 行。stories に成功・失敗・実行中・未同期・遡り中の状態 |
| ドキュメント | 2.5 節の表 |

### 3.1 `scheduleIntervals` に値を足すときに触る箇所

候補値は `packages/domain` が正本だが、次回時刻の計算とラベルは値ごとに書かれている。1 つでも漏れると、次回時刻が CASE 式の `else`（7 日後）に落ちる、`nextRun` の表引きが `undefined` になる、UI の型検査が失敗する、のいずれかが起きる。実装時の型検査で 4 つ目の漏れが見つかった（2026-09-14）。

| 箇所 | 内容 |
| --- | --- |
| `packages/domain/src/index.ts` | `scheduleIntervals` の候補値 |
| `apps/api/src/repositories/d1-life-console-repository.ts` | 到来した期間を数える CASE 式（`nextPeriod`）と、次回時刻を進める CASE 式（`futureRuns`）の 2 箇所 |
| `apps/api/src/usecases/connector-schedule-usecase.ts` | `nextRun` の interval → 時間数の表 |
| `apps/web/src/pages/operations/ConnectorSchedules.tsx` | `intervalLabels`。選択肢はこの表から生成されるので、連絡の定期実行にも新しい値が現れる |
| ドキュメント | 候補値を列挙している箇所: `docs/weight-obsidian-export.md`（`interval` は …）、`README.md` の連絡の定期実行（1 時間・1 日・1 週間ごと）、`docs/requirements.md` 7.2（毎時・毎日・毎週） |

`apps/api/src/repositories/connector-schedule-repository.ts` は渡された `nextRunAt` を保存するだけで、値ごとの分岐を持たない。

## 4. テストの観点

「詳細取得は 1 活動 1 回だけ」を定期実行で固定するもの（`tests/strava-calories-storage.test.ts` に追加。架空の Strava 応答で `activityDetail` の呼び出し回数を数える）:

- 直近 30 日の reconcile で `measured` / `unavailable` の行が一覧に再び現れても、`status`・`calories_kcal`・`fetched_at` が変わらず `seen_at` だけ進み、`listPendingActivityIds` に出ない。
- 同じ活動を含む定期 job（payload `{}`）を 2 回続けて実行しても、`activityDetail` は活動ごとに 1 回しか呼ばれず、2 回目の summary は取得 0 件になる。
- 遡りのチャンクを途中で打ち切って再実行しても、既に `measured` の活動を再取得しない。
- 画面契機の job（`{ from, to }`）と定期の job が同じ活動を対象にしても、詳細取得は 1 回。

定期同期と遡り:

- `plan(recent)` はジョブの `startedAt` を日本時間にした日を終端とする 30 日を返し、runner の時計に依存しない。
- 状態行がなければ `plan(backfill)` が作り、`cursor_to` は直近 30 日の `from` の前日。返る最初のチャンクはそこから 89 日前まで。
- `backfill: true` の reconcile は最終ページでだけ `cursor_to` を進め、途中のページでは進めない。窓が現在のチャンクと違えば `conflict`。
- `cursor_to` が下限より前になったら `completed_at` が入り、`plan(backfill)` は null を返す。
- Strava 未接続なら `plan` は precondition の失敗で、Strava を呼ばない。
- 接続解除で状態行が消える。
- schedule の展開: `every_2_hours` の次回時刻が 2 時間後になる（既存の schedule の storage テストに追加）。`skip_if_pending` で同じ schedule の未完了 job があれば積まれない。
- 画面契機の `createJobUnlessActive` は、定期の job が queued / running の間は積まない。

runner（`apps/runner/src/usecases/strava-calories-job.test.ts` に追加）:

- payload `{}` で plan(recent) → reconcile → fetch → plan(backfill) → reconcile → fetch の順に呼び、plan が null を返したら `succeeded`。
- `retryAfterSeconds` を受けたら待たずに `succeeded`。`dailyLimitReached` でも `succeeded`。summary に遡りの進捗が入り、活動名や kcal は入らない。
- plan の precondition 失敗で `skipped_precondition`。
- payload `{ from, to }` の従来の流れが変わらない。

同期の状態（`tests/strava-calories-storage.test.ts` と部品の stories）:

- `GET /api/v1/strava/calories/sync-status` は job がなければ job の項目を null で返し、あれば種別 `strava_calories_sync` の最新 1 件を返す。他の種別の job は返さない。Strava を呼ばない。
- 遡りの状態行の有無で遡りの項目が null / 値になる。
- stories: 成功、失敗（`errorCode` 付きと `/operations` へのリンク）、実行中、未同期、遡り中、未接続では出ないこと。

## 5. 検証

[calories-graph-verification.md](calories-graph-verification.md) の 1.6 節（レビュー観点）と 2.4 節（手順）に追記した。
