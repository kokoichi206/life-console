package dev.kokoichi.lifeconsole

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast

class MainActivity :
    Activity(),
    SharedPreferences.OnSharedPreferenceChangeListener {
    private lateinit var widgetStore: WidgetStore

    override fun onResume() {
        super.onResume()
        widgetStore.preferences.registerOnSharedPreferenceChangeListener(this)
        showSyncStatus()
        DisplayWidgets.update(this)
    }

    override fun onPause() {
        widgetStore.preferences.unregisterOnSharedPreferenceChangeListener(this)
        super.onPause()
    }

    override fun onSharedPreferenceChanged(preferences: SharedPreferences, key: String?) {
        showSyncStatus()
    }

    private fun showSyncStatus() {
        val synced = widgetStore.syncedAt?.atZone(japanZone)?.format(
            java.time.format.DateTimeFormatter.ofPattern("M/d HH:mm"),
        )
        findViewById<TextView>(R.id.sync_status).text =
            listOfNotNull(widgetStore.error, synced?.let { "$it 同期済み" }).joinToString(" / ")
                .ifEmpty { "表示用ウィジェットは未同期です。ログインしてください。" }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        widgetStore = WidgetStore(this)
        findViewById<View>(R.id.screen).setOnApplyWindowInsetsListener { view, insets ->
            val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        findViewById<Button>(R.id.widget_login).setOnClickListener {
            startActivity(Intent(this, WidgetLoginActivity::class.java))
        }
        findViewById<Button>(R.id.widget_sync).setOnClickListener {
            scheduleWidgetSync(this, immediately = true)
            Toast.makeText(this, "同期を要求しました", Toast.LENGTH_SHORT).show()
        }
        DisplayWidgets.update(this)
        scheduleWidgetSync(this)
        val manager = getSystemService(AppWidgetManager::class.java)
        val widgetButtons = listOf(
            R.id.add_weight_widget to WeightWidgetProvider::class.java,
            R.id.add_weight_trend_widget to WeightTrendWidgetProvider::class.java,
            R.id.add_collection_widget to CollectionWidgetProvider::class.java,
            R.id.add_meal_widget to MealWidgetProvider::class.java,
        )
        for ((buttonId, providerClass) in widgetButtons) {
            val addWidget = findViewById<Button>(buttonId)
            if (manager.isRequestPinAppWidgetSupported) {
                addWidget.setOnClickListener {
                    manager.requestPinAppWidget(ComponentName(this, providerClass), null, null)
                }
            } else {
                addWidget.visibility = View.GONE
            }
        }
        if (!manager.isRequestPinAppWidgetSupported) {
            findViewById<TextView>(R.id.widget_instructions).setText(R.string.add_manually)
        }
        findViewById<Button>(R.id.open_meal).setOnClickListener {
            startActivity(MealEntry.intent())
        }
        findViewById<Button>(R.id.open_weight).setOnClickListener {
            startActivity(WeightEntry.intent())
        }
    }
}
