package dev.kokoichi.lifeconsole

import android.content.Intent
import android.net.Uri

internal object MealEntry {
    fun intent(): Intent = Intent(
        Intent.ACTION_VIEW,
        Uri.parse("https://life-console.kokoichi206.workers.dev/health?entry=meal"),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
