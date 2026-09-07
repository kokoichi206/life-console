# 例外メッセージでエラーを分類しない

メッセージの文言はライブラリの更新やロケールで変わるため、例外の型や外部 API が定義するエラーコードで分類します。

```kotlin
// Bad
error.message?.contains("not found")
error.localizedMessage == "Not found"

// Good
error is java.io.FileNotFoundException
```

`message` / `localizedMessage` に対する `contains`、`startsWith`、`endsWith`、`matches`、`equals`、`contentEquals` と、文字列リテラルとの `==` / `!=` を検出します。括弧、`!!`、Elvis 演算子、`orEmpty`、`toString`、`lowercase`、`uppercase`、`trim` を挟んだ式も対象です。null 比較、表示やログ用の参照は許可します。自動修正はしません。

ktlint は型を解決しないため、例外以外の `message` プロパティも対象になります。変数への代入を追跡するデータフロー解析、文字列を受け手にした逆向きのメソッド呼び出し、`when` の文字列分岐は対象外です。

誤検出を抑制する場合は、その理由をコメントで残します。

```kotlin
@Suppress("ktlint:life-console:no-error-message-string-matching")
```
