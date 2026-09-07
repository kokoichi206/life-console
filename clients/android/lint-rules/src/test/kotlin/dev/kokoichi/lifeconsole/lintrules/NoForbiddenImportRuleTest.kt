package dev.kokoichi.lifeconsole.lintrules

import com.pinterest.ktlint.test.KtLintAssertThat.Companion.assertThatRule
import dev.kokoichi.lifeconsole.lintrules.NoForbiddenImportRule.Companion.FORBIDDEN_IMPORT_PREFIXES_PROPERTY
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

class NoForbiddenImportRuleTest {
    private val ruleAssertThat = assertThatRule { NoForbiddenImportRule() }

    private val forbiddenImportPrefixes =
        "android.webkit, java.net"

    @ParameterizedTest
    @ValueSource(strings = ["android.webkit.WebView as Browser", "android.webkit.*"])
    fun rejectsAliasedAndWildcardImports(importName: String) {
        ruleAssertThat("import $importName\n")
            .withEditorConfigOverride(FORBIDDEN_IMPORT_PREFIXES_PROPERTY to forbiddenImportPrefixes)
            .hasLintViolationWithoutAutoCorrect(
                1,
                1,
                NoForbiddenImportRule.errorMessage(
                    importName.substringBefore(" as "),
                    "android.webkit",
                ),
            )
    }

    @Test
    fun rejectsExactImportMatch() {
        ruleAssertThat("import android.webkit.WebView\n")
            .withEditorConfigOverride(
                FORBIDDEN_IMPORT_PREFIXES_PROPERTY to "android.webkit.WebView",
            )
            .hasLintViolationWithoutAutoCorrect(
                1,
                1,
                NoForbiddenImportRule.errorMessage(
                    "android.webkit.WebView",
                    "android.webkit.WebView",
                ),
            )
    }

    @Test
    fun 禁止プレフィックス配下のimportを検出する() {
        val code =
            """
            package com.example

            import android.webkit.WebView
            """.trimIndent()

        ruleAssertThat(code)
            .withEditorConfigOverride(FORBIDDEN_IMPORT_PREFIXES_PROPERTY to forbiddenImportPrefixes)
            .hasLintViolationWithoutAutoCorrect(
                3,
                1,
                NoForbiddenImportRule.errorMessage(
                    "android.webkit.WebView",
                    "android.webkit",
                ),
            )
    }

    @Test
    fun 禁止パッケージのサブパッケージも検出する() {
        val code =
            """
            package com.example

            import java.net.http.HttpClient
            """.trimIndent()

        ruleAssertThat(code)
            .withEditorConfigOverride(FORBIDDEN_IMPORT_PREFIXES_PROPERTY to forbiddenImportPrefixes)
            .hasLintViolationWithoutAutoCorrect(
                3,
                1,
                NoForbiddenImportRule.errorMessage(
                    "java.net.http.HttpClient",
                    "java.net",
                ),
            )
    }

    @Test
    fun パッケージ境界を跨がない前方一致は検出しない() {
        val code =
            """
            package com.example

            import android.webkitextra.SomeClass
            """.trimIndent()

        ruleAssertThat(code)
            .withEditorConfigOverride(FORBIDDEN_IMPORT_PREFIXES_PROPERTY to forbiddenImportPrefixes)
            .hasNoLintViolations()
    }

    @Test
    fun 禁止リスト外のimportは検出しない() {
        val code =
            """
            package com.example

            import android.content.Intent
            import kotlinx.coroutines.launch
            """.trimIndent()

        ruleAssertThat(code)
            .withEditorConfigOverride(FORBIDDEN_IMPORT_PREFIXES_PROPERTY to forbiddenImportPrefixes)
            .hasNoLintViolations()
    }

    @Test
    fun プロパティ未設定なら何も検出しない() {
        val code =
            """
            package com.example

            import android.webkit.WebView
            """.trimIndent()

        ruleAssertThat(code).hasNoLintViolations()
    }

    @Test
    fun Suppressアノテーションで抑制できる() {
        val code =
            """
            @file:Suppress("ktlint:life-console:no-forbidden-import")

            package com.example

            import android.webkit.WebView
            """.trimIndent()

        ruleAssertThat(code)
            .withEditorConfigOverride(FORBIDDEN_IMPORT_PREFIXES_PROPERTY to forbiddenImportPrefixes)
            .hasNoLintViolations()
    }
}
