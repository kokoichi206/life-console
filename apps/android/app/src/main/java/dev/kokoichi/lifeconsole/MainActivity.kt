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
        val addWidget = findViewById<Button>(R.id.add_widget)
        if (manager.isRequestPinAppWidgetSupported) {
            addWidget.setOnClickListener {
                manager.requestPinAppWidget(
                    ComponentName(this, WeightWidgetProvider::class.java),
                    null,
                    null,
                )
            }
        } else {
            addWidget.visibility = View.GONE
            findViewById<TextView>(R.id.widget_instructions).setText(R.string.add_manually)
        }
        findViewById<Button>(R.id.open_weight).setOnClickListener {
            startActivity(WeightEntry.intent())
        }
    }
}
