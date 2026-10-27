package dev.kokoichi.lifeconsole

import android.content.Context
import java.time.Instant
import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject

internal class WidgetStore(context: Context) {
    val preferences = context.getSharedPreferences("widget_data", Context.MODE_PRIVATE)

    val weights: List<WidgetWeight> get() = preferences.getString("weights", null)?.let {
        parseWeights(JSONArray(it))
    }.orEmpty()
    val calendar: WidgetCalendar? get() = preferences.getString("calendar", null)?.let {
        parseCalendar(JSONObject(it))
    }
    val syncedAt: Instant? get() = preferences.getString("synced_at", null)?.let(Instant::parse)
    val error: String? get() = preferences.getString("error", null)

    fun save(weights: JSONArray, calendar: JSONObject) {
        // 外部応答の検証が両方成功してから、一組のスナップショットとして保存する。
        parseWeights(weights)
        parseCalendar(calendar)
        preferences.edit().putString(
            "weights",
            weights.toString(),
        ).putString("calendar", calendar.toString())
            .putString("synced_at", Instant.now().toString()).remove("error").apply()
    }

    fun saveError(message: String) {
        preferences.edit().putString("error", message).apply()
    }
}

internal fun parseWeights(entries: JSONArray): List<WidgetWeight> =
    (0 until entries.length()).map { index ->
        val entry = entries.getJSONObject(index)
        val kg = entry.getDouble("weightKg")
        require(kg.isFinite() && kg > 0)
        WidgetWeight(Instant.parse(entry.getString("occurredAt")), kg)
    }

internal fun parseCalendar(calendar: JSONObject): WidgetCalendar {
    val entries = calendar.getJSONArray("events")
    val events = (0 until entries.length()).mapNotNull { index ->
        val entry = entries.getJSONObject(index)
        if (entry.getString("status") == "canceled" || entry.getString("source") != "garbage") {
            null
        } else {
            require(entry.getString("status") == "active")
            WidgetCollection(
                LocalDate.parse(entry.getString("date")),
                entry.getString("title"),
                entry.getString("id"),
            )
        }
    }
    return WidgetCalendar(
        !calendar.isNull("settings"),
        LocalDate.parse(calendar.getString("validFrom")),
        LocalDate.parse(calendar.getString("validThrough")),
        events,
        LocalDate.parse(calendar.getString("queriedFrom")),
        LocalDate.parse(calendar.getString("queriedThrough")),
    )
}
