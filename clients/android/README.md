# Life Console Android

Android 12 以上向けの食事記録アプリとホーム画面ウィジェット。体重の推移、ゴミの日、体重を記録、食事を記録の 4 種類を個別に配置できます。

## 表示用ウィジェット

アプリを開き、『ウィジェットを接続・再接続』から本番 Life Console の Cloudflare Access にログインします。Chrome Custom Tabs を使うため、Chrome の既存のログイン状態を利用できます。Chrome に複数のアカウントがある場合の選択や、初回の認証・同意はブラウザ側で行います。認証後は『Life Console に戻る』でアプリへ戻ります。ログイン後に同期し、『体重グラフを追加』『ゴミの日を追加』からランチャーの確認画面で追加します。対応しないランチャーではホーム画面のウィジェット一覧から追加してください。

- 体重の推移: 最新の体重と、日本時間の今日を含む直近 30 日の実測値を縦軸付きのグラフで表示。記録なし、1 点だけ、全点同じ体重にも対応します。
- ゴミの日: 日本時間の朝 8:30 までは今日・明日、8:30 以降は明日・明後日の収集予定を表示。Web で選択した地区、個別の日付変更、中止を反映します。地区未設定、未同期、取得範囲外・年度外の日程を、収集なしとは区別します。
- 体重は 5 × 2、ゴミの日は 5 × 1 を初期サイズとし、縦横にリサイズ可能。Android 12 の responsive RemoteViews を使い、高さに応じて表示を切り替えます。体重は 200 dp 未満では数値と縦軸 2 点、200 dp 以上で縦軸 3 点・横軸の日付・期間差、280 dp 以上で最新の記録日と期間内の記録件数も表示します。期間差は直近 30 日の最初と最後の実測値の差です。収集予定は高さ 110 dp 未満では横 2 列、110 dp 以上では縦 2 行に表示します。ブロック数と dp の関係はランチャーごとに異なります。配色は Life Console のライト（白・青緑）／ダーク（暗い茶系・オレンジ）に揃え、端末のテーマに追従します。Web 側で個別に指定したテーマ設定とは同期しません。

体重をタップすると `/health?range=d30`、ゴミの日の各日をタップすると `/todos?view=calendar&month=YYYY-MM&eventId=...` を外部ブラウザまたはインストール済み Web アプリで開きます。同日に複数の収集区分がある場合は最初の予定、予定がない日はその月のカレンダーを開きます。認証切れの場合はウィジェットのタップで再接続画面を開きます。その他の同期エラーでは Android アプリの同期設定を開きます。通常時のタップでは上記の Web 画面を開きます。同期設定は Android アプリのアイコンからも開けます。

同期先は `https://life-console.kokoichi206.workers.dev` の既存の読み取り API です。アプリ起動時に約 1 時間ごとの通信ジョブを登録し、ログイン後・『今すぐ同期』では優先実行のジョブで同期を要求します。同じ即時同期が待機・実行中なら重複予約しません。ウィジェットの追加・定期更新では保存済みデータを表示し、定期通信ジョブを登録します。Android のネットワーク・省電力制約によって実行は遅れることがあります。体重と当日から 31 日後までのカレンダーを一組で保存します。通常時のウィジェットはサイズに応じた体重の情報と収集予定を表示し、同期の取得日時はアプリで確認します。

同期失敗・認証切れはエラーとして表示し、取得済みデータを残します。取得日時はアプリで確認できます。アプリから再ログイン・同期してください。朝 8:30 の日付切り替えは通信不要です。非厳密アラームと 30 分ごとのウィジェット更新を使い、再起動・時刻変更後も切り替えを再予約します。省電力中の 8:30 ちょうどの反映は保証しません。

認証は Cloudflare Access Managed OAuth と AppAuth Android の Authorization Code + PKCE を使用します。動的クライアント登録のリダイレクト先は `127.0.0.1` の一時ポートだけを許可し、端末内の HTTP listener で state を検証します。ブラウザの『Life Console に戻る』でアプリを前面に戻してからコードを交換します。戻るリンクの独自 scheme にコードや token は含めません。Access token は 15 分、grant は 24 時間で、バックグラウンド同期時に refresh token を使って更新します。grant が切れた場合は再接続が必要です。Web アプリでログイン済みでも、ウィジェットの grant は別に更新する必要があります。Chrome の Cookie をアプリへコピーする方式ではありません。

OAuth の認証状態と取得したデータはアプリ専用 SharedPreferences に保存します。バックアップは無効です。token・実データをログや Git 管理対象へ出力しません。旧 WebView 版から更新した場合は Chrome で一度接続し直してください。表示用ウィジェットの同期は GET のみです。食事記録の保存経路は次節で説明します。予定・通知の変更や本番 API の変更は行いません。

## 記録用ウィジェット

『体重ウィジェットを追加』『食事ウィジェットを追加』で、各 2 × 1 の入力ボタンを配置します。体重は外部ブラウザまたはインストール済み Web アプリで開き、ブラウザ側の Cloudflare Access のセッションを使います。食事は Android アプリ内の食事一覧を開きます。

