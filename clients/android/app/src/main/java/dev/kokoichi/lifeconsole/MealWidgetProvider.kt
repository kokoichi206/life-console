package dev.kokoichi.lifeconsole

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

class MealWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        val openMealEntry = PendingIntent.getActivity(
            context,
            0,
            MealEntry.intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val widget = RemoteViews(context.packageName, R.layout.meal_widget).apply {
            setOnClickPendingIntent(R.id.meal_action, openMealEntry)
        }
        manager.updateAppWidget(appWidgetIds, widget)
    }
}
