# 直接通信・WebView の import を禁止する

記録 URL は外部ブラウザへ渡します。表示用ウィジェットの同期は `WidgetSyncService.kt`、Cloudflare Access のログインは `WidgetLoginActivity.kt` に限定します。他のファイルから通信処理や WebView を追加することを防ぎます。

`.editorconfig` では上記 2 ファイルにだけ例外を設けます。同期処理は固定した本番 origin の GET のみを実行し、リダイレクト先へ Cookie を転送しません。ログイン画面は HTTPS のみを許可し、JavaScript bridge・ファイルアクセスを公開しません。

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
