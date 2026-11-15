package dev.kokoichi.lifeconsole

import java.io.Closeable
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.net.URI
import java.net.URISyntaxException
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

internal data class OAuthCallback(val code: String?, val error: String?)

internal fun parseOAuthCallback(target: String, expectedState: String): OAuthCallback? {
    val uri = try {
        URI(target)
    } catch (_: URISyntaxException) {
        return null
    }
    if (uri.isAbsolute || uri.rawAuthority != null || uri.rawPath != "/oauth/callback") return null
    val pairs = try {
        uri.rawQuery.orEmpty().split("&").map {
            val parts = it.split("=", limit = 2)
            URLDecoder.decode(parts[0], StandardCharsets.UTF_8.name()) to
                URLDecoder.decode(parts.getOrElse(1) { "" }, StandardCharsets.UTF_8.name())
        }
    } catch (_: IllegalArgumentException) {
        return null
    }
    if (pairs.map { it.first }.distinct().size != pairs.size) return null
    val parameters = pairs.toMap()
    if (parameters["state"] != expectedState) return null
    val code = parameters["code"]
    val error = parameters["error"]
    if ((code == null) == (error == null) || code == "" || error == "") return null
    return OAuthCallback(code, error)
}

internal class LoopbackOAuthReceiver : Closeable {
    private val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
    val redirectUri: String = "http://127.0.0.1:${server.localPort}/oauth/callback"

    fun receive(expectedState: String, exchange: (String) -> Unit) {
        val deadline = System.currentTimeMillis() + 5 * 60 * 1000
        while (System.currentTimeMillis() < deadline) {
            server.soTimeout = (deadline - System.currentTimeMillis()).coerceAtLeast(1).toInt()
            server.accept().use { socket ->
                socket.soTimeout = 10_000
                val request = socket.getInputStream().bufferedReader().readLine().orEmpty()
                val parts = request.split(" ")
                val callback = if (parts.size == 3 && parts[0] == "GET") {
                    parseOAuthCallback(parts[1], expectedState)
                } else {
                    null
                }
                if (callback == null) {
                    val rejected = "HTTP/1.1 400 Bad Request\r\n" +
                        "Content-Length: 0\r\nConnection: close\r\n\r\n"
                    socket.getOutputStream().write(rejected.toByteArray())
                } else {
                    if (callback.error != null) throw WidgetOAuthFailure("接続が許可されませんでした")
                    exchange(callback.code!!)
                    val page = """
                        <!doctype html><html lang="ja"><meta charset="utf-8">
                        <meta name="viewport" content="width=device-width,initial-scale=1">
                        <title>Life Console の認証</title>
                        <body style="font:18px/1.8 system-ui;padding:32px">
                        <h1>認証しました</h1><p>アプリに戻って接続を完了してください。</p>
                        <a href="dev.kokoichi.lifeconsole://oauth/complete">Life Console に戻る</a>
                        </body></html>
                    """.trimIndent().toByteArray(StandardCharsets.UTF_8)
                    val headers = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n" +
                        "Cache-Control: no-store\r\nReferrer-Policy: no-referrer\r\n" +
                        "Content-Length: ${page.size}\r\nConnection: close\r\n\r\n"
                    socket.getOutputStream().apply {
                        write(headers.toByteArray(StandardCharsets.UTF_8))
                        write(page)
                        flush()
                    }
                    return
                }
            }
        }
        throw SocketTimeoutException("OAuth callback timeout")
    }

    override fun close() = server.close()
}
