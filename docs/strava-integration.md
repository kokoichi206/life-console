# Strava と健康画面

本人用の読み取り連携。健康画面は既定で体重のみを表示する。必要なときに「走行距離を重ねる」をオンにして、週ごとの走行距離を棒で重ね、体重の変化と運動量を同じ時間軸で見返す。表示の切り替えは期間を変えず、URL に保持して再読み込みでも復元する。重ねている間は右軸に体重の kg、左軸に走行距離の km を表示する。グラフをタップすると、その時期の体重と週の走行距離を確認できる。「この週のランと食事を見る」で同じ週に絞り、ランニング、ウォーキング、筋トレなどの運動一覧と食事写真・メモを開く。日本時間・月曜始まりで集計し、期間の端の週は「一部」と表示する。

週の走行距離・回数・移動時間、平均体重、食事件数の表は「週ごとの数字を見る」から開く。運動の取得途中・失敗時は棒と週の合計を表示せず、体重グラフは引き続き使える。

## 接続設定

[Strava の API 設定](https://www.strava.com/settings/api) で本人のアプリを作成する。有料プランのアカウントを使い、Authorization Callback Domain は配置先のホストに合わせる。ローカルでは `localhost` を使える。

API の環境変数を 4 項目すべて指定する。ローカルは未追跡の `apps/api/.dev.vars` を使う。配置先では対象 Worker に 4 項目すべてを secret binding として登録する。Worker の配置は [Terraform](../infra/terraform/README.md) が担当し、既存の `secret_text` を保持するため、Wrangler の `vars` や Terraform の tfvars へ複製しない。

| 名前 | 値 |
| --- | --- |
| `STRAVA_CLIENT_ID` | Strava が発行する Client ID |
| `STRAVA_CLIENT_SECRET` | Strava が発行する Client Secret |
| `STRAVA_TOKEN_KEY` | `openssl rand -hex 32` で生成した暗号鍵 |
| `STRAVA_REDIRECT_URI` | Web と同じ origin の `/api/v1/strava/callback`。ローカルは `http://localhost:5173/api/v1/strava/callback` |

Client Secret、暗号鍵、認証コード、token を Git・会話・ログに記録しない。暗号鍵を差し替える場合は、先に接続を解除する。保存済みの接続情報は元の鍵でしか読み出せない。

DB は `pnpm --filter @life-console/db migrate:local` でローカルに適用する。健康画面の `Connect with Strava` から認可し、非公開の運動を含む `activity:read_all` を許可する。書き込み権限は要求しない。配置先では既存の Cloudflare Access による本人認証を維持し、callback も同じ保護範囲に置く。

API アプリは 1 アカウントにつき 1 個という[公式スタッフの案内](https://communityhub.strava.com/developers-api-7/register-an-app-w-o-subscription-3153)がある。別用途の既存アプリを転用する際は、その連携が使われていないことを確認する。

## 取得と保存

- 活動一覧は表示期間ごとにページングし、空ページまで取得してから合計する。取得途中・失敗を走行距離ゼロとして扱わない。
- ランは `Run`・`TrailRun`・`VirtualRun`。ウォーキングや筋トレなどは別の運動として数え、詳細に種別を表示する。ペースは距離と移動時間から計算する。心拍がない記録には値を補わない。
- 体重は保存済み実測値、食事は期間を指定して取得する。期間指定の食事は直近 100 件の制限を使わない。
- 既定は現在までの 90 日。全期間ボタンの開始日は保存済み体重の最古日を使う。さらに古い運動は日付指定で取得できる。
- 運動データは D1・ファイル・ブラウザの永続ストレージへ保存しない。表示用の Query はブラウザのメモリ内に置き、画面・期間の切り替えや接続解除で破棄する。取得結果を HTTP キャッシュに残さない。
- 認証情報は D1 の `strava_connection` に AES-GCM で暗号化して保持する。更新・接続・解除は同じ lease で直列化し、期限切れや古い処理の保存を拒否する。
- `運動を更新` で再取得する。常駐 runner、webhook、過去全履歴の自動保存は今回の実装に含まない。GPS コースは `View on Strava` から確認する。
- `接続を解除` は Strava の revoke API が成功した後に保存した認証情報と画面の運動データを消す。失敗は表示し、再試行できるよう接続情報を保持する。

## 設計判断と確認範囲

2026-09-09、規約の適用に未確定点があることを確認した上で、本人用 API を試す方針になった。本実装を Strava による個別許可取得済みとは扱わない。

認証・D1・外部 HTTP の架空応答を用いたテストと、実際の本人アカウントへの接続確認は区別する。実データ確認には上記の接続設定と Strava での認可が必要。

2026-09-09 の検証: `pnpm check` は成功。ローカル D1 に migration を適用し、健康画面の期間変更・再読み込み、食事表示、Strava 未設定表示を確認した。接続後の週次表示・取得途中の失敗・解除は架空応答の Storybook で確認し、390 px のカード表示も実際に確認した。本人の Chrome プロファイルで、未使用の既存 API アプリを Life Console 用に変更し、ローカルの健康画面から認可・実データ取得を確認した。100 件を超える期間のページング、週の選択、再読み込み後の期間・接続の復元を確認し、ランニングの距離・移動時間・ペース・平均心拍を Strava の元記録と照合した。体重と食事はローカルの検証用データ。実アカウントでの期限切れ後の token 更新・接続解除、および配置先での接続は未確認。

一次資料: [OAuth](https://developers.strava.com/docs/authentication/)、[ページング](https://developers.strava.com/docs/)、[API リファレンス](https://developers.strava.com/docs/reference/)、[表示ガイドライン](https://developers.strava.com/guidelines/)。
