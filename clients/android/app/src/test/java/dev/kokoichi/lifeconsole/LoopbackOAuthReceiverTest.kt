package dev.kokoichi.lifeconsole

import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LoopbackOAuthReceiverTest {
    @Test
    fun validatesCallbackStateAndDecodesCode() {
        assertEquals(
            OAuthCallback("code+123", null),
            parseOAuthCallback("/oauth/callback?code=code%2B123&state=expected", "expected"),
        )
        assertNull(parseOAuthCallback("/oauth/callback?code=code&state=other", "expected"))
        assertNull(parseOAuthCallback("/wrong?code=code&state=expected", "expected"))
    }

    @Test
    fun rejectsAmbiguousAndMalformedResponses() {
        val invalid = listOf(
            "/oauth/callback?code=first&code=second&state=expected",
            "/oauth/callback?code=code&error=denied&state=expected",
            "/oauth/callback?code=&state=expected",
            "/oauth/callback?state=expected",
            "/oauth/callback?code=%XX&state=expected",
            "http://other.example/oauth/callback?code=code&state=expected",
        )
        invalid.forEach { assertNull(parseOAuthCallback(it, "expected")) }
        assertEquals(
            OAuthCallback(null, "access_denied"),
            parseOAuthCallback("/oauth/callback?error=access_denied&state=expected", "expected"),
        )
    }

    @Test
    fun ignoresWrongStateThenExchangesCodeOnLoopback() {
        val executor = Executors.newSingleThreadExecutor()
        try {
            LoopbackOAuthReceiver().use { receiver ->
                val accepted = executor.submit<String> {
                    var code = ""
                    receiver.receive("expected") { code = it }
                    code
                }
                val wrong = URL(receiver.redirectUri + "?code=bad&state=wrong")
                    .openConnection() as HttpURLConnection
                try {
                    assertEquals(400, wrong.responseCode)
                } finally {
                    wrong.disconnect()
                }
                val valid = URL(receiver.redirectUri + "?code=valid&state=expected")
                    .openConnection() as HttpURLConnection
                try {
                    assertEquals("127.0.0.1", valid.url.host)
                    assertEquals(200, valid.responseCode)
                    assertEquals("no-store", valid.getHeaderField("Cache-Control"))
                    valid.inputStream.close()
                } finally {
                    valid.disconnect()
                }
                assertEquals("valid", accepted.get(3, TimeUnit.SECONDS))
            }
        } finally {
            executor.shutdownNow()
        }
    }
}
