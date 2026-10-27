package dev.kokoichi.lifeconsole

import android.content.Context
import android.net.Uri
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import net.openid.appauth.AppAuthConfiguration
import net.openid.appauth.AuthState
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.RegistrationRequest
import net.openid.appauth.connectivity.DefaultConnectionBuilder
import org.json.JSONObject

internal class WidgetLoginRequired : IOException()
internal class WidgetOAuthFailure(message: String) : IOException(message)

internal object WidgetOAuth {
    private val sessionLock = Any()
    const val USER_AGENT = "LifeConsoleWidget Android"

    fun service(context: Context): AuthorizationService = AuthorizationService(
        context,
        AppAuthConfiguration.Builder().setConnectionBuilder {
            DefaultConnectionBuilder.INSTANCE.openConnection(it).apply {
                setRequestProperty("User-Agent", USER_AGENT)
            }
        }.setBrowserMatcher {
            it.packageName == "com.android.chrome" && it.useCustomTab
        }.build(),
    )

    fun discover(): AuthorizationServiceConfiguration {
        val connection = URL("$CONSOLE_ORIGIN/.well-known/oauth-authorization-server")
            .openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15_000
            connection.readTimeout = 15_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", USER_AGENT)
            if (connection.responseCode != 200) {
                throw WidgetOAuthFailure("Cloudflare Access の OAuth 設定を確認してください")
            }
            val metadata = connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
            return AuthorizationServiceConfiguration(
                Uri.parse(metadata.getString("authorization_endpoint")),
                Uri.parse(metadata.getString("token_endpoint")),
                Uri.parse(metadata.getString("registration_endpoint")),
            )
        } finally {
            connection.disconnect()
        }
    }

    // Cloudflare の登録応答は AppAuth が必須扱いする registration_access_token を返さない。
    fun register(request: RegistrationRequest): String {
        val connection = URL(request.configuration.registrationEndpoint!!.toString())
            .openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15_000
            connection.readTimeout = 15_000
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", USER_AGENT)
            connection.outputStream.use { it.write(request.toJsonString().toByteArray()) }
            if (connection.responseCode != 201) {
                throw WidgetOAuthFailure("OAuth クライアントを登録できませんでした")
            }
            val response = connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
            return response.getString("client_id").also {
                if (it.isBlank()) throw WidgetOAuthFailure("OAuth client_id が空です")
            }
        } finally {
            connection.disconnect()
        }
    }

    fun save(context: Context, state: AuthState) = synchronized(sessionLock) {
        preferences(context).edit().putString("state", state.jsonSerializeString()).apply()
    }

    // refresh token の更新と再ログインの保存を直列化し、古い認証状態で上書きしない。
    fun freshToken(context: Context, service: AuthorizationService): String =
        synchronized(sessionLock) {
            val stored =
                preferences(context).getString("state", null) ?: throw WidgetLoginRequired()
            val state = AuthState.jsonDeserialize(stored)
            if (!state.isAuthorized) throw WidgetLoginRequired()
            val completion = CountDownLatch(1)
            var token: String? = null
            var failure: AuthorizationException? = null
            state.performActionWithFreshTokens(service, mapOf("resource" to CONSOLE_ORIGIN)) {
                    accessToken,
                    _,
                    error,
                ->
                token = accessToken
                failure = error
                completion.countDown()
            }
            if (!completion.await(45, TimeUnit.SECONDS)) {
                throw WidgetOAuthFailure("認証の通信がタイムアウトしました")
            }
            save(context, state)
            if (failure?.error in listOf("invalid_grant", "invalid_token") ||
                (failure == null && token == null)
            ) {
                throw WidgetLoginRequired()
            }
            if (failure != null) throw IOException("OAuth token refresh failed")
            token ?: throw WidgetLoginRequired()
        }

    private fun preferences(context: Context) =
        context.getSharedPreferences("widget_authorization", Context.MODE_PRIVATE)
}

internal fun <T> awaitOAuth(start: (((T?, AuthorizationException?) -> Unit)) -> Unit): T {
    val completion = CountDownLatch(1)
    var response: T? = null
    var failure: AuthorizationException? = null
    start { value, error ->
        response = value
        failure = error
        completion.countDown()
    }
    if (!completion.await(45, TimeUnit.SECONDS)) {
        throw WidgetOAuthFailure("認証の通信がタイムアウトしました")
    }
    if (failure != null) {
        throw WidgetOAuthFailure("認証を完了できませんでした。接続設定を確認してください")
    }
    return response ?: throw WidgetOAuthFailure("認証の応答を確認できませんでした")
}
