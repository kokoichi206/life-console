# Life Console Widget

体重と食事の入力画面を開く、2 種類の Android ウィジェットです。各ウィジェットはボタン 1 個で、個別に配置できます。Android 12 以上に対応します。

## 使い方

1. APK をインストールし、Life Console Widget を開きます。
2. 『体重ウィジェットを追加』または『食事ウィジェットを追加』を押して、ランチャーの追加画面で確定します。
3. 配置したウィジェットをタップします。

自動追加に対応しないランチャーでは、ホーム画面を長押しし、ウィジェット一覧から『体重を記録』または『食事を記録』を追加します。アプリにもこの手順を表示します。Oshi Launcher では『ホームに追加』→『ウィジェット』→『Life Console Widget』→追加したいウィジェットを選びます。

起動先は体重が `https://life-console.kokoichi206.workers.dev/health?entry=weight`、食事が `https://life-console.kokoichi206.workers.dev/health?entry=meal` です。URL を扱うブラウザまたはインストール済み Web アプリで開きます。Cloudflare Access のセッションが切れていればログインが必要です。アプリ内の各『記録画面を開く』ボタンからも対応する URL を開けます。

## ビルドとインストール

JDK 17 と Android SDK Platform 36 が必要です。`ANDROID_HOME` または Git 管理対象外の `local.properties` に SDK の場所を設定します。

```bash
cd clients/android
./gradlew :app:assembleDebug :app:lintDebug
adb -s DEVICE_SERIAL install -r app/build/outputs/apk/debug/app-debug.apk
```

開発用 APK は `app/build/outputs/apk/debug/app-debug.apk` に生成します。ローカルの debug key で署名し、Play ストアへの公開や配布用の署名管理は行いません。既存の `pnpm check` は Android を対象に含めないため、変更時は上記の Gradle コマンドも実行してください。

## 構成

- Kotlin と Android 標準の `AppWidgetProvider` / `RemoteViews` を使用。
- 2 × 1 のウィジェット。横方向にリサイズ可能。
- `PendingIntent.getActivity` で URL を直接起動。
- API 呼び出し・定期更新・バックグラウンド処理・データ保存なし。INTERNET 権限も不要。
- `WeightEntry.kt` / `MealEntry.kt` が起動 URL、`weight_widget.xml` / `meal_widget.xml` が各ウィジェットの見た目を定義。

[Android のウィジェット実装](https://developer.android.com/develop/ui/views/appwidgets) と [ホーム画面への追加 API](https://developer.android.com/develop/ui/views/appwidgets/discoverability) を参照。

## 動作確認（2026-09-08）

- Debug APK のビルドと Android Lint が成功。Lint はエラー 0 件、更新推奨・バックアップ設定・単色アイコンに関する警告 4 件。
- Pixel 6（API 37）の Oshi Launcher で、一覧からの追加と実ウィジェットの表示を確認。
- 実ウィジェットのタップで Chrome が起動し、Cloudflare Access のログイン画面に到達。ログイン後の戻り先に `/health?entry=weight` が保持されていることを確認。
- この端末では Access 未ログインのため、ログイン後の入力シート表示・記録保存は未確認。本番の記録は追加していない。
- 自動追加 API に対応するランチャーと Android 12〜16 での実機操作は未確認。
