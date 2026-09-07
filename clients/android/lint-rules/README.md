# Android のカスタム lint

[minken-mobile の ruleset](https://github.com/Wareware-PJ/minken-mobile/tree/main/android/lint-rules) を基にした ktlint のカスタムルールです。ルールセット ID は `life-console` です。

| Rule ID | 検査内容 |
| --- | --- |
| `life-console:no-error-message-string-matching` | [例外メッセージの文字列によるエラー分類を禁止](docs/no-error-message-string-matching.md) |
| `life-console:no-forbidden-import` | [直接通信・WebView の import を禁止](docs/no-forbidden-import.md) |

ルート `build.gradle.kts` が `:app` の `ktlintRuleset` にこのモジュールを追加します。`RuleSetProviderV3` を `META-INF/services` に登録し、`./gradlew ktlintCheck` と `ktlintFormat` から読み込みます。ルール実装自身への依存は循環するため除き、`:lint-rules` には標準ルールを適用します。ルートの Gradle Kotlin DSL も標準ルールで検査します。

ktlint 本体とルール API のバージョンは `gradle/libs.versions.toml` に集約しています。実行側が持つ API は `compileOnly` とし、ルールの JAR には同梱しません。

```bash
cd clients/android
./gradlew :lint-rules:test ktlintCheck
```

ルールを追加するときは、実装、`LifeConsoleRuleSetProvider` への登録、検出・非検出・抑制のテスト、理由と検出範囲のドキュメントを揃えます。既存コードの違反も同じ変更内で直してください。

型解決を伴わない構文検査なので、誤検出は理由コメントを添えて `@Suppress("ktlint:life-console:<rule-id>")` で抑制できます。