- 体重: `https://life-console.kokoichi206.workers.dev/health?entry=weight`
- 食事: `dev.kokoichi.lifeconsole://meals`（パッケージを指定した Intent）

Oshi Launcher では『ホームに追加』→『ウィジェット』→『Life Console Widget』から追加できます。

## アプリ内の食事記録

Android の本人用 Web 健康画面には『Android アプリで食事を開く』を表示します。Chrome のユーザー操作から、パッケージを指定した `intent://meals#Intent;scheme=dev.kokoichi.lifeconsole;package=dev.kokoichi.lifeconsole;end` を開きます。アプリのインストールが必要です。共有画面には表示しません。写真・token・API 接続先を URI で渡さず、アプリ側の固定接続先と認証を使います。

一覧 →『食事を記録』→ 撮影または複数写真の選択 → ぼかし確認 → 保存 → 一覧、の順にアプリ内で操作します。写真から詳細も開けます。Web へは自動で戻りません。端末の戻る操作で食事一覧を閉じると呼び出し元へ戻ります。Web の従来の食事入力は引き続き利用できます。

ML Kit Subject Segmentation で全被写体の前景を自動抽出し、その外側を GPU でぼかした JPEG を生成します。料理ごとのタップ指定はありません。長辺最大 1,600 px、JPEG 品質 82、ぼかし半径は長辺の 4% です。初期状態はぼかしオンで、写真ごとに保存前のオン・オフ、回転、削除ができます。元画像とぼかし画像の両方を R2 に保存します。保存後も一覧・詳細の写真ごとにオン・オフを切り替えられます。表示の選択は端末の画面状態として扱い、DB や他端末へ同期しません。初回のモデル取得後、領域推定・ぼかしは端末内で行います。

日時、メモ、任意のカロリーを入力できます。カロリーが空欄の場合は既存の栄養解析経路を使い、保存した写真・メモを設定済みの AI サービスへ送ります。背景ぼかし自体には LLM・クラウド推論を使いません。両画像のアップロード完了後に食事を保存します。保存失敗時は同じ食事の ID で再試行し、入力を変更する場合は一覧へ戻って保存結果を確認します。栄養解析には写真の元画像を送ります。

保存済みの食事は詳細の『食事を編集』から、日時・日本語メモ・写真を変更できます。保存済み写真を外し、新しく撮影・選択した写真を追加して差し替えます。手入力カロリーと登録日時は保持します。保存後は『栄養を再解析』で変更した入力の推定を予約できます。解析待ちは編集でき、実行中の編集は拒否されます。ぼかし画像が未保存の写真には『この写真の背景をぼかす』を表示し、保存済みの元画像から端末内で生成・追加保存します。

release の食事 API は既存の本番 origin と OAuth を使います。debug の食事 API は `http://127.0.0.1:8790` に固定し、OAuth を使わずローカル検証データだけを保存します。debug の平文 HTTP 許可はローカル開発用です。表示用ウィジェットの接続先・認証は従来どおり本番のため、食事の debug 接続とは別です。

USB 接続した端末からローカル検証する場合は、食事 API を 8790、Web を 5175（API proxy は 8790）で起動し、次のポート転送を設定します。API のローカル D1 / R2 と runner の接続先を確認し、画面・保存確認だけなら runner は起動しません。

```bash
adb -s DEVICE_SERIAL reverse tcp:8790 tcp:8790
adb -s DEVICE_SERIAL reverse tcp:5175 tcp:5175
adb -s DEVICE_SERIAL shell am start -a android.intent.action.VIEW -d 'http://127.0.0.1:5175/health#android-meal-app' -p com.android.chrome
```

