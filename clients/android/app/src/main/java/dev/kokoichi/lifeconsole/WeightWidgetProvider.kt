package dev.kokoichi.lifeconsole

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

class WeightWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        val openWeightEntry = PendingIntent.getActivity(
            context,
            0,
            WeightEntry.intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val widget = RemoteViews(context.packageName, R.layout.weight_widget).apply {
            setOnClickPendingIntent(R.id.weight_action, openWeightEntry)
        }
        manager.updateAppWidget(appWidgetIds, widget)
    }
}
