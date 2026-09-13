# カロリー収支グラフのレビュー観点と動作確認手順

作成日: 2026-09-13。対象の設計は [calories-graph.md](calories-graph.md)。実行者は実装を受け取ったレビュー担当で、本書は手順の設計である。

一般的な観点（差分の読み方、Result の失敗伝達、lint、ライト・ダーク・狭い画面の基本確認など）は [self-review](../../.agents/skills/self-review/SKILL.md)、[verify-implementation](../../.agents/skills/verify-implementation/SKILL.md)、`AGENTS.md` の Code Review Rules に任せ、ここではこの機能に特有のリスクだけを扱う。

## 0. 実行前の確認

- 実装の完了報告に「設計と実コードが食い違った点」があれば先に読み、本書の該当箇所（story 名、関数名、エンドポイント名、文言）を実コードに読み替える。本書の名前は設計ドキュメント 3 章の想定であり、実装が別名を付けていれば該当する状態のものを探す。
- 対象は実装ブランチの worktree。`pnpm install --frozen-lockfile` 済みで `node_modules` があること。
- 1 層目（Storybook）と 2 層目（ローカルアプリ）はローカルだけで完結し、外部サービスも本番も触らない。3 層目（実データ）は Strava の実アカウントと runner の実ジョブを使うので、着手前にユーザーの許可を取る（3 章の冒頭）。
- 報告に実データ（活動名、実測 kcal、食事メモ）を転記しない。件数と合否、架空データの例だけを書く。

## 1. レビュー観点

各行は「何を見るか」「正しい状態」「不合格の例」。根拠の節番号は設計ドキュメントのもの。

### 1.1 収支の判定ロジック

| 観点 | 何を見るか | 正しい状態 | 不合格の例 |
| --- | --- | --- | --- |
| 符号確定の非対称（1.9 節） | `calorie-balance.ts` の `signKnown` を決める条件と、そのテスト | 収支 < 0 の符号確定は「取得待ちの活動がない」ことだけを要求し、摂取の未記録は要求しない。収支 ≥ 0 の符号確定は「摂取が全件記録済み」だけを要求し、取得待ちは要求しない | 負のときに「摂取全件」を要求している。正のときに「取得待ちなし」を要求している。どちらの符号でも両方を要求している（全部未確定になる）。負なのに取得待ちがあっても確定している |
| 額確定（1.9 節） | 同上の `amountKnown` | 「摂取が全件記録済み かつ 取得待ちの活動がない」のときだけ true | 片方だけで true。`unavailable` があると false になる |
| 算入外は確定を妨げない（1.6 節、1.9 節） | `unavailableActivities` の使われ方 | 合計に含めず、`signKnown` / `amountKnown` の判定に使わず、件数の注記だけに使う | `unavailable` を取得待ちと同じ扱いにして確定を止めている。逆に 0 kcal の実測として合計している |
| 収支の式（1.2 節） | 収支の計算箇所 | `基準消費量 + 運動の実測合計 − 摂取`。テストに `1,500 + 500 − 1,900 = +100` がある | 符号が逆。運動を引いている。基準消費量を含めていない |
| 未記録の食事だけの日（1.9 節） | `recordedMeals === 0` かつ `totalMeals > 0` の分岐 | 摂取 0 として「目標内」に見せない。収支は「未記録あり」の規則（正でも符号未確定） | 「0 kcal」「+1,500」として貯金で確定表示している |
| 記録なしの日（1.9 節） | `totalMeals === 0` の分岐 | 収支を計算せず「食事の記録なし」。運動があれば運動の値だけ出す | 摂取 0 で収支を計算している。運動だけの日を空白期間にまとめている |
| 日本時間の境界 | 摂取の期間絞り込みと運動の日別集計の日付関数 | どちらも `weightCalendarDate`（+09:00）で日付を決め、`summarizeDailyNutrition` と同じ日になる。API の `GET /api/v1/strava/calories` と削除同期の期間境界も `listMeals` と同じ +09:00 の暦日 | 運動を UTC の日付で集計している。API が `occurred_at` を文字列比較で UTC の日付で絞っている |
| 基準消費量未設定（1.9 節） | `baselineKcal === null` の分岐と部品 | 収支の棒・数値を描かず、摂取と運動の数値だけを出し、「基準消費量を設定」を出す | 基準 0 として収支を描いている（全日が超過になる） |
| 運動を含めない収支（1.10 節） | `ExerciseInput` が `untracked` のときの計算と部品の注記 | `基準消費量 − 摂取` で描き、パネルに「Strava 未接続のため、運動を含めていません」が常に出る。判定は摂取だけで決まる | 注記なしで描いている。未接続を「取得中」と同じ扱いにして収支を隠している |

