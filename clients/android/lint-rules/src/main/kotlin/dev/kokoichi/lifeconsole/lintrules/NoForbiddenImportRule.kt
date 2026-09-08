package dev.kokoichi.lifeconsole.lintrules

import com.pinterest.ktlint.rule.engine.core.api.AutocorrectDecision
import com.pinterest.ktlint.rule.engine.core.api.ElementType
import com.pinterest.ktlint.rule.engine.core.api.Rule
import com.pinterest.ktlint.rule.engine.core.api.RuleAutocorrectApproveHandler
import com.pinterest.ktlint.rule.engine.core.api.RuleId
import com.pinterest.ktlint.rule.engine.core.api.editorconfig.EditorConfig
import com.pinterest.ktlint.rule.engine.core.api.editorconfig.EditorConfigProperty
import org.ec4j.core.model.PropertyType
import org.jetbrains.kotlin.com.intellij.lang.ASTNode
import org.jetbrains.kotlin.psi.KtImportDirective

class NoForbiddenImportRule :
    Rule(
        ruleId = RuleId("life-console:no-forbidden-import"),
        about = About(
            maintainer = "kokoichi206/life-console",
            repositoryUrl = "https://github.com/kokoichi206/life-console",
        ),
        usesEditorConfigProperties = setOf(FORBIDDEN_IMPORT_PREFIXES_PROPERTY),
    ),
    RuleAutocorrectApproveHandler {
    private var forbiddenPrefixes: List<String> = emptyList()

    override fun beforeFirstNode(editorConfig: EditorConfig) {
        forbiddenPrefixes =
            editorConfig[FORBIDDEN_IMPORT_PREFIXES_PROPERTY]
                .split(",")
                .map { it.trim() }
                .filter { it.isNotEmpty() }
    }

    override fun beforeVisitChildNodes(
        node: ASTNode,
        emit: (
            offset: Int,
            errorMessage: String,
            canBeAutoCorrected: Boolean,
        ) -> AutocorrectDecision,
    ) {
        if (node.elementType != ElementType.IMPORT_DIRECTIVE || forbiddenPrefixes.isEmpty()) return
        val importPath = (node.psi as KtImportDirective).importPath?.pathStr ?: return
        val matched =
            forbiddenPrefixes.firstOrNull { importPath == it || importPath.startsWith("$it.") }
                ?: return
        emit(node.startOffset, errorMessage(importPath, matched), false)
    }

    internal companion object {
        internal val FORBIDDEN_IMPORT_PREFIXES_PROPERTY: EditorConfigProperty<String> =
            EditorConfigProperty(
                type =
                    PropertyType(
                        "life_console_forbidden_import_prefixes",
                        "この階層で import を禁止するパッケージプレフィックス（カンマ区切り・パッケージ境界で前方一致）",
                        PropertyType.PropertyValueParser.IDENTITY_VALUE_PARSER,
                    ),
                defaultValue = "",
            )

        internal fun errorMessage(importPath: String, matchedPrefix: String): String =
            "この階層では import できない: $importPath（禁止設定: $matchedPrefix）。" +
                "理由と代替は clients/android/lint-rules/docs/no-forbidden-import.md を参照"
    }
}
