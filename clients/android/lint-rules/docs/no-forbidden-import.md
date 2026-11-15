# 直接通信・WebView の import を禁止する

体重の記録 URL は外部ブラウザへ渡し、食事はアプリ内で記録します。食事・写真の API 通信は `MealApiRepository.kt`、表示用ウィジェットの API 通信は `WidgetSyncService.kt`、OAuth metadata と token 更新は `WidgetOAuth.kt`、端末内 callback は `LoopbackOAuthReceiver.kt` に限定します。他のファイルから直接通信や WebView を追加することを防ぎます。

`.editorconfig` ではこの 4 ファイルと loopback の単体テストにだけ `java.net` の例外を設けます。表示用ウィジェットの API 通信は固定した本番 origin の GET のみです。食事 API は build type ごとの固定 origin に GET / POST し、写真は API の指定先へ PUT します。署名付きアップロードが別 origin の場合は Bearer token を付けません。いずれもリダイレクト先へ Bearer token を転送しません。認証画面は AppAuth Android と Chrome Custom Tabs を使い、WebView は使用しません。loopback listener は `127.0.0.1` にだけ bind します。

`clients/android/.editorconfig` の `app/src/**.kt` に、`life_console_forbidden_import_prefixes` で禁止対象を指定しています。

- `android.webkit`
- `java.net`
- `javax.net`
- `okhttp3`
- `retrofit2`

```kotlin
// Bad
import android.webkit.WebView
import java.net.URL

// Good
import android.content.Intent
import android.net.Uri
```

完全一致と、ドットで区切られたパッケージ配下の import を検出します。alias と wildcard も対象です。たとえば `android.webkitextra` は `android.webkit` と別のパッケージなので検出しません。設定のないファイルには import 制限を適用しません。自動修正はしません。

構文上の import だけを検査し、完全修飾名での直接呼び出しや依存ライブラリ内部の通信は検出しません。すべての通信経路を遮断するセキュリティ境界ではありません。
