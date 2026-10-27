package dev.kokoichi.lifeconsole

import android.content.Intent
import android.net.Uri
import java.time.LocalDate

internal object WidgetLinks {
    fun weightIntent(): Intent = open(Uri.parse("$CONSOLE_ORIGIN/health?range=d30"))

    fun collectionIntent(date: LocalDate, events: List<WidgetCollection>): Intent {
        val uri = Uri.parse("$CONSOLE_ORIGIN/todos").buildUpon()
            .appendQueryParameter("view", "calendar")
            .appendQueryParameter("month", date.toString().take(7))
        events.firstOrNull { it.date == date }?.let { uri.appendQueryParameter("eventId", it.id) }
        return open(uri.build())
    }

    private fun open(uri: Uri): Intent = Intent(Intent.ACTION_VIEW, uri)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
