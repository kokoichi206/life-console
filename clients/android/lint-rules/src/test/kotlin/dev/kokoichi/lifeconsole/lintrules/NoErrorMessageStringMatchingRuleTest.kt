package dev.kokoichi.lifeconsole.lintrules

import com.pinterest.ktlint.test.KtLintAssertThat.Companion.assertThatRule
import org.junit.jupiter.api.Test

class NoErrorMessageStringMatchingRuleTest {
    private val ruleAssertThat = assertThatRule { NoErrorMessageStringMatchingRule() }

    @Test
    fun 例外メッセージへのcontainsによる分岐を検出する() {
        val code =
            """
            fun classify(error: Throwable): Boolean {
              return error.message?.contains("NotAuthorizedException") == true
            }
            """.trimIndent()

        ruleAssertThat(code)
            .hasLintViolationWithoutAutoCorrect(
                2,
                10,
                NoErrorMessageStringMatchingRule.ERROR_MESSAGE,
            )
    }

    @Test
    fun localizedMessageへのstartsWithを検出する() {
        val code =
            """
            fun classify(error: Throwable): Boolean {
              return error.localizedMessage!!.startsWith("Incorrect")
            }
            """.trimIndent()

        ruleAssertThat(code)
            .hasLintViolationWithoutAutoCorrect(
                2,
                10,
                NoErrorMessageStringMatchingRule.ERROR_MESSAGE,
            )
    }

    @Test
    fun causeを辿ったメッセージへのマッチも検出する() {
        val code =
            """
            fun classify(error: Throwable): Boolean {
              return error.cause?.message?.contains("password policy", ignoreCase = true) == true
            }
            """.trimIndent()

        ruleAssertThat(code)
            .hasLintViolationWithoutAutoCorrect(
                2,
                10,
                NoErrorMessageStringMatchingRule.ERROR_MESSAGE,
            )
    }

    @Test
    fun メッセージと文字列リテラルの等価比較を検出する() {
        val code =
            """
            fun isUserNotFound(error: Throwable): Boolean {
              return error.message == "User does not exist."
            }
            """.trimIndent()

        ruleAssertThat(code)
            .hasLintViolationWithoutAutoCorrect(
                2,
                10,
                NoErrorMessageStringMatchingRule.ERROR_MESSAGE,
            )
    }

    @Test
    fun orEmptyを挟んだマッチも検出する() {
        val code =
            """
            fun classify(error: Throwable): Boolean {
              return error.message.orEmpty().contains("NotAuthorizedException")
            }
            """.trimIndent()

        ruleAssertThat(code)
            .hasLintViolationWithoutAutoCorrect(
                2,
                10,
                NoErrorMessageStringMatchingRule.ERROR_MESSAGE,
            )
    }

    @Test
    fun 拡張関数内の暗黙レシーバのmessageも検出する() {
        val code =
            """
            fun Throwable.isWrongPassword(): Boolean {
              return message?.contains("incorrect") == true
            }
            """.trimIndent()

        ruleAssertThat(code)
            .hasLintViolationWithoutAutoCorrect(
                2,
                10,
                NoErrorMessageStringMatchingRule.ERROR_MESSAGE,
            )
    }

    @Test
    fun ktlintは型解決を持たないためmessageという名前のプロパティは由来を問わず検出する() {
        val code =
            """
            fun search(state: UiState): Boolean {
              return state.message.contains("error")
            }
            """.trimIndent()

        ruleAssertThat(code)
            .hasLintViolationWithoutAutoCorrect(
                2,
                10,
                NoErrorMessageStringMatchingRule.ERROR_MESSAGE,
            )
    }

    @Test
    fun nullとの比較は検出しない() {
        val code =
            """
            fun hasMessage(error: Throwable): Boolean {
              return error.message != null
            }
            """.trimIndent()

        ruleAssertThat(code).hasNoLintViolations()
    }

    @Test
    fun 表示やログのためのメッセージ参照は検出しない() {
        val code =
            """
            fun describe(error: Throwable): String {
              log(error.message)
              return error.message ?: "不明なエラー"
            }
            """.trimIndent()

        ruleAssertThat(code).hasNoLintViolations()
    }

    @Test
    fun message以外のプロパティへの文字列マッチは検出しない() {
        val code =
            """
            fun isJapanese(user: User): Boolean {
              return user.locale.contains("ja")
            }
            """.trimIndent()

        ruleAssertThat(code).hasNoLintViolations()
    }

    @Test
    fun Suppressアノテーションで抑制できる() {
        val code =
            """
            @Suppress("ktlint:life-console:no-error-message-string-matching")
            fun classify(error: Throwable): Boolean {
              return error.message?.contains("NotAuthorizedException") == true
            }
            """.trimIndent()

        ruleAssertThat(code).hasNoLintViolations()
    }
}
