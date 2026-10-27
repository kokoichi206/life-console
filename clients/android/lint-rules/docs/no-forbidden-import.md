# 直接通信・WebView の import を禁止する

記録 URL は外部ブラウザへ渡します。表示用ウィジェットの API 通信は `WidgetSyncService.kt`、OAuth metadata と token 更新は `WidgetOAuth.kt`、端末内 callback は `LoopbackOAuthReceiver.kt` に限定します。他のファイルから直接通信や WebView を追加することを防ぎます。

`.editorconfig` ではこの 3 ファイルと loopback の単体テストにだけ `java.net` の例外を設けます。API 通信は固定した本番 origin の GET のみで、リダイレクト先へ Bearer token を転送しません。認証画面は AppAuth Android と Chrome Custom Tabs を使い、WebView は使用しません。loopback listener は `127.0.0.1` にだけ bind します。

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
