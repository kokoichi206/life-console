# Life Console Widget

Android 12 以上向けのホーム画面ウィジェット。体重の推移、ゴミの日、体重を記録、食事を記録の 4 種類を個別に配置できます。

## 表示用ウィジェット

アプリを開き、『表示用ウィジェットにログイン』から本番 Life Console の Cloudflare Access にログインします。Chrome Custom Tabs を使うため、Chrome の既存のログイン状態を利用できます。Chrome に複数のアカウントがある場合の選択や、初回の認証・同意はブラウザ側で行います。認証後は『Life Console に戻る』でアプリへ戻ります。ログイン後に同期し、『体重グラフを追加』『ゴミの日を追加』からランチャーの確認画面で追加します。対応しないランチャーではホーム画面のウィジェット一覧から追加してください。

- 体重の推移: 最新の体重・記録日と、日本時間の今日を含む直近 30 日の実測値をグラフで表示。記録なし、1 点だけ、全点同じ体重にも対応します。
- ゴミの日: 日本時間の朝 8:30 までは今日・明日、8:30 以降は明日・明後日の収集予定を表示。Web で選択した地区、個別の日付変更、中止を反映します。地区未設定、未同期、取得範囲外・年度外の日程を、収集なしとは区別します。
- 体重は 5 × 2、ゴミの日は 5 × 1 を初期サイズとし、縦横にリサイズ可能。グラフは縦横比を維持し、収集予定は 2 日分を横並びに表示。配色は Life Console のライト（白・青緑）／ダーク（暗い茶系・オレンジ）に揃え、端末のテーマに追従します。Web 側で個別に指定したテーマ設定とは同期しません。

体重をタップすると `/health?range=d30`、ゴミの日の各日をタップすると `/todos?view=calendar&month=YYYY-MM&eventId=...` を外部ブラウザまたはインストール済み Web アプリで開きます。同日に複数の収集区分がある場合は最初の予定、予定がない日はその月のカレンダーを開きます。同期・ログイン設定は Android アプリのアイコンから開きます。

同期先は `https://life-console.kokoichi206.workers.dev` の既存の読み取り API です。アプリ起動時に約 1 時間ごとの通信ジョブを登録し、ログイン後・『今すぐ同期』では優先実行のジョブで同期を要求します。同じ即時同期が待機・実行中なら重複予約しません。ウィジェットの追加・定期更新では保存済みデータを表示し、定期通信ジョブを登録します。Android のネットワーク・省電力制約によって実行は遅れることがあります。体重と当日から 31 日後までのカレンダーを一組で保存し、ウィジェットに取得日時を表示します。

同期失敗・認証切れはエラーとして表示し、取得済みデータと取得日時を残します。アプリから再ログイン・同期してください。朝 8:30 の日付切り替えは通信不要です。非厳密アラームと 30 分ごとのウィジェット更新を使い、再起動・時刻変更後も切り替えを再予約します。省電力中の 8:30 ちょうどの反映は保証しません。

認証は Cloudflare Access Managed OAuth と AppAuth Android の Authorization Code + PKCE を使用します。動的クライアント登録のリダイレクト先は `127.0.0.1` の一時ポートだけを許可し、端末内の HTTP listener で state を検証します。ブラウザの『Life Console に戻る』でアプリを前面に戻してからコードを交換します。戻るリンクの独自 scheme にコードや token は含めません。Access token は 15 分、grant は 24 時間で、バックグラウンド同期時に refresh token を使って更新します。grant が切れた場合は再接続が必要です。Chrome の Cookie をアプリへコピーする方式ではありません。

OAuth の認証状態と取得したデータはアプリ専用 SharedPreferences に保存します。バックアップは無効です。token・実データをログや Git 管理対象へ出力しません。旧 WebView 版から更新した場合は Chrome で一度接続し直してください。同期は GET のみで、記録の追加、予定・通知の変更、本番 API の変更は行いません。

## 記録用ウィジェット

『体重ウィジェットを追加』『食事ウィジェットを追加』で、各 2 × 1 の入力ボタンを配置します。タップすると外部ブラウザまたはインストール済み Web アプリで開きます。ブラウザ側の Cloudflare Access のセッションを使います。

- 体重: `https://life-console.kokoichi206.workers.dev/health?entry=weight`
- 食事: `https://life-console.kokoichi206.workers.dev/health?entry=meal`

