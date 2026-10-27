package dev.kokoichi.lifeconsole

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale

class WeightTrendWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        DisplayWidgets.update(context)
        scheduleWidgetSync(context)
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        manager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle,
    ) {
        DisplayWidgets.update(context)
    }
}

class CollectionWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        DisplayWidgets.update(context)
        scheduleWidgetSync(context)
    }
}

class WidgetRefreshReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            "dev.kokoichi.lifeconsole.REFRESH_DISPLAY",
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            -> DisplayWidgets.update(context)
        }
    }
}

internal object DisplayWidgets {
    fun update(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val store = WidgetStore(context)
        val now = Instant.now()
        val openWeight = PendingIntent.getActivity(
            context,
            10,
            WidgetLinks.weightIntent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val status = store.error ?: if (store.syncedAt == null) "アプリアイコンからログイン・同期" else null
        val weights = recentWeights(store.weights, now)
        val latest = store.weights.maxByOrNull { it.occurredAt }
        val trend = RemoteViews(context.packageName, R.layout.weight_trend_widget).apply {
            setOnClickPendingIntent(R.id.display_root, openWeight)
            setTextViewText(R.id.display_status, status)
            setViewVisibility(R.id.display_status, if (status == null) View.GONE else View.VISIBLE)
            setTextViewText(
                R.id.weight_value,
                latest?.let { String.format(Locale.JAPAN, "%.1f kg", it.kg) }
                    ?: if (store.syncedAt == null) "未同期" else "未記録",
            )
            setTextViewText(
                R.id.weight_empty,
                if (store.syncedAt == null) "ログインして同期してください" else "直近 30 日の記録がありません",
            )
            setViewVisibility(R.id.weight_chart, if (weights.isEmpty()) View.GONE else View.VISIBLE)
            setViewVisibility(R.id.weight_empty, if (weights.isEmpty()) View.VISIBLE else View.GONE)
            if (weights.isNotEmpty()) {
                setImageViewBitmap(R.id.weight_chart_line, weightChart(weights, now))
            }
        }
        manager.updateAppWidget(
            ComponentName(context, WeightTrendWidgetProvider::class.java),
            trend,
        )
        val firstDate = collectionDisplayDate(now)
        val dateFormat = DateTimeFormatter.ofPattern("M/d（E）", Locale.JAPAN)
        val events = store.calendar?.events.orEmpty()
        val secondDate = firstDate.plusDays(1)
        val openFirstDate = PendingIntent.getActivity(
            context,
            11,
            WidgetLinks.collectionIntent(firstDate, events),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val openSecondDate = PendingIntent.getActivity(
            context,
            12,
            WidgetLinks.collectionIntent(secondDate, events),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val collection = RemoteViews(context.packageName, R.layout.collection_widget).apply {
            setOnClickPendingIntent(R.id.display_root, openFirstDate)
            setOnClickPendingIntent(R.id.collection_day, openFirstDate)
            setOnClickPendingIntent(R.id.collection_next_day, openSecondDate)
            setTextViewText(R.id.display_status, status)
            setViewVisibility(R.id.display_status, if (status == null) View.GONE else View.VISIBLE)
            setTextViewText(R.id.collection_date, firstDate.format(dateFormat))
            setTextViewText(
                R.id.collection_title,
                store.calendar?.summary(firstDate) ?: "未同期",
            )
            setTextViewText(R.id.collection_next_date, secondDate.format(dateFormat))
            setTextViewText(
                R.id.collection_next_title,
                store.calendar?.summary(secondDate) ?: "未同期",
            )
        }
        manager.updateAppWidget(
            ComponentName(context, CollectionWidgetProvider::class.java),
            collection,
        )
        val pending = PendingIntent.getBroadcast(
            context,
            0,
            Intent(context, WidgetRefreshReceiver::class.java)
                .setAction("dev.kokoichi.lifeconsole.REFRESH_DISPLAY"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        // 端末の省電力制約による遅延は許容し、正確なアラームの特別権限を要求しない。
        context.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            nextCollectionSwitch(now).toEpochMilli(),
            pending,
        )
    }
}

private fun weightChart(weights: List<WidgetWeight>, now: Instant): Bitmap {
    val width = 720
    val height = 180
    val trend = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val min = weights.minOf { it.kg } - 0.5
    val max = weights.maxOf { it.kg } + 0.5
    val left = 12f
    val right = width - 12f
    val top = 12f
    val bottom = height - 12f
    val today = now.atZone(japanZone).toLocalDate()
    val start = today.minusDays(29).atStartOfDay(japanZone).toInstant().toEpochMilli()
    val end = today.plusDays(1).atStartOfDay(japanZone).toInstant().toEpochMilli()
    val path = Path()
    val coordinates = weights.map {
        val fraction = (it.occurredAt.toEpochMilli() - start).toDouble() / (end - start)
        val x = left + (fraction * (right - left)).toFloat()
        val y = bottom - ((it.kg - min) / (max - min) * (bottom - top)).toFloat()
        x to y
    }
    val (firstX, firstY) = coordinates.first()
    path.moveTo(firstX, firstY)
    coordinates.drop(1).forEach { (x, y) -> path.lineTo(x, y) }
    paint.color = Color.WHITE
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 5f
    paint.strokeJoin = Paint.Join.ROUND
    val trendCanvas = Canvas(trend)
    trendCanvas.drawPath(path, paint)
    paint.style = Paint.Style.FILL
    val (lastX, lastY) = coordinates.last()
    trendCanvas.drawCircle(lastX, lastY, 6f, paint)
    return trend
}
