package dev.kokoichi.lifeconsole

import android.content.Intent
import android.net.Uri

internal object MealEntry {
    fun intent(): Intent = Intent(
        Intent.ACTION_VIEW,
        Uri.parse("dev.kokoichi.lifeconsole://meals"),
    ).setPackage("dev.kokoichi.lifeconsole").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
