package dev.kokoichi.lifeconsole

import android.content.Intent
import android.net.Uri

internal object WeightEntry {
    fun intent(): Intent = Intent(
        Intent.ACTION_VIEW,
        Uri.parse("https://life-console.kokoichi206.workers.dev/health?entry=weight"),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
