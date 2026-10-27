package dev.kokoichi.lifeconsole

import android.annotation.SuppressLint
import android.app.Activity
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

class WidgetLoginActivity : Activity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)
        webView.setOnApplyWindowInsetsListener { view, insets ->
            val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        // Cloudflare Access のログイン画面が JavaScript を要求する。ネイティブ bridge は公開しない。
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean = request.url.scheme != "https"

            override fun onPageFinished(view: WebView, url: String) {
                val uri = Uri.parse(url)
                if (uri.scheme == "https" && uri.host == Uri.parse(CONSOLE_ORIGIN).host &&
                    !uri.path.orEmpty().startsWith("/cdn-cgi/")
                ) {
                    CookieManager.getInstance().flush()
                    scheduleWidgetSync(this@WidgetLoginActivity, immediately = true)
                    finish()
                }
            }
        }
        webView.loadUrl("$CONSOLE_ORIGIN/health")
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
