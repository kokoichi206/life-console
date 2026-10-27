package dev.kokoichi.lifeconsole

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.os.Handler
import android.os.Looper
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.format.DateTimeParseException
import java.util.concurrent.Executors
import net.openid.appauth.AuthorizationService
import org.json.JSONException
import org.json.JSONObject

class WidgetSyncService : JobService() {
    private lateinit var authorizationService: AuthorizationService

    override fun onCreate() {
        super.onCreate()
        authorizationService = WidgetOAuth.service(this)
    }

    private val executor = Executors.newSingleThreadExecutor()
    private val completionHandler = Handler(Looper.getMainLooper())
    private val queue = WidgetSyncQueue(executor) { completionHandler.post(it) }

    override fun onStartJob(params: JobParameters): Boolean {
        queue.start(params.jobId, { synchronize() }) {
            DisplayWidgets.update(this)
            jobFinished(params, false)
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        queue.stop(params.jobId)
        return true
    }

    private fun synchronize() {
        val store = WidgetStore(this)
        try {
            val token = WidgetOAuth.freshToken(this, authorizationService)
            val weights = read("/api/v1/weights", token).getJSONArray("data")
            val today = Instant.now().atZone(japanZone).toLocalDate()
            val calendar = read(
                "/api/v1/calendar?from=$today&through=${today.plusDays(31)}",
                token,
            ).getJSONObject("data")
            calendar.put("queriedFrom", today.toString())
                .put("queriedThrough", today.plusDays(31).toString())
            store.save(weights, calendar)
        } catch (_: WidgetLoginRequired) {
            store.saveError("アプリでログインしてください")
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        } catch (_: IOException) {
            store.saveError("通信に失敗しました。アプリから再同期")
        } catch (_: JSONException) {
            store.saveError("データの形式を確認できません")
        } catch (_: DateTimeParseException) {
            store.saveError("データの日付を確認できません")
        } catch (_: IllegalArgumentException) {
            store.saveError("データの値を確認できません")
        }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        authorizationService.dispose()
        super.onDestroy()
    }

    private fun read(path: String, token: String): JSONObject {
        val connection = URL(CONSOLE_ORIGIN + path).openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15_000
            connection.readTimeout = 15_000
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", WidgetOAuth.USER_AGENT)
            val status = connection.responseCode
            if (status in 300..399 || status == 401 || status == 403) throw WidgetLoginRequired()
            if (status != 200) throw IOException("HTTP $status")
            return connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
        } finally {
            connection.disconnect()
        }
    }
}

internal fun scheduleWidgetSync(context: Context, immediately: Boolean = false) {
    val scheduler = context.getSystemService(JobScheduler::class.java)
    val component = ComponentName(context, WidgetSyncService::class.java)
    if (scheduler.getPendingJob(1) == null) {
        scheduler.schedule(
            JobInfo.Builder(1, component).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(60 * 60 * 1000L).setPersisted(true).build(),
        )
    }
    if (immediately && scheduler.getPendingJob(2) == null) {
        scheduler.schedule(
            JobInfo.Builder(2, component).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setExpedited(true).build(),
        )
    }
}
