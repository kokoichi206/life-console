package dev.kokoichi.lifeconsole

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        findViewById<View>(R.id.screen).setOnApplyWindowInsetsListener { view, insets ->
            val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        val manager = getSystemService(AppWidgetManager::class.java)
        val widgetButtons = listOf(
            R.id.add_weight_widget to WeightWidgetProvider::class.java,
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
