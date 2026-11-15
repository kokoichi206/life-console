package dev.kokoichi.lifeconsole

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class MealApiRepositoryTest {
    private fun record(photoId: Any = JSONObject.NULL, additional: List<String> = emptyList()) =
        JSONObject().put("id", "meal").put("photoId", photoId)
            .put(
                "blurredPhotoIds",
                JSONArray(),
            ).put("additionalPhotoIds", JSONArray(additional)).put("memo", "架空の食事")
            .put("tags", JSONArray()).put("occurredAt", "2026-11-14T03:00:00Z")

    @Test
    fun memoOnlyMealHasNoPhoto() {
        assertEquals(emptyList<String>(), parseMealRecord(record()).photoIds)
    }

    @Test
    fun allMealPhotosKeepApiOrder() {
        assertEquals(
            listOf("cover", "second", "third"),
            parseMealRecord(record("cover", listOf("second", "third"))).photoIds,
        )
    }

    @Test(expected = JSONException::class)
    fun missingAdditionalPhotosIsNotTreatedAsEmpty() {
        val json = record().apply { remove("additionalPhotoIds") }
        parseMealRecord(json)
    }
}
