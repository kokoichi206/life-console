package dev.kokoichi.lifeconsole

import android.content.SharedPreferences
import java.lang.reflect.Proxy
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetStoreTest {
    @Test
    fun remembersRequiredReconnectionUntilSuccessfulSync() {
        val preferences = inMemoryPreferences()
        val store = WidgetStore(preferences)
        store.saveError("再接続が必要です", requiresLogin = true)
        assertTrue(WidgetStore(preferences).requiresLogin)

        store.save(JSONArray(), calendar())

        val reopened = WidgetStore(preferences)
        assertFalse(reopened.requiresLogin)
        assertNull(reopened.error)
        assertNotNull(reopened.syncedAt)
    }

    @Test
    fun distinguishesNetworkFailureAndKeepsTheLastSnapshot() {
        val store = WidgetStore(inMemoryPreferences())
        store.save(
            JSONArray("""[{"weightKg":70.0,"occurredAt":"2026-10-31T00:00:00Z"}]"""),
            calendar(),
        )
        val lastSync = store.syncedAt
        store.saveError("再接続が必要です", requiresLogin = true)
        assertEquals(70.0, store.weights.single().kg, 0.0)

        store.saveError("通信に失敗しました")

        assertFalse(store.requiresLogin)
        assertEquals("通信に失敗しました", store.error)
        assertEquals(lastSync, store.syncedAt)
        assertEquals(70.0, store.weights.single().kg, 0.0)
    }

    private fun calendar() = JSONObject(
        """{"settings":null,"events":[],"validFrom":"2026-01-01", "validThrough":"2026-12-31",
            "queriedFrom":"2026-10-31","queriedThrough":"2026-11-30"}""",
    )

    private fun inMemoryPreferences(): SharedPreferences {
        val values = mutableMapOf<String, Any>()
        val pending = mutableMapOf<String, Any?>()
        val editor = Proxy.newProxyInstance(
            SharedPreferences.Editor::class.java.classLoader,
            arrayOf(SharedPreferences.Editor::class.java),
        ) { proxy, method, arguments ->
            when (method.name) {
                "putString", "putBoolean" -> {
                    pending[arguments!![0] as String] = arguments[1]
                    proxy
                }

                "remove" -> {
                    pending[arguments!![0] as String] = null
                    proxy
                }

                "apply" -> {
                    pending.forEach { (key, value) ->
                        if (value == null) values.remove(key) else values[key] = value
                    }
                    pending.clear()
                    null
                }

                else -> error("Unexpected editor call: ${method.name}")
            }
        } as SharedPreferences.Editor
        return Proxy.newProxyInstance(
            SharedPreferences::class.java.classLoader,
            arrayOf(SharedPreferences::class.java),
        ) { _, method, arguments ->
            when (method.name) {
                "getString", "getBoolean" -> values[arguments!![0]] ?: arguments[1]
                "edit" -> editor
                else -> error("Unexpected preferences call: ${method.name}")
            }
        } as SharedPreferences
    }
}
