package dev.kokoichi.lifeconsole

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors
import net.openid.appauth.AuthState
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.NoClientAuthentication
import net.openid.appauth.RegistrationRequest
import net.openid.appauth.ResponseTypeValues
import net.openid.appauth.TokenResponse
import org.json.JSONException

class WidgetLoginActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var authorizationService: AuthorizationService
    private lateinit var status: TextView
    private var receiver: LoopbackOAuthReceiver? = null
    private var pendingAuthorization: AuthorizationResponse? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (intent.action == Intent.ACTION_VIEW) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }
        status = TextView(this).apply {
            setText(R.string.oauth_preparing)
            textSize = 18f
        }
        val cancel = Button(this).apply {
            setText(R.string.oauth_close)
            setOnClickListener { finish() }
        }
        setContentView(
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(48, 120, 48, 48)
                addView(status)
                addView(cancel)
            },
        )
        authorizationService = WidgetOAuth.service(this)
        if (authorizationService.browserDescriptor == null) {
            status.setText(R.string.oauth_chrome_required)
            return
        }
        runAuthorization { connect() }
    }

    private fun runAuthorization(operation: () -> Unit) {
        executor.execute {
            try {
                operation()
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            } catch (error: WidgetOAuthFailure) {
                showFailure(error.message!!)
            } catch (_: IOException) {
                showFailure("認証の通信に失敗しました。アプリから接続し直してください")
            } catch (_: JSONException) {
                showFailure("OAuth の応答を確認できません。接続設定を確認してください")
            }
        }
    }

    private fun connect() {
        val localReceiver = LoopbackOAuthReceiver()
        receiver = localReceiver
        localReceiver.use {
            val configuration = WidgetOAuth.discover()
            val registration = RegistrationRequest.Builder(
                configuration,
                listOf(Uri.parse(localReceiver.redirectUri)),
            ).setGrantTypeValues("authorization_code", "refresh_token")
                .setResponseTypeValues("code")
                .setTokenEndpointAuthenticationMethod("none")
                .setAdditionalParameters(mapOf("client_name" to "Life Console Widget"))
                .build()
            val clientId = WidgetOAuth.register(registration)
            val state = UUID.randomUUID().toString()
            val request = AuthorizationRequest.Builder(
                configuration,
                clientId,
                ResponseTypeValues.CODE,
                Uri.parse(localReceiver.redirectUri),
            ).setState(state).setScope("offline_access")
                .setAdditionalParameters(mapOf("resource" to CONSOLE_ORIGIN)).build()
            runOnUiThread {
                status.setText(R.string.oauth_browser_prompt)
                val tab = authorizationService.createCustomTabsIntentBuilder(
                    request.toUri(),
                ).build()
                tab.intent.setPackage("com.android.chrome")
                tab.launchUrl(this, request.toUri())
            }
            localReceiver.receive(state) { code ->
                val response = AuthorizationResponse.Builder(
                    request,
                ).setAuthorizationCode(code).build()
                runOnUiThread { pendingAuthorization = response }
            }
        }
    }

    private fun completeAuthorization() {
        val response = pendingAuthorization ?: return
        pendingAuthorization = null
        status.setText(R.string.oauth_finishing)
        runAuthorization {
            val tokens = awaitOAuth<TokenResponse> {
                authorizationService.performTokenRequest(
                    response.createTokenExchangeRequest(mapOf("resource" to CONSOLE_ORIGIN)),
                    NoClientAuthentication.INSTANCE,
                    it,
                )
            }
            val authorized = AuthState(response.request.configuration).apply {
                update(response, null)
                update(tokens, null)
            }
            WidgetOAuth.save(this, authorized)
            runOnUiThread {
                scheduleWidgetSync(this, immediately = true)
                finish()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        completeAuthorization()
    }

    private fun showFailure(message: String) {
        if (!isFinishing) {
            WidgetStore(this).saveError(message)
            runOnUiThread { status.text = message }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == Intent.ACTION_VIEW) completeAuthorization()
    }

    override fun onDestroy() {
        receiver?.close()
        executor.shutdownNow()
        if (::authorizationService.isInitialized) authorizationService.dispose()
        super.onDestroy()
    }
}
