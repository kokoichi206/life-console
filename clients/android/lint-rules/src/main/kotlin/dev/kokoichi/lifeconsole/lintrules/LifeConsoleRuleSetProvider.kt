package dev.kokoichi.lifeconsole.lintrules

import com.pinterest.ktlint.cli.ruleset.core.api.RuleSetProviderV3
import com.pinterest.ktlint.rule.engine.core.api.RuleProvider
import com.pinterest.ktlint.rule.engine.core.api.RuleSetId

class LifeConsoleRuleSetProvider : RuleSetProviderV3(RuleSetId("life-console")) {
    override fun getRuleProviders(): Set<RuleProvider> = setOf(
        RuleProvider { NoErrorMessageStringMatchingRule() },
        RuleProvider { NoForbiddenImportRule() },
    )
}