Oshi Launcher では『ホームに追加』→『ウィジェット』→『Life Console Widget』から追加できます。

## ビルドとインストール

JDK 17 と Android SDK Platform 36 が必要です。`ANDROID_HOME` または Git 管理対象外の `local.properties` に SDK の場所を設定します。

```bash
cd clients/android
./gradlew ktlintCheck :lint-rules:test :app:lintDebug :app:testDebugUnitTest :app:assembleDebug
adb -s DEVICE_SERIAL install -r app/build/outputs/apk/debug/app-debug.apk
```

開発用 APK は `app/build/outputs/apk/debug/app-debug.apk` に生成します。ローカルの debug key で署名し、Play ストアへの公開や配布用の署名管理は行いません。`pnpm check` は Android を含まないため、上記の Gradle コマンドも実行してください。

## 構成と検証

Kotlin と Android 標準の AppWidgetProvider / RemoteViews を使用します。グラフは Canvas で描画した Bitmap を表示します。通信と認証は専用の境界に閉じ込め、[import 制限](lint-rules/docs/no-forbidden-import.md) で他のファイルからの追加を検査します。

- `WidgetSnapshot.kt`: 日本時間の表示日・次の切り替え時刻・直近 30 日の抽出。
- `WidgetStore.kt`: API 応答の検証と端末内保存。
- `WidgetSyncService.kt`: JobScheduler、固定 origin への通信、失敗の表示。
- `WidgetSyncQueue.kt`: 実行単位の停止と完了。停止済みの完了通知で、同じ ID の次の実行を取り除かない。
- `WidgetLoginActivity.kt`: Chrome Custom Tabs での OAuth 認証と動的クライアント登録。
- `WidgetOAuth.kt`: OAuth metadata の取得、認証状態の保存、token の更新。
- `LoopbackOAuthReceiver.kt`: 端末内の callback の受信と state の検証。
- `DisplayWidgets.kt`: 体重グラフ・収集予定の描画と表示日の更新。目盛りと線を別の画像にし、ホーム側のリソースで配色を切り替えます。
- `WidgetLinks.kt`: 体重グラフと各収集日の Web リンク。
- `res/values/colors.xml` / `res/values-night/colors.xml`: Web の配色に対応するライト／ダークの色。
- `WeightEntry.kt` / `MealEntry.kt`: 記録 URL。

単体テストで OAuth callback の state・パス・重複パラメーターの検証と loopback の HTTP 応答、同期の停止・同じジョブ ID の再実行・遅れて届く完了通知・予期しない例外の伝達、および 8:30 の境界、月末・年末、日本時間の 30 日間、収集中止・複数区分・未登録期間・地区未設定・不正な API 値を検証します。実データとランチャー上の表示は実機で別途確認します。

## Lint と CI

ktlint 本体 `1.8.0` と Gradle plugin `14.0.1` を使用します。独自ルールの理由と制約は [lint-rules](lint-rules/README.md) を参照してください。

- `./gradlew ktlintCheck`: Kotlin と Gradle Kotlin DSL の標準ルール、カスタムルールを検査。
- `./gradlew ktlintFormat`: 自動整形。カスタムルールの違反は自動修正しません。
- `./gradlew :lint-rules:test`: カスタムルールの検出・非検出・抑制をテスト。
- `./gradlew :app:lintDebug`: リソース、Manifest、Android API の使い方を検査。

違反ファイルを削除しただけで増分検査に古い結果が残る場合は、`./gradlew ktlintCheck --rerun-tasks` で再検査します。[plugin の変更ファイル抽出](https://github.com/JLLeitschuh/ktlint-gradle/blob/v14.0.1/plugin/src/main/kotlin/org/jlleitschuh/gradle/ktlint/tasks/BaseKtLintCheckTask.kt) に基づく制約です。

[ci-android](../../.github/workflows/ci-android.yml) は Android または同 workflow の変更を含む `develop` / `main` 向け PR・両ブランチへの push と手動実行で、lint、カスタムルールとアプリの単体テスト、Debug APK ビルドを実行します。レポートは 7 日間保存し、APK の公開・実機へのインストールは行いません。

参考: [ウィジェット](https://developer.android.com/develop/ui/views/appwidgets)、[追加 API](https://developer.android.com/develop/ui/views/appwidgets/discoverability)、[アラームの制約](https://developer.android.com/develop/background-work/services/alarms)。