### 1.2 0 kcal 化の禁止（`docs/requirements.md` 6.7 の原則）

| 観点 | 何を見るか | 正しい状態 | 不合格の例 |
| --- | --- | --- | --- |
| 一覧の取得中・失敗（1.10 節） | `HealthPage` で `ExerciseInput` を組み立てる箇所 | `strava.complete` でないときは `undefined` を渡し、収支を描かない | 取得中に空の Map を `tracked` として渡している（運動 0 で収支が出る） |
| 取得待ち（1.9 節） | `exerciseCaloriesByDay` と行の表示 | `pending` と「D1 に行がない活動」を取得待ちに数え、kcal に加えない。行に「取得待ち n 件」が出る | 行がない活動を 0 kcal として無視している。`pending` の `calories_kcal` を NULL → 0 で足している |
| 算入外 | 同上 | kcal に加えず「算入外 n 件」 | 0 kcal として合計している |
| 未記録の食事 | `summarizeDailyNutrition` の利用 | 既存関数をそのまま使い、未記録は合計に入れない | 独自に集計し直して `estimate === null` を 0 にしている |

### 1.3 取得と保存

| 観点 | 何を見るか | 正しい状態 | 不合格の例 |
| --- | --- | --- | --- |
| lease の検証順序（1.5 節） | `strava-usecase.ts` の reconcile / fetch | Strava を呼ぶ前に `jobs` の `leaseToken` 一致・`status = running`・`leaseExpiresAt > now` を確認し、不一致なら Strava を呼ばずに `conflict` を返す。storage テストに「失効した lease は Strava を呼ばない」がある | 検証が Strava 呼び出しの後にある。検証がない。`status` を見ていない（完了済みジョブの token で呼べる） |
| レート制限の閾値（1.5 節） | `strava-api-repository.ts` のヘッダー読み取りと、fetch の中断条件 | 15 分・日次の使用量をヘッダーから読み、閾値（定数）に達したら中断して `retryAfterSeconds` または `dailyLimitReached` を返す。閾値は上限より小さい。ヘッダー名の出典が [Rate Limits](https://developers.strava.com/docs/rate-limits/) と一致する | ヘッダーを読まず件数だけで制御している。閾値が上限と同じ（画面の一覧取得の分が入らない）。`retryAfterSeconds` が固定値で 15 分境界を見ていない |
| 429 の扱い（1.5 節） | `app-error.ts` の `rate_limited`、`send` の 429 分岐、fetch の失敗分類 | 429 は `rate_limited` で返り、fetch は当該行を `pending` のまま残し、`failed` に数えず、中断して `retryAfterSeconds` を返す。一覧取得の利用者向けメッセージは変わっていない | 429 を `upstream_error` のまま扱い、行を `failed` に数えて進捗なしで `failed` にしている。429 の行を `unavailable` にしている |
| 上限を超えて叩く経路がないか | reconcile のページループ、fetch の K、`GET /api/v1/strava/calories`、Web の `stravaCaloriesQuery` | 1 回の fetch は定数 K 件。reconcile は 1 呼び出し 1 ページ。`GET /api/v1/strava/calories` は D1 だけを読む。Web の再取得は D1 の API に対してだけで、一覧の Query（`gcTime: 0`）は変えていない | 1 回の fetch で `pending` 全件を取りに行く。`GET /api/v1/strava/calories` が Strava を呼ぶ。一覧の Query に `refetchInterval` を付けた。K が Workers Free の subrequest 上限（[limits](https://developers.cloudflare.com/workers/platform/limits/)）に近い |
| ジョブの冪等性（1.5 節） | `createJobUnlessActive` の SQL と `activities` の予約条件 | 同種の未完了（queued / claimed / running / waiting_for_user）ジョブが 1 件でもあれば挿入しない判定が `insert().select()` の 1 文にある。完了後は再予約できる。`idempotencyKey` は作成ごとの一意値 | 事前 SELECT と INSERT に分かれている（同時リクエストで 2 件積める）。`idempotencyKey` を期間で固定している（完了後に再予約できない）。新規登録がなくても毎回予約している |
| 再取得の防止（1.4 節） | `listPending` と `registerOrTouch` | 取得対象は `status = pending` だけ。既存 ID は挿入せず `seen_at` だけ更新する | `measured` を再取得している。既存 ID を `pending` に戻している |
| 削除同期の範囲（1.7 節） | reconcile の削除条件。実装がページ単位（`seen_at` とジョブの `startedAt` で判定）か 1 回呼び（期間の全ページを取ってから ID 集合で判定）かを先に確認する | 削除対象は「payload の期間内」かつ「今回取得した一覧に現れなかった行」だけ。期間の全ページを読み終える前に削除しない。一覧取得（どのページでも）に失敗したら削除も登録もしない。今回登録した `pending` 行は消えない | 期間の条件がない（別期間の行が消える）。ページごとに削除している（後のページに現れる行が消える）。一覧取得の失敗時に削除している。`registered_at` や取得順で判定して今回登録した行を消している |
| reconcile の subrequest（1.5 節） | reconcile が 1 回の API 呼び出しで期間の全ページを取る実装の場合、そのループ | 1 リクエスト内の Strava 呼び出し回数が Workers Free の subrequest 上限（[limits](https://developers.cloudflare.com/workers/platform/limits/)）を「全期間」表示の活動数（100 件 / ページ）でも超えない。超えうるなら runner がページを進める形になっている | 全期間（数十ページ）で上限を超えて Worker がエラーになる経路が残っている |
| 404 の扱い | fetch の 404 分岐 | 当該行を削除し、`deleted` に数える | `failed` に数えて `pending` のまま残す。`unavailable` にする |
| 接続解除（1.7 節） | `disconnect` | revoke が成功した後に `deleteAll`。revoke 失敗時は認証情報も保存行も残す | revoke 前に消している。消していない |
| 保存する Strava Data の最小化（1.4 節） | `schema.ts` の `strava_activity_calories` の列 | `activity_id`, `occurred_at`, `status`, `calories_kcal`, `registered_at`, `fetched_at`（ページ単位の reconcile なら `seen_at` も）の範囲。名前・種目・距離・時間・心拍を保存していない | 活動名や種目を保存している。JSON で活動全体を保存している |
| `calories` が取れない活動（1.6 節） | `activityDetail` の schema と `unavailable` の判定 | 省略・null は `unavailable`。0 かつ `moving_time > 0` も `unavailable`（仮の規則）。実データでの確認結果が完了報告か設計ドキュメントに残っている | 省略を 0 kcal の実測として保存している。仮の規則を確認せず確定として書いている |
| runner の中止と待機（1.5 節） | `job-executor-usecase.ts` の新しい case | 各 API 呼び出しの間で `signal.aborted` を見て `canceled` を返す。`retryAfterSeconds` の待機中も中止できる。待機の上限が定数で 15 分境界を超えない。`dailyLimitReached` は `succeeded`（summary に残り件数）。進捗なしの失敗だけ `failed` | 待機中に `signal` を見ない。`dailyLimitReached` を `failed` にしている。summary に活動名や kcal の一覧を入れている |
| 定期スケジュールと自動リトライ（1.5 節） | `schedules` への登録、seed、runner のリトライ | 追加していない | schedule を seed や migration に足している。`attempt` を増やす独自のリトライを書いている |
| ログ | 新しい `logger` 呼び出し | 活動 ID・kcal・活動名を新しいログ項目として出していない | 取得した kcal や活動名を info ログに出している |

### 1.4 ドキュメントとコメント

| 観点 | 何を見るか | 正しい状態 | 不合格の例 |
| --- | --- | --- | --- |
| 規約に反する選択の記録（1.3 節） | `docs/strava-integration.md`、`README.md`、`docs/requirements.md` の差分 | 設計ドキュメント 1.3 節の表に挙げた箇所がすべて書き換わり、「6.2 / 5.5 / 6.3 に反する選択で、本人専用・外部非公開を前提にユーザーが 2026-09-13 に選択した」趣旨が `docs/strava-integration.md` にある。「運動データは D1・ファイル・ブラウザの永続ストレージへ保存しない」の文が残っていない | ドキュメントが未更新で「保存しない」と書いたまま。規約の記述がコードのコメントにだけある |
| コメントの内容（`AGENTS.md`） | 新規ファイルのコメント | 現在形の制約・不変条件だけ（例: lease 検証を Strava 呼び出しの前に置く理由）。経緯（「規約に反するがユーザーが選んだ」「以前は保存していなかった」）は書かない | 「ユーザーの判断で永続保存に変更」「MET 案から変更」などの経緯がコメントにある |
| 数値の複製 | ドキュメントとコメント | 閾値・K・再取得間隔などの定数値をコメントやドキュメントに複製していない | 「20 件ずつ」「10 秒ごと」がコメントに書かれている |

### 1.5 UI と既存機能

| 観点 | 何を見るか | 正しい状態 | 不合格の例 |
| --- | --- | --- | --- |
| 色だけに頼らない（2.1 節） | `DailyCalorieBalanceList` | 符号は数値の `+` / `−` と「超過」の語でも分かる。棒は `aria-hidden` で、数値と内訳はテキスト。実際の `<table>` | 棒の色だけで超過を表している。`div` の羅列で表の意味がない |
| 破線の意味（1.9 節） | 同上 | 符号だけ確定は色付きの破線、符号も未確定は灰色の破線。凡例に「未確定」がある | 未確定を通常の塗りで描いている |
| 数値と棒の重なり（2.1 節） | 棒の幅の上限と、摂取・運動の数値の配置 | 摂取と運動の数値は棒トラックの左右端に絶対配置され、棒の最大幅は数値の手前で止まる。収支が `±scale` ちょうどの日（例: +500 でスケール 500）でも棒が数値に重ならない。390 px でも同じ | 棒が数値の上に重なる。数値が棒に押されて折り返す。数値のために列を増やして棒の幅が削られている |
| 運動の列が空になる条件（2.1 節） | 運動の数値を出す条件 | 実測の値があるときだけ `+320` の形で出す。活動なし・取得待ち・算入外・`untracked` は空。`…` や `—` を出さない | 取得待ちを `…`、算入外を `—` で表している。`0` や `+0` を出している |
| 摂取の列（2.1 節） | 摂取の数値を出す条件 | `totalMeals === 0` の日だけ `—`。全件が未記録の日（`recordedMeals === 0` かつ `totalMeals > 0`）は空で、0 を出さない | 全件未記録の日に `0` が出る。記録なしの日に `—` がない |
| 語の配置（2.1 節） | ヘッダーと各行の文言 | ヘッダーは「摂取」「0」「運動」「収支」。行内に「摂取」「運動」の語が出ない。「消費」を使わない（副題の「基準消費量」と混同する）。`−500 / +500` の目盛りの数値がない | 行内に「摂取 1,703」「運動 +320」が残る。ヘッダーが「消費」になっている。目盛りの数値が残っている |
| 副行の条件（2.1 節） | 副行の生成条件 | 状態（未記録・取得待ち・算入外）か「食事の記録なし」があるときだけ副行を出す。状態がない行は 1 行で、空の要素を残さない | 状態のない行に空の `<p>` が残る。副行に摂取や運動の数値が出る |
| 読み上げ用の文（2.1 節） | 各行の `sr-only` の文 | 各日の行に「摂取 n kcal、運動 n kcal、収支 …」と状態を含む文があり、視覚の数値と一致する。棒と絶対配置の数値は `aria-hidden` で、読み上げに二重に出ない | `sr-only` の文がない、または視覚の数値と食い違う。絶対配置の数値が読み上げにも出て重複する |
| 空白期間のまとめ（2.1 節） | `calorieBalanceRows` の `gap` | 食事も運動もない日が 2 日以上連続したときだけ 1 行にまとめる。運動だけある日はまとめない。`untracked` / `undefined` では食事の有無だけで判定する | 運動だけの日が消える。1 日でもまとめている |
| 期間の連動（1.11 節） | `HealthPage` | 既存の `periodFrom` / `periodTo` を使う。カロリー用の期間状態を追加していない。`entry=baseline` が URL に乗り、既存の `entry` の値と排他になっている | 独自の期間状態や `useState` の期間がある。`entry` を使わずローカル状態で開閉している |
| 配置 | 同上 | 体重セクションの直後、「この期間の運動」の前 | 食事パネルの中や末尾にある |
| suspense query の追加 | `router.tsx`、`HealthPage.test.tsx`、`HealthPage.stories.tsx` の `handlers()` | loader の `ensureQueryData`、テストの `setQueryData`、全 story 共通の MSW handler がそろっている | どれかが欠けて既存 story が待ち続ける、または既存テストが失敗する |
| 再取得間隔 | `queries.ts` | `nutritionQuery` の間隔は変えていない。`stravaCaloriesQuery` の `refetchInterval` は `pending` があるときだけ有効になる関数 | 常時再取得している。`nutritionQuery` の間隔を変えた |
| 既存の Strava story | `StravaActivities.stories.tsx`、`HealthPage.stories.tsx` の既存 story | handler の追加以外の変更がない | 既存 story の期待値を変えている |
| migration | `packages/db/migrations` の新規 SQL と `meta/` | 新規テーブル 2 つと索引 1 つだけ。既存テーブルの変更がない。`pnpm migrations:check` が通る | 既存テーブルへの列追加がある。`meta/` の更新が欠けている |

## 2. 動作確認手順

各手順は「操作」→「期待する結果」。期待する結果が出なければ不合格として、再現条件と画面の状態を記録する。

### 2.1 Storybook（ユーザーもブラウザで見る）

起動: `pnpm storybook` → <http://localhost:6006>。テーマの切り替えは toolbar の theme、幅は toolbar の viewport（既存の `weightMobile` 412 px か、story の decorator の 390 px）。

| 順 | story（該当する状態のもの） | 見るもの | 期待する結果 |
| --- | --- | --- | --- |
| 1 | 部品「貯金と超過の日がある」 | 行の構成 | ヘッダーが「日付」「摂取」「0」「運動」「収支」で、`−500 / +500` の目盛りがない。新しい日が上。9/13 は棒トラックの左端に「1,703」、右向きの棒、右端に「+320」、収支「+117」で副行なし。9/10 は「1,902」、左向きの赤い棒、「+180」、収支「超過 −222」で副行なし。9/8 は「1,900」「+500」「+100」（`1,500 + 500 − 1,900`）。9/9 は摂取「—」、棒なし、右端「+410」、収支「—」、副行「食事の記録なし」。9/2〜9/7 は「食事と運動の記録なし（6 日）」の 1 行。行内に「摂取」「運動」の語が出ない。中央のゼロ線が全行でつながって見える。凡例と「Powered by Strava」がある |
| 2 | 同上 | 9/12 の行 | 左端「1,082」、灰色の破線、右端が空（取得待ちを `…` などで表さない）、収支「未確定」、副行「未記録 1 件・取得待ち 1 件」。貯金の色になっていない |
| 3 | 同上 | 9/11 の行 | 「1,345」、通常色（確定）の棒、右端が空、「+155」、副行「算入外 1 件」。破線ではない |
| 4 | 部品「符号だけ確定した日」 | 破線の色 | 負で未記録ありの行が赤の破線・「超過 −222 以下」・副行「未記録 1 件」。正で取得待ちありの行が通常色の破線・「+155 以上」・副行「取得待ち 1 件」で、右端の運動は空 |
| 5 | 部品「基準消費量が未設定」 | 収支の有無 | 収支の棒と数値がない。摂取と運動の数値は左右端に出る。「基準消費量を設定」ボタンがある |
| 6 | 部品「運動を含めない収支」 | 注記と値 | 「Strava 未接続のため、運動を含めていません」があり、運動の列がすべて空で、9/13 の収支が `1,500 − 1,703 = −203` の超過になっている |
| 7 | 部品「一覧を取得中」「一覧の取得失敗」 | 収支の有無 | 収支の棒と収支の数値がなく、摂取の数値は左端に出る。取得中は `role="status"` の文、失敗は注記の文 |
| 8 | 部品「取得待ちがある期間」 | パネルの status | 「消費カロリーを取得中（残り 1 件）。Mac の runner が順に取得します」 |
| 9 | 部品「カロリーの読み込み中」「取得失敗」 | 文言 | `role="status"` / `role="alert"` の文が出て、棒は出ない |
| 10 | 部品の各 story を theme = dark で | 色の区別 | 貯金（primary）と超過（destructive）が区別でき、破線と灰色が背景に埋もれない。ゼロ線と絶対配置の数値が見える |
| 11 | 部品「モバイル」（390 px） | 折り返しと重なり | 摂取・運動の数値が棒トラックの中に収まり、棒と重ならず折り返さない。状態のある行だけ 2 行になる。「超過 −222」「未記録 1 件」が切れない。横スクロールが出ない。ヘッダーの「摂取」「運動」が切れない |
| 11b | 部品「貯金と超過の日がある」の DOM（devtools か play の `getByText`） | 読み上げ用の文 | 各日の行に `sr-only` の文（例: 「摂取 1,703 kcal、運動 320 kcal、収支 +117 kcal」）があり、視覚の数値と一致する。棒と絶対配置の数値は `aria-hidden` |
| 12 | ページ「URL から基準消費量を開く」 | 保存と復元 | `?entry=baseline` でダイアログが開く。1500 を保存すると閉じ、副題が「基準消費量 1,500 kcal・…」になる。再度開くと 1500 が入っている。「解除」で副題が「基準消費量が未設定・…」に戻り、ボタンが「基準消費量を設定」になる |
| 13 | ページ「基準消費量の保存失敗」 | エラー表示 | `role="alert"` にサーバーのメッセージが出て、入力値が残る |
| 14 | ページ「摂取と運動を同じ期間で見る」 | 統合 | 収支の行に「+100」「超過」が見える。期間ボタン（30 日 / 直近 90 日）で行が変わる |
| 15 | ページ「取得待ちが埋まる」 | 再取得 | 最初「取得待ち 1 件」の副行があり右端が空の行が、しばらくして右端に運動の値が出て副行が消え、破線が消えて確定表示になる。パネルの status も消える |
| 16 | `pnpm storybook:test` | ブラウザテスト | すべて pass。新規 story の play とアクセシビリティ検査が含まれている |

### 2.2 ローカルアプリ（API をまたぐ経路）

前提: 5173 / 8788 を使う既存プロセスがないことを確認する。Strava の環境変数は不要（この層では未接続の状態を使う）。

| 順 | 操作 | 期待する結果 |
| --- | --- | --- |
| 1 | `pnpm local:setup` | Web のビルド、migration の適用、seed が成功する。出力に新しい migration（`calorie_baseline` と `strava_activity_calories` を作るもの）の適用が含まれる |
| 2 | ローカル D1 にテーブルがあることを確認する。例: `seed:local` と同じ形で `wrangler d1 execute life-console-local --local --config apps/api/wrangler.jsonc --command "SELECT name FROM sqlite_master WHERE name IN ('calorie_baseline','strava_activity_calories')"`（`packages/db` から実行する場合は `--config ../../apps/api/wrangler.jsonc`） | 2 行返る |
| 3 | `pnpm dev` → <http://localhost:5173/health> | 体重セクションの直後に「カロリー収支」パネルがあり、副題が「基準消費量が未設定・…」、ボタンが「基準消費量を設定」。「この期間の運動」パネルは Strava 未設定の表示のまま |
| 4 | 「基準消費量を設定」→ 1500 → 保存 | URL に `entry=baseline` が付き、保存後に外れる。副題が「基準消費量 1,500 kcal・…」。ページを再読み込みしても保たれる。`curl http://localhost:8788/api/v1/calorie-baseline` が `{"data":{"dailyExpenditureKcal":1500}}` を返す |
| 5 | 同じダイアログで 0、小数、空を保存 | 保存されず `role="alert"` のエラー。`curl` の値は 1500 のまま |
| 6 | 「食事を記録」で今日の食事をカロリー 1900 の手入力で保存 | 今日の行が現れ、左端に「1,900」、運動の列は空。Strava 未設定なので「運動を含めない収支」の注記があり、収支は `1,500 − 1,900 = −400` の超過（赤、左向き、確定）。副行はない |
| 7 | 「食事を記録」でメモだけ（カロリーなし、写真なし）の食事を今日に追加 | 今日の行が赤の破線になり、副行に「未記録 1 件」（負の符号は確定、額は未確定）。左端の摂取は 1,900 のまま。`MealGallery` の日別表の「記録済み 1 / 2 件」と一致する |
| 8 | 一覧からその食事を開き、カロリー 0 を保存 | 破線が消え、確定表示に戻る（0 kcal は記録済み）。収支は −400 のまま |
| 9 | 「食事を記録」で昨日の食事をカロリー 1000 で保存（日時を昨日にする） | 昨日の行が現れ、`1,500 − 1,000 = +500` の貯金（右向き、確定）。今日と昨日の間に空白行はない |
| 10 | 日付の境界: 日本時間 23:30 と翌 0:30 の食事を記録する | それぞれ別の日の行に入る。`MealGallery` の日別表と同じ日付になる |
| 11 | 期間ボタンで 30 日 → 直近 90 日 → 全期間 | 行の範囲が変わる。食事も運動もない連続日は「記録なし（n 日）」の 1 行にまとまる。URL の `range` / `from` / `to` が変わり、再読み込みで復元される |
| 12 | 解除 → 「基準消費量を設定」に戻す | 収支の棒と数値が消え、摂取の数値だけ残る |
| 13 | <http://localhost:5173/operations> | 実行状況が表示され、ジョブ種別に `strava_calories_sync` 用の表示名がある（実装がラベルを持つ場合）。未接続なのでジョブは 0 件 |
| 14 | `pnpm exec vitest run tests/calorie-baseline-storage.test.ts tests/strava-calories-storage.test.ts apps/api/src/repositories/strava-api-repository.test.ts apps/runner/src/usecases/strava-calories-job.test.ts apps/web/src/pages/health/calorie-balance.test.ts apps/web/src/pages/health/exercise-calories.test.ts`（実装のファイル名に読み替える） | すべて pass。1.3 節の観点（lease 検証順、429、削除同期の範囲、冪等性、接続解除）に対応するテストがあることを目視で確認する |
| 15 | `pnpm --filter @life-console/runner build` | 成功する |
| 16 | `pnpm check` | 成功する。失敗したら原因と対象を記録する |

runner はこの層では起動しない（Strava 未接続ではジョブが作られない）。3 層目で使う。

### 2.3 実データ（ユーザーの許可が要る）

この層は Strava の実アカウントの認可、Strava API の読み取り予算の消費、runner の実ジョブ実行、Strava 側での活動の削除を伴う。着手前に次を 1 つずつユーザーに確認し、許可された範囲だけ実行する。

| 許可が要る操作 | 理由 |
| --- | --- |
| `apps/api/.dev.vars` に Strava の 4 項目（`docs/strava-integration.md` の表）を用意して API を起動する | 本人の Client Secret と暗号鍵を使う。値を読んだり転記したりしない |
| 健康画面から Strava に接続する（`activity:read_all`） | 本人アカウントの認可 |
| runner を起動して `strava_calories_sync` を実行する | Strava の読み取り予算（15 分 100 回 / 1 日 1,000 回）を消費する。期間が長いほど多い |
| 検証用の活動を Strava 側で作成・削除する（削除同期と算入外の確認） | 本人の Strava データを変更する。既存の活動を削除しない。作成した検証用の活動だけを削除する |
| 接続を解除する | 保存した消費 kcal が全件消え、再接続後に再取得が必要になる |

前提:

- 2 層目の 1〜4 が済んでいる（基準消費量 1,500）。
- runner の環境変数は `apps/runner/.env.example` と `docs/operations.md` の「Mac runner の接続」に従う。ローカル API は `APP_ENV=local` で `RUNNER_TOKEN` 未設定なら `local-runner-token` を受け付ける（`apps/api/src/app.ts` の `runnerAuthentication`）。接続先はローカルの 8788。監視対象のサービスは空にし、他の連携の CLI を呼ばない。
- D1 の行数確認は 2 層目の 2 と同じ `wrangler d1 execute … --local` で `SELECT status, COUNT(*) FROM strava_activity_calories GROUP BY status` などを実行する。

| 順 | 操作 | 期待する結果 |
| --- | --- | --- |
| 1 | API を Strava の環境変数付きで起動し、健康画面で「Connect with Strava」→ 認可 | `?strava=connected` で戻り、「この期間の運動」に活動が出る（既存機能） |
| 2 | 直後の「カロリー収支」パネル | 期間内の活動がある日の行に「運動 取得待ち n 件」が付き、パネルに「消費カロリーを取得中（残り n 件）」。負の収支の行は灰色の破線（取得待ちがあるので超過を確定しない）。正で摂取全件の行は通常色の破線 |
| 3 | D1 の `strava_activity_calories` | 期間内の活動数と同じ件数の `pending` 行。`calories_kcal` は NULL |
| 4 | `/operations` | `strava_calories_sync` が queued で 1 件。健康画面を再読み込みしても 2 件目が積まれない |
| 5 | `pnpm dev:runner:once` | runner がジョブを claim し、reconcile（実装により 1 回、またはページがなくなるまで）と fetch を呼び、`succeeded` で終わる。summary が「取得 n 件、値なし m 件、削除 d 件」の形。活動名や kcal の一覧が summary に入っていない |
| 6 | D1 | `pending` が 0 件（活動数が予算内の場合）。`measured` の行に `calories_kcal` と `fetched_at` が入っている |
| 7 | 健康画面（数十秒待つか再読み込み） | 「取得待ち n 件」の副行が消え、各行の右端に運動の値が出る。負の収支の行が赤の確定表示に変わる。パネルの status が消える |
| 8 | 任意の 2〜3 日について、行の運動の値と Strava のアプリ・Web の同じ活動の Calories を比べる | 一致する（同日に複数活動があれば合計） |
| 9 | 算入外: `calories` を持たない活動（手動入力の活動など）があるか確認する。なければユーザーの許可を得て検証用の手動活動を Strava で作成し、「運動を更新」→ `pnpm dev:runner:once` | その活動が `unavailable` になり、行に「運動 算入外 1 件」。収支は確定表示のまま。API が返した `calories` が省略・null・0 のどれだったかを記録し、設計ドキュメント 1.6 節の未確定を解消する |
| 10 | 削除同期: 9 で作成した検証用の活動をユーザーが Strava 側で削除 → 健康画面で「運動を更新」→ `pnpm dev:runner:once` | ジョブの summary に削除 1 件。D1 からその `activity_id` の行が消え、行の「算入外 1 件」が消える。他の日の行は変わらない |
| 11 | runner 停止中の表示: 別の期間（例: 全期間）を表示して新しい `pending` を作り、runner を起動しない | 「取得待ち n 件」と status が出続け、収支の判定は 2 の規則のまま。`/operations` に queued のジョブが 1 件だけ |
| 12 | レート制限（ユーザーが許可した場合のみ。予算を大きく使う）: 全期間で活動が数百件ある状態で `pnpm dev:runner:once` | ジョブが 15 分の閾値で待って続行する（heartbeat が続き、`/operations` で running のまま）。日次の閾値に達したら `succeeded` で「1 日の上限で中断。残り r 件」の summary。翌日以降の表示で再予約される。429 を意図的に起こさない（テストで確認済みとする） |
| 13 | 接続解除（ユーザーが許可した場合のみ）: 「接続を解除」 | 既存機能どおり運動データが画面から消え、D1 の `strava_activity_calories` が 0 件。再接続すると再び `pending` から始まる |

未実行の項目は報告で「ユーザーの許可待ち」「環境未整備」「実行したが不合格」を分けて書く。

## 3. 報告の形

- 1 章の観点ごとに 合格 / 不合格 / 該当なし と根拠のファイル位置。
- 2 章の各層で実行した手順の番号と結果。不合格は再現条件と画面の状態。
- 未実行の手順と理由。
- 実装が設計と食い違っていて、設計側の更新が要る点。
