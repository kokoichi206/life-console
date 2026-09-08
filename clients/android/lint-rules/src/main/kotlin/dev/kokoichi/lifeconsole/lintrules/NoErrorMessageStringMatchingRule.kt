package dev.kokoichi.lifeconsole.lintrules

import com.pinterest.ktlint.rule.engine.core.api.AutocorrectDecision
import com.pinterest.ktlint.rule.engine.core.api.ElementType
import com.pinterest.ktlint.rule.engine.core.api.Rule
import com.pinterest.ktlint.rule.engine.core.api.RuleAutocorrectApproveHandler
import com.pinterest.ktlint.rule.engine.core.api.RuleId
import org.jetbrains.kotlin.com.intellij.lang.ASTNode
import org.jetbrains.kotlin.lexer.KtTokens
import org.jetbrains.kotlin.psi.KtBinaryExpression
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.KtExpression
import org.jetbrains.kotlin.psi.KtNameReferenceExpression
import org.jetbrains.kotlin.psi.KtParenthesizedExpression
import org.jetbrains.kotlin.psi.KtPostfixExpression
import org.jetbrains.kotlin.psi.KtQualifiedExpression
import org.jetbrains.kotlin.psi.KtStringTemplateExpression

class NoErrorMessageStringMatchingRule :
    Rule(
        ruleId = RuleId("life-console:no-error-message-string-matching"),
        about = About(
            maintainer = "kokoichi206/life-console",
            repositoryUrl = "https://github.com/kokoichi206/life-console",
        ),
    ),
    RuleAutocorrectApproveHandler {
    override fun beforeVisitChildNodes(
        node: ASTNode,
        emit: (
            offset: Int,
            errorMessage: String,
            canBeAutoCorrected: Boolean,
        ) -> AutocorrectDecision,
    ) {
        when (node.elementType) {
            ElementType.DOT_QUALIFIED_EXPRESSION, ElementType.SAFE_ACCESS_EXPRESSION -> {
                val expression = node.psi as KtQualifiedExpression
                if (isStringMatchingOnMessage(expression)) {
                    emit(node.startOffset, ERROR_MESSAGE, false)
                }
            }

            ElementType.BINARY_EXPRESSION -> {
                val expression = node.psi as KtBinaryExpression
                if (isLiteralComparisonWithMessage(expression)) {
                    emit(node.startOffset, ERROR_MESSAGE, false)
                }
            }
        }
    }

    private fun isStringMatchingOnMessage(expression: KtQualifiedExpression): Boolean {
        val call = expression.selectorExpression as? KtCallExpression ?: return false
        val callee =
            (call.calleeExpression as? KtNameReferenceExpression)?.getReferencedName()
                ?: return false
        return callee in STRING_MATCHING_METHODS &&
            expression.receiverExpression.refersToMessageProperty()
    }

    private fun isLiteralComparisonWithMessage(expression: KtBinaryExpression): Boolean {
        val token = expression.operationToken
        if (token != KtTokens.EQEQ && token != KtTokens.EXCLEQ) return false
        val left = expression.left ?: return false
        val right = expression.right ?: return false
        return (left.refersToMessageProperty() && right is KtStringTemplateExpression) ||
            (right.refersToMessageProperty() && left is KtStringTemplateExpression)
    }

    private fun KtExpression.refersToMessageProperty(): Boolean = when (this) {
        is KtNameReferenceExpression -> getReferencedName() in MESSAGE_PROPERTIES

        is KtQualifiedExpression -> selectorRefersToMessageProperty()

        is KtPostfixExpression -> baseExpression?.refersToMessageProperty() == true

        is KtParenthesizedExpression -> expression?.refersToMessageProperty() == true

        is KtBinaryExpression ->
            operationToken == KtTokens.ELVIS &&
                left?.refersToMessageProperty() == true

        else -> false
    }

    private fun KtQualifiedExpression.selectorRefersToMessageProperty(): Boolean =
        when (val selector = selectorExpression) {
            is KtNameReferenceExpression -> selector.getReferencedName() in MESSAGE_PROPERTIES

            is KtCallExpression -> {
                val callee =
                    (selector.calleeExpression as? KtNameReferenceExpression)?.getReferencedName()
                callee != null &&
                    callee in MESSAGE_PRESERVING_TRANSFORMS &&
                    receiverExpression.refersToMessageProperty()
            }

            else -> false
        }

    internal companion object {
        internal const val ERROR_MESSAGE =
            "例外メッセージ文字列への部分一致・比較でエラーを分類しない。例外の型で分類する"

        private val STRING_MATCHING_METHODS =
            setOf("contains", "startsWith", "endsWith", "matches", "equals", "contentEquals")

        private val MESSAGE_PROPERTIES = setOf("message", "localizedMessage")

        private val MESSAGE_PRESERVING_TRANSFORMS =
            setOf("orEmpty", "toString", "lowercase", "uppercase", "trim")
    }
}
