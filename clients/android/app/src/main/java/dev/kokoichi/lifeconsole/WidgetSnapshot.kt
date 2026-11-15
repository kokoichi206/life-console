package dev.kokoichi.lifeconsole

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

internal val japanZone: ZoneId = ZoneId.of("Asia/Tokyo")
internal const val CONSOLE_ORIGIN = "https://life-console.kokoichi206.workers.dev"

internal data class WidgetWeight(val occurredAt: Instant, val kg: Double)
internal data class WidgetCollection(val date: LocalDate, val title: String, val id: String)
internal data class WidgetCalendar(
    val configured: Boolean,
    val validFrom: LocalDate,
    val validThrough: LocalDate,
    val events: List<WidgetCollection>,
    val queriedFrom: LocalDate,
    val queriedThrough: LocalDate,
) {
    fun summary(date: LocalDate): String = when {
        !configured -> "収集地区を設定してください"
        date < validFrom || date > validThrough -> "日程未登録"
        date < queriedFrom || date > queriedThrough -> "日程未取得・同期してください"
        else -> events.filter { it.date == date }.joinToString("・") { it.title }.ifEmpty { "収集なし" }
    }
}

internal fun collectionDisplayDate(now: Instant): LocalDate {
    val local = now.atZone(japanZone)
    return local.toLocalDate().plusDays(if (local.toLocalTime() < LocalTime.of(8, 30)) 0 else 1)
}

internal fun nextCollectionSwitch(now: Instant): Instant =
    collectionDisplayDate(now).atTime(8, 30).atZone(japanZone).toInstant()

internal fun recentWeights(weights: List<WidgetWeight>, now: Instant): List<WidgetWeight> {
    val today = now.atZone(japanZone).toLocalDate()
    val firstDay = today.minusDays(29)
    return weights.filter {
        val date = it.occurredAt.atZone(japanZone).toLocalDate()
        date >= firstDay && date <= today
    }.sortedBy { it.occurredAt }
}
