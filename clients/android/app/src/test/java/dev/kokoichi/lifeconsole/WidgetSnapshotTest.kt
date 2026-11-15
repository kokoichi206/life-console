package dev.kokoichi.lifeconsole

import java.time.Instant
import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetSnapshotTest {
    @Test
    fun switchesAtEightThirtyJapanTime() {
        assertEquals(
            LocalDate.parse("2026-10-27"),
            collectionDisplayDate(Instant.parse("2026-10-26T23:29:59Z")),
        )
        assertEquals(
            LocalDate.parse("2026-10-28"),
            collectionDisplayDate(Instant.parse("2026-10-26T23:30:00Z")),
        )
        assertEquals(
            LocalDate.parse("2026-10-28"),
            collectionDisplayDate(Instant.parse("2026-10-27T15:00:00Z")),
        )
        assertEquals(
            LocalDate.parse("2027-01-01"),
            collectionDisplayDate(Instant.parse("2026-12-30T23:30:00Z")),
        )
    }

    @Test
    fun schedulesNextSwitchAcrossMonthAndYearBoundaries() {
        assertEquals(
            Instant.parse("2026-10-26T23:30:00Z"),
            nextCollectionSwitch(Instant.parse("2026-10-26T23:29:59Z")),
        )
        assertEquals(
            Instant.parse("2026-10-27T23:30:00Z"),
            nextCollectionSwitch(Instant.parse("2026-10-26T23:30:00Z")),
        )
        assertEquals(
            Instant.parse("2026-12-31T23:30:00Z"),
            nextCollectionSwitch(Instant.parse("2026-12-30T23:30:00Z")),
        )
    }

    @Test
    fun keepsOnlyThirtyJapanCalendarDaysAndSortsRecords() {
        val now = Instant.parse("2026-10-27T03:00:00Z")
        val first = WidgetWeight(Instant.parse("2026-09-27T15:00:00Z"), 70.0)
        val latest = WidgetWeight(now, 69.0)
        val old = WidgetWeight(Instant.parse("2026-09-27T14:59:59Z"), 71.0)
        val tomorrow = WidgetWeight(Instant.parse("2026-10-27T15:00:00Z"), 68.0)
        assertEquals(
            listOf(first, latest),
            recentWeights(listOf(latest, tomorrow, first, old), now),
        )
        assertTrue(recentWeights(emptyList(), now).isEmpty())
    }

    @Test
    fun keepsModifiedDatesAndOmitsCanceledCollections() {
        val calendar =
            parseCalendar(
                JSONObject(
                    """
            {"settings":{"district":"C"},"validFrom":"2026-04-01","validThrough":"2027-03-31",
             "queriedFrom":"2026-10-27","queriedThrough":"2026-11-27",
             "events":[
              {"id":"plastic-1","date":"2026-10-28","source":"garbage","status":"active","title":"プラマーク"},
              {"id":"paper-1","date":"2026-10-28","source":"garbage","status":"active","title":"古紙類"},
              {"date":"2026-10-28","source":"garbage","status":"canceled","title":"缶・びん"}]}
                    """.trimIndent(),
                ),
            )
        assertEquals("プラマーク・古紙類", calendar.summary(LocalDate.parse("2026-10-28")))
        assertEquals("収集なし", calendar.summary(LocalDate.parse("2026-10-29")))
        assertEquals("日程未取得・同期してください", calendar.summary(LocalDate.parse("2026-11-28")))
        assertEquals("日程未登録", calendar.summary(LocalDate.parse("2027-04-01")))
        assertEquals(
            "収集地区を設定してください",
            calendar.copy(configured = false).summary(LocalDate.parse("2026-10-28")),
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsInvalidWeightFromApi() {
        parseWeights(JSONArray("""[{"occurredAt":"2026-10-27T03:00:00Z","weightKg":-1}]"""))
    }
}
