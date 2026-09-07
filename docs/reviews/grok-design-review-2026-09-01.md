# Life Console 設計レビュー (Grok)

日付: 2026-09-01
対象: `docs/requirements.md`（全文）
種別: 読み取り専用。要件ファイルは未変更。
根拠: 要件本文、既存スキル（`sync-weight-trend`, `expense-reimbursement`, `register-orca-automation`, `agent-news-weekly`）、Orca CLI の Automations 節、Cloudflare / Android / PWA の公式ドキュメント。推測は「推測」と明示する。

---

## 1. 結論

Web ダッシュボードは必要。モバイル記録クライアントは Android native から始めない。最初は Web（必要ならインストール済み PWA）で、写真・メモ・体重・支出の記録と閲覧だけを載せる。

定期実行の責務分割（D1 が schedule/job の正、Cloudflare Cron は期限到来分の job 作成、launchd 常駐 Mac runner は外向き poll の executor、Orca は agent/worktree adapter、Orca Automations はダッシュボード管理ジョブのスケジューラにしない）は妥当。このまま実装してよい骨格である。足りないのは状態機械の名前ではなく、lease の fencing、Cron の catch-up、runner 認証、Mac スリープ後の二重実行、connector の watermark である。

無料・公開コード・非公開データ・本人限定という制約とも整合する。過剰なのは MVP 前の native、Workflow エンジン、agent 完了を Orca orchestration に乗せる設計。欠落は上に挙げた運用契約と、Workers Free の CPU 10ms を無視した TanStack Start SSR 前提である。

native に移る条件は「PWA で食事記録が実際に続かない」「Health Connect が体重の正になる」「ウィジェットが必要」のいずれかが実測で満たされたとき。今はそのどれも満たしていない。

---

## 2. PWA / native 比較

### 推奨

最初の記録面は PWA（実体は同一の Web アプリを Android Chrome でインストール）にする。Web ダッシュボードは別途必須。モバイル専用アプリを先に作らない。Capacitor / React Native / Play 公開も MVP ではやらない。

### Web ダッシュボードは必要か

必要。要件のホームは「今日の仕事タスク、未処理メンション、runner 異常、収支・純資産・体重、食事の短い導線」であり、agent / worktree / job 監視はデスクトップ作業が本体になる。これを最初から Android アプリに載せるコストは合わない。

分担:

- Web（デスクトップ）: タスクの正、会話の分類、runner/job 監視、agent 起動、金融・体重のグラフ、設定。
- モバイル（PWA）: 食事写真+メモ、体重の手入力、支出の短い記録、ホームの要約閲覧。編集の主戦場にしない。
- Mac runner: ローカル CLI が必要な取込と agent 実行。記録の書き込み経路には入れない。

モバイル記録まで Web に「UI を統一する」必要はない、という要件の書き方は正しい。共有すべきなのは API・スキーマ・型・冪等キーであり、画面コンポーネントではない。

### 比較（この用途に関係するものだけ）

写真撮影から登録までの操作数:

- PWA: `<input type="file" accept="image/*" capture="environment">` でカメラ起動は可能。インストール済み PWA なら Web Share Target でカメラ/ギャラリーから共有して受け取れる（Chrome 公式: [Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)、MDN `share_target` は Limited availability）。
- 現実的な手数は「カメラ起動 → 撮影 → 食事区分/メモ → 送信」で 3〜5 操作。native の CameraX + デフォルト値（時刻から食事区分推定）+ ウィジェットなら 1〜2 操作まで詰められる。
- 今は手数の差を理由に native を選ぶ段階ではない。先に PWA で「デフォルト値を強くする（今・食事区分推定・メモ任意）」をやり、実際に記録が途切れるかを見る。

オフライン時の記録と後同期:

- PWA: Service Worker + IndexedDB の送信キューで実現できる。Background Sync は Chrome Android では使えるが、発火はブラウザ任せ（[ChromeOS Powerful PWAs](https://developers.google.com/chromeos/app-development/learn/powerful-pwas)）。通勤中に確実に裏同期される前提は置けない。
- native: Room + WorkManager の方が再開保証は強い。
- 必須な契約はクライアント側ではなくサーバ側にある。記録 API はクライアント発行の冪等キーを受け、Mac runner が止まっていても Worker → D1/R2 に直接書く。オフラインキューの同期先は Cloudflare であり Mac ではない。

通知:

- Android Chrome のインストール済み PWA で Web Push は使える。runner 停止や未処理メンションの通知は、最後の heartbeat を Cloudflare 側で見て Worker から送れる。Mac に依存しない。
- MVP ではダッシュボード上の異常表示で足りる。Push は将来改善。

共有シート:

- 送り出し（Web Share API）と受け取り（Share Target）はインストール済み Android PWA で公式に存在する。
- native の `ACTION_SEND` の方が対象アプリ一覧での安定性は高い、は推測。PWA で Share Target を実装して「カメラから共有して食事登録」が日常で使えるかを実測する価値がある。これが失敗したときが native 移行の有力条件。

ウィジェット:

- ホーム画面ウィジェットは PWA では実質不可。Progressier の 2026-08-28 比較も「PWAs cannot create home screen widgets on most platforms」と書いている（二次ソース）。Android 公式の App Widget は native。
- 1 タップ食事が必要になったら native。今その需要は要件上「あると良い」止まり。

バックグラウンド処理:

- PWA の Periodic Background Sync は「よく使うインストール済みアプリ」に対してブラウザが間隔を決める。1 分 poll や Health 同期の代替にはならない。
- 定期取込の executor は今の設計どおり Mac runner。モバイル側に裏で回す必要は MVP ではない。

Health Connect:

- Web から読めない。Health Connect は端末内ストアで、バックエンド OAuth も無い（Android 公式の同期ガイド、Capacitor Health プラグインも web implementation なし）。
- 現状の体重の正は `weight-trend.csv` で、取得経路は Simple アプリの UI 自動化。`sync-weight-trend` スキルは「Simple は体重を Health Connect へ書き出さない」と明記している。
- したがって「Health Connect があるから native」は今の source of truth と食い違う。Simple を捨てて Health Connect 書き込みアプリへ移す決定が先。

Cloudflare 上の API を必要とするか:

- 必要。本人限定の横断ダッシュボードが目的なので、端末ローカル完結アプリは目的に反する。
- 端末だけで完結してよいのはオフライン下書きだけ。同期後の正は D1/R2。

Web との UI・型・ロジック共有:

- 残せる: OpenAPI/型、D1 スキーマ、R2 キー設計、冪等キー、Access の外の runner API 契約。
- 捨てる（PWA 後に native へ移る場合）: Service Worker、IndexedDB キュー実装、`share_target` ハンドラ、Web カメラ UI。
- 最初から共有 UI レイヤ（Capacitor 等）を敷くのは、今の利用者 1 人・記録画面が数枚、に対して過剰。

開発と保守コスト:

- 同一人物が Web・runner・connector・agent を持つ前提では、記録面の二重実装が一番高い。
- PWA は Web の延長なので実装面は 1 つ。native は Kotlin、Play の Health 宣言、権限、リリース経路が増える。公開コードという目的には native も載るが、保守対象が増える。

### native へ移る明確な条件

次のいずれかが実測で満たされたら移る。満たされる前に着工しない。

1. インストール済み PWA で食事記録の手数または Share Target の不安定さが原因で、記録が週単位で落ちる。
2. 体重の正を Simple+CSV から Health Connect に切り替える（Simple が HC に出さない現状が変わった、または自前入力アプリに替える）。
3. ホーム画面ウィジェット（1 タップ食事/支出）が、通知やホーム画面ショートカットでは代替できない。
4. オフラインキューが Chrome に殺され、通勤記録が再現可能な頻度で消える。

「将来 iOS も」「ストアに置きたい」「native の方がちゃんとして見える」は条件にしない。

### 必須修正 / 将来改善（モバイル）

必須修正:

- 記録 API は Worker 直書き。runner 停止中も食事・手入力体重・支出メモを受け付ける、を要件の実装契約にする。
- モバイルは Web の responsive + 後から Add to Home Screen。別リポジトリの Android アプリを MVP 項目にしない。
- Health Connect を「比較観点」から「現行 SoT ではない。移行条件付き」に格下げして書く。

将来改善:

- Share Target、Web Push、オフラインキュー。
- 条件充足後の Android 薄型クライアント（記録と HC 同期だけ。ダッシュボードは Web のまま）。

---

## 3. 定期実行の修正点

### 分割自体

妥当。この 4 層を崩さない。

| 層 | 責務 | やってはいけないこと |
|---|---|---|
| D1 | schedule 定義と job 状態の正 | 実行ログ全文、秘密情報、agent の生ログ |
| Cloudflare Cron | 期限到来分の job 行を作る。期限切れ lease を `lost` にする | Slack 取得、画像解析、Orca 起動 |
| launchd runner | 外向き poll、claim、実行、heartbeat、結果投稿 | inbound port、独自の第二スケジューラ |
| Orca CLI | worktree / terminal / agent の adapter | ダッシュボード job の schedule 正 |

Orca Automations は既存の独立ジョブ（週次ニュース等）として残す。ダッシュボードが管理する Slack/Chatwork/体重/食事解析/agent 起動は Automations に載せない。両方に同じ取込を置くと二重実行と状態の不可視化が起きる。境界は「D1 に job 行があるか」。無いものは Automations、あるものは runner。

### 必須修正

1. Cron は tick ではなく catch-up

   Cloudflare Cron は最短 1 分、UTC、数秒のジッタ。公式の Cron ドキュメントは自動リトライを保証していない。`scheduled()` の失敗は次 tick 待ちになり得る。
   job 作成は「この分の分だけ INSERT」ではなく「`next_run_at <= now` の schedule をすべて job 化する」。同一 period は冪等キーで一意。取りこぼしは次の成功 tick で回収する。
   公式: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)、[Limits](https://developers.cloudflare.com/workers/platform/limits/)（Cron はアカウントあたり Free 5 本）。schedule を D1 に寄せる今の方針なら Cron は 1 本で足り、この上限とは衝突しない。

2. lease に fencing token を置き、Mac スリープ後の二重実行を止める

   起きうる列: runner が job 実行中にスリープ → heartbeat 停止 → Cron が `lost` → 再キュー → Mac 起床後に旧プロセスが続き、新 claim も走る。
   必要な契約:
   - claim は 1 文の条件付き UPDATE（`status='queued'`、または `lost` からの再実行で新 `lease_token`）。
   - heartbeat / 完了 / 中間結果は `job_id + lease_token` が一致しないと拒否。
   - 起床直後、runner は進行中 job についてサーバに token を確認し、無効なら即中断。
   - `lost` 判定は Cron（または同じ Worker の schedule handler）が行う。runner の自己申告だけにしない。

3. heartbeat を実行ループから独立させる

   poll 間隔 1 分と実行は別。Slack 取込や agent が 10 分かかる間に poll が止まると lease が死ぬ。runner は実行中でも heartbeat だけを別タイマーで打つ。lease 長は heartbeat 間隔の 3 倍程度（例: 1 分 heartbeat、3 分 expire）。数値自体は実測でよいが、独立タイマーは必須。

4. `lost` のあとの再実行方針を job 種別で固定する

   要件は「種別ごとの方針」までしかない。実装前に表にする。

   - Slack/Chatwork/GitHub/体重/金融の batch: 自動再キュー。本体が watermark/冪等なら安全。
   - 食事の栄養解析: 自動再キュー。入力 hash で結果を一意に。
   - interactive agent: 自動再起動しない。`lost` のままダッシュボードで人が再実行。途中の worktree は残す（要件どおり自動削除しない）。
   - 手入力の記録 job は存在させない（記録は同期 API）。

5. connector に watermark を置く

   冪等キーだけでは「Mac が 2 日止まっていた」を表現できない。各 connector は最後に成功した位置（Slack なら channel ごとの timestamp、CSV なら file hash + 最終行）を D1 に持つ。再開時は「直近 1 時間」ではなく watermark から取る。原文は境界で検証する、は要件どおり維持。

6. 冪等キーのスキーマを種別で決める

   キーが「ランダム UUID」だと二重実行を止められない。

   - schedule 由来 batch: `{schedule_id}:{period_start_utc}`
   - メッセージ取込: `{connector}:{source_id}:{message_id}`
   - 食事写真: クライアント発行 UUID（端末で作る。再送で不変）
   - 体重行: `{source}:weight:{date}`
   - 金融: `{source}:{txn_id}`。txn_id が無い明細は `{source}:{date}:{amount}:{payee_hash}` を明示的な弱いキーとして扱う

7. runner の認証を人間の Access と分ける

   ダッシュボードは Cloudflare Access（Zero Trust Free は 50 ユーザーまで。本人 1 人なら足りる。[Cloudflare One のプラン記述](https://developers.cloudflare.com/cloudflare-one/) および Access の service token 上限 50）。
   runner はブラウザではない。Access Service Token（または Worker が検証する HMAC）を使う。Cookie セッションを runner に持たせない。token はローカルの secret store（または 600 のファイル / Keychain）。plist に書かない。
   Cloudflare Secrets は Worker 側の検証鍵と人間用設定だけ。Slack/Chatwork の Cookie や `sl`/`cw` 資格情報は Mac から出さない。

8. 完了判定を D1 に閉じ、Orca orchestration を job 状態機械にしない

   batch: 終了コード + 構造化 JSON を runner が Worker に POST。
   agent: プロセス終了や idle では完了にしない（要件どおり）。完了は runner が「明示的な成功/失敗報告」を API に POST したときだけ。報告には `lease_token` を付ける。
   Orca の `worker_done` は adapter 内部の信号になり得るが、ダッシュボードの正ではない。runner が翻訳して D1 を更新する。Orca アプリが落ちているだけの状態を `succeeded` にしない。Orca 到達不能は runner の health として出し、agent job は `failed` または人が再実行する `lost` にする。

9. ログの許可リスト

   クラウドへ送ってよいもの: job id、状態、種別、開始/終了、エラーコード、要約（個人情報を含まない長さ制限付き文字列）、再試行回数、次回時刻。
   送ってはいけないもの: Slack/Chatwork 本文、Cookie、絶対パス、写真、残高、体重の生ログダンプ、agent のセッション全文。
   Workers Logs は 1 リクエスト 256KB、Free の保持は短い。`console.log` に本文を出さない。agent 詳細はローカルのみ（要件どおり）。

10. Mac 停止中のユーザ影響をホームに出す

    要件「runner が止まっても閲覧と手入力は続けられる」は、記録経路が Worker 直書きでないと偽になる。加えてホームに `runner.last_heartbeat_at` と「遅延中の job 数」を出す。停止中に溜まるのは batch と agent だけ、という表示にする。

11. 起床バーストの同時実行上限

    停止明けに queued が並ぶ。runner の同時実行は小さく（batch 1〜2、agent 1）。Slack を 10 本並列で叩かない。遅延は許容（要件: リアルタイム不要）。

### 将来改善

- 複数 Mac（runner_id、claim の排他は今の SQL で足りるが、優先 runner は後でよい）。
- `waiting_for_user` の滞留タイムアウトと通知。
- job 履歴の retention（D1 Free は DB 500MB、アカウント 5GB。本文を溜め続けると枠を食う）。
- Cron 失敗のアラート（公式 Cron に内蔵アラートは無い。ダッシュボードの「最終 cron 成功時刻」で足りる）。
- Cloudflare Queues / Workflows。個人 1 runner には不要。Queues は Free 前提を壊しやすい。

### 無料枠との当たり（公式）

出典: [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)（最終更新 2026-07-28）、[D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)、[D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)、[R2 Pricing](https://developers.cloudflare.com/r2/pricing/)、[D1 Changelog 2026-09-01](https://developers.cloudflare.com/changelog/product/d1/)。

- Workers Free: 10 万 request/日。1 分 poll + 1 分 cron でも 3 千/日規模。問題にならない。
- CPU time: HTTP も Cron も Free は 10ms。待ち I/O は CPU に入らない。job 作成の小さな SQL は平均 Worker 2.2ms の範囲に収まり得る。TanStack Start の SSR・認証・大きい JSON は公式が「typically 10-20ms」と書いており、Free と衝突する。
- D1 Free: 読み 500 万行/日、書き 10 万行/日。2026-09-01 から超過でクエリが失敗する（データは残る）。heartbeat を行 UPDATE するだけなら書きは 1 日数千。履歴を毎回 INSERT すると無駄に枠を使う。
- D1 は DB 単位で単一スレッド。1 本の条件付き UPDATE による claim とは相性が良い。
- Time Travel Free は 7 日。バックアップではない。
- R2 Free: 10GB、Class A 100 万/月。食事写真（推測: 1 枚 1〜3MB × 1 日数枚）なら年で数 GB に収まる想定。実測対象。
- Cron CPU 10ms を超える処理を Cron に足さない（今の「job を作るだけ」は正しい）。

---

## 4. 全体設計

### 合っているところ

- 利用者 1 人、SaaS 化しない、ロール管理しない。
- コード公開、実データは D1/R2/ローカル。
- ダッシュボードをタスクの正にし、必要なものだけ GitHub へ昇格。
- 重い処理を Worker に置かない。
- 同期は遅延許容。
- 食事の事実と agent 推定を別レコードにする。
- Orca Automations を第二の本スケジューラにしない。

### 過剰設計（今やらない）

- Android native、Play 公開、Health Connect 同期。
- Cloudflare Workflows / Queues / Durable Object による汎用ジョブエンジン。D1 の schedule + job 行で足りる。
- agent provider の高度な切り替え UI（要件も初期は不要としている。データモデルに provider を持つだけでよい）。
- リポジトリ役割（`work` / `context` / `default_work` / `always_read`）の完成形を MVP の画面にする。最初は「このタスクの作業リポを 1 つ選ぶ」でよい。複数リポと役割は agent 起動が実在してから。
- 栄養推定の自動化、Talknote（要件どおり MVP 後）。
- 金融の「自動取得できないもの以外すべて」を初手で完成させる。既存の立替 xlsx / カード CSV スキルがある。ダッシュボードは取込とグラフに留め、精算書ワークフローを置き換えない。

### 欠落（必須）

- Workers Free 10ms と TanStack Start SSR の衝突を、技術構成の決定として書く。選択肢は (a) 画面は CSR、API だけ Worker (b) Workers Paid $5 を無料目標の例外として認める。未決定のまま「Web: TanStack Start」とだけ書くと、Free で SSR して 1102 になる。
- 公開リポジトリに置くもの / 置かないものの実装境界: `wrangler` の account id・実 binding・部屋とリポの対応表は非公開側。公開側は example とダミー。絶対パスをコードに書かない（要件は書いているが、設定ファイルの分割が無い）。
- D1/R2 のバックアップ。Time Travel 7 日はバックアップではない。週次で D1 dump と R2 一覧を Mac 側へ export する job を、金融・写真を入れる前に 1 本入れる。
- 記録経路（食事/手入力）と実行経路（connector/agent）の分離。
- 個人データを Workers Logs に出さない許可リスト。
- runner 停止と Orca 未起動を別の異常として扱う。

### 公開コード / 非公開データ

この分け方自体は公開の妨げにならない、という要件の主張は正しい。ただし公開リポに schema を置くなら、マイグレーションに実データの形（チャンネル ID、メール、口座名）を埋め込まない。シードはダミーだけ。

推測: 将来 GitHub 公開したとき、Issues や Actions ログに D1 の中身が混ざるのが一番やりがち。CI はダミー D1 だけを使う。

### 認証

Cloudflare Access による本人限定は、1 人用途として過不足ない。アプリ内ユーザー表は作らない。Access の後ろに「ログインユーザー id をアプリが信じる」以上のロールを足さない。

---

## 5. MVP 推奨順

要件の 10 段は方向は合っているが、インフラ先行と「モバイル記録が後ろすぎる」を直す。Android 固有は末尾のまま外す。

1. Web + Access + D1 スキーマ + 手入力タスク + ホーム骨格（今日のタスク、runner 状態枠は空でよい）。ここで CSR か Paid かを決める。
2. 食事写真・メモの Worker 直書き（R2 + D1）。responsive Web / 後で PWA 化。Mac 不要。これで記録 API と冪等キーの型が先に固定される。
3. runner の登録、poll、claim、heartbeat、`lost`、ダッシュボード表示。job 種別はまだ 1 つでよい。
4. Slack 取込（watermark + 冪等）。これが最初の本番 batch。runner が空回りしない。
5. Chatwork 取込。Slack と同じ connector 契約を再利用できるかここで確認する。
6. 体重 CSV 取込とグラフ。正は既存 `weight-trend.csv`。Health Connect はやらない。
7. 収支・残高の取込とグラフ。既存カード CSV / 立替フローを置換せず、要約表示を先にする。
8. 会話ソースとリポジトリの選択・記憶。agent の直前まで詳細 UI を作り込まない。
9. Orca 経由の agent 起動、明示完了、worktree を消さない、ログはローカル。
10. GitHub Issue / Project 4 への任意昇格。

要件 8 の「Talknote、栄養推定、provider 切替 UI、Android 固有」を MVP 後にする判断は維持。

順序を変えた理由:

- 食事を runner より前に置く。記録が Mac に依存しないことを最初の実装で固定するため。PWA vs native の実測もここでしか取れない。
- runner を「空の状態機械」で完成させず、Slack を最初の顧客にする。
- リポジトリ対応は agent の直前。先に作ると画面だけが先行する。

---

## 6. 今決めずに実測する項目

実装前に会議で決めなくてよい。最初の実装で測ってから固定する。

1. Workers Free の CPU。最小 API と、TanStack Start を 1 画面 SSR したときの CPU ms。10ms を安定して超えるなら Paid か CSR。公式は SSR を 10-20ms 典型と書いているので、Free SSR は楽観しない。
2. 食事記録の手数。PWA の capture 入力だけで続くか。Share Target を足す必要があるか。ここで native 判定の材料が揃う。
3. Cron 1 分 vs 5 分。job 作成が catch-up なら 5 分でも機能する。1 分は runner の応答性のためで、Cron 側を 1 分にする必然は実測待ち。
4. lease 長と heartbeat 間隔。スリープ、lid close、Wi-Fi 切断で heartbeat がどれだけ欠けるか。
5. Slack/Chatwork 取込の 1 回あたり時間と、原文サイズ。D1 に本文をどこまで残すか（全文 / 要約 / ローカルのみ）はデータ量を見てから。
6. R2 の食事写真の平均サイズと月間 Class A。
7. Simple → CSV の体重経路をいつまで正にするか。HC 対応アプリへ乗り換えるまでは native を開かない。
8. Orca CLI が launchd ユーザセッションから安定して呼べるか。Orca アプリ未起動時のエラー形。推測: GUI アプリ依存なら agent job は「ログイン中の Mac」が前提、とドキュメント化するだけでもよい。
9. 公開リポの範囲。最初は private で schema を固め、秘密が混ざらないことを確認してから公開する、でよい。公開日自体は今決めなくてよい。

---

## 付録: 必須修正チェックリスト（実装時）

- [ ] 記録 API は Worker → D1/R2。runner を経由しない
- [ ] Cron は due 全件の catch-up。period 冪等
- [ ] claim は条件付き UPDATE + `lease_token`
- [ ] heartbeat/完了は token 検証。起床後に token 再確認
- [ ] heartbeat タイマーは実行ループから独立
- [ ] `lost` は Cron 側。agent は自動再起動しない
- [ ] connector watermark
- [ ] 種別ごとの冪等キー
- [ ] runner は Access Service Token（または同等）。人間セッションと分離
- [ ] 完了は D1。Orca `worker_done` は翻訳するだけ
- [ ] クラウドログ許可リスト
- [ ] ホームに runner last seen
- [ ] 同時実行上限
- [ ] D1 dump + R2 一覧の export job
- [ ] CPU 予算: Free CSR または Paid SSR を明示
- [ ] 公開用 example 設定と実設定の分離

以上。
