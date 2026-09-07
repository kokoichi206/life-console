plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "2.2.21" apply false
    id("org.jetbrains.kotlin.jvm") version "2.2.21" apply false
    id("org.jlleitschuh.gradle.ktlint") version "14.0.1"
}

val ktlintVersion = libs.versions.ktlint.get()

allprojects {
    apply(plugin = "org.jlleitschuh.gradle.ktlint")
    extensions.configure<org.jlleitschuh.gradle.ktlint.KtlintExtension> {
        version.set(ktlintVersion)
        filter {
            exclude("**/build/**")
        }
    }
}

subprojects {
    // ruleset 自身への依存はビルドを循環させるため除く。
    if (path != ":lint-rules") {
        dependencies.add("ktlintRuleset", project(":lint-rules"))
    }
}