本番への配置と release の認証・保存経路の検証は別途必要です。Chrome の Intent URI は [公式資料](https://developer.chrome.com/docs/android/intents)、GPU から Bitmap への書き出しは [Android の移行ガイド](https://developer.android.com/guide/topics/renderscript/migrate) を参照してください。

## ビルドとインストール

JDK 17 と Android SDK Platform 36 が必要です。`ANDROID_HOME` または Git 管理対象外の `local.properties` に SDK の場所を設定します。

```bash
cd clients/android
./gradlew ktlintCheck :lint-rules:test :app:lintDebug :app:testDebugUnitTest :app:assembleDebug
adb -s DEVICE_SERIAL install -r app/build/outputs/apk/debug/app-debug.apk
```

開発用 APK は `app/build/outputs/apk/debug/app-debug.apk` に生成します。ローカルの debug key で署名し、Play ストアへの公開や配布用の署名管理は行いません。`pnpm check` は Android を含まないため、上記の Gradle コマンドも実行してください。

## 食事写真の背景ぼかし検証

開発用 APK には『食事ぼかし検証』という起動アイコンを追加しています。写真選択画面で食事の写真を選ぶと、ML Kit Subject Segmentation で全被写体の前景を自動抽出し、その外側をぼかして表示します。料理ごとのタップ指定はありません。『元画像』『背景ぼかし』『残す範囲』を切り替えて比較でき、『同じ写真で再計測』でモデル初期化後の処理時間を確認できます。

```bash
adb -s DEVICE_SERIAL shell am start -n dev.kokoichi.lifeconsole/.MealBlurActivity
```

初回は Google Play services 経由で認識モデルをダウンロードします。画像処理は端末内で行い、写真のアップロード、本番の食事保存、栄養解析は実行しません。カメラ撮影と加工画像の書き出しは、この検証画面の対象外です。長辺最大 1,600 px に縮小し、表示時に半径 20 dp のぼかしを適用します。画面の計測値は画像読込と領域推定の時間で、描画時間を含みません。

ML Kit は料理専用の認識ではなく、目立つ物体を前景として扱うベータ版の API です。食事の一部が背景としてぼけたり、余計な物が残ったりするため、全料理が残る精度を保証しません。[公式ガイド](https://developers.google.com/ml-kit/vision/subject-segmentation/android)を参照してください。この比較画面は `src/debug` に限定します。ML Kit の依存はアプリ内の食事記録でも使うため release APK にも含みます。

## 構成と検証

Kotlin と Android 標準の AppWidgetProvider / RemoteViews を使用します。グラフは Canvas で描画した Bitmap を表示します。通信と認証は専用の境界に閉じ込め、[import 制限](lint-rules/docs/no-forbidden-import.md) で他のファイルからの追加を検査します。

- `WidgetSnapshot.kt`: 日本時間の表示日・次の切り替え時刻・直近 30 日の抽出。
- `WidgetStore.kt`: API 応答の検証と端末内保存。
- `WidgetSyncService.kt`: JobScheduler、固定 origin への通信、失敗の表示。
- `WidgetSyncQueue.kt`: 実行単位の停止と完了。停止済みの完了通知で、同じ ID の次の実行を取り除かない。
- `WidgetLoginActivity.kt`: Chrome Custom Tabs での OAuth 認証と動的クライアント登録。
- `WidgetOAuth.kt`: OAuth metadata の取得、認証状態の保存、token の更新。
- `LoopbackOAuthReceiver.kt`: 端末内の callback の受信と state の検証。
- `DisplayWidgets.kt`: 体重グラフ・収集予定の描画と表示日の更新。縦横軸と推移の線を別の画像にし、ホーム側のリソースで配色を切り替えます。
- `WidgetLinks.kt`: 体重グラフと各収集日の Web リンク。
- `res/values/colors.xml` / `res/values-night/colors.xml`: Web の配色に対応するライト／ダークの色。
- `WeightEntry.kt` / `MealEntry.kt`: 体重の Web URL と食事のアプリ内 Intent。
- `MealActivity.kt`: 食事一覧・詳細・撮影・入力・保存。
- `MealPhotoProcessor.kt`: 自動前景抽出と保存用 JPEG の生成。
- `MealApiRepository.kt`: 食事と写真の既存 API、署名付き画像アップロード。

単体テストで OAuth callback の state・パス・重複パラメーターの検証と loopback の HTTP 応答、同期の停止・同じジョブ ID の再実行・遅れて届く完了通知・予期しない例外の伝達、および 8:30 の境界、月末・年末、日本時間の 30 日間、収集中止・複数区分・未登録期間・地区未設定・不正な API 値を検証します。実データとランチャー上の表示は実機で別途確認します。

## Lint と CI

ktlint 本体 `1.8.0` と Gradle plugin `14.2.0` を使用します。独自ルールの理由と制約は [lint-rules](lint-rules/README.md) を参照してください。

- `./gradlew ktlintCheck`: Kotlin と Gradle Kotlin DSL の標準ルール、カスタムルールを検査。
- `./gradlew ktlintFormat`: 自動整形。カスタムルールの違反は自動修正しません。
- `./gradlew :lint-rules:test`: カスタムルールの検出・非検出・抑制をテスト。
- `./gradlew :app:lintDebug`: リソース、Manifest、Android API の使い方を検査。

違反ファイルを削除しただけで増分検査に古い結果が残る場合は、`./gradlew ktlintCheck --rerun-tasks` で再検査します。[plugin の変更ファイル抽出](https://github.com/JLLeitschuh/ktlint-gradle/blob/v14.0.1/plugin/src/main/kotlin/org/jlleitschuh/gradle/ktlint/tasks/BaseKtLintCheckTask.kt) に基づく制約です。

[ci-android](../../.github/workflows/ci-android.yml) は Android または同 workflow の変更を含む `develop` / `main` 向け PR・両ブランチへの push と手動実行で、lint、カスタムルールとアプリの単体テスト、Debug APK ビルドを実行します。レポートは 7 日間保存し、APK の公開・実機へのインストールは行いません。

参考: [ウィジェット](https://developer.android.com/develop/ui/views/appwidgets)、[追加 API](https://developer.android.com/develop/ui/views/appwidgets/discoverability)、[アラームの制約](https://developer.android.com/develop/background-work/services/alarms)。

サイズ別の表示には [Android の responsive layouts](https://developer.android.com/develop/ui/views/appwidgets/layouts#provide-responsive-layouts) を使用します。
