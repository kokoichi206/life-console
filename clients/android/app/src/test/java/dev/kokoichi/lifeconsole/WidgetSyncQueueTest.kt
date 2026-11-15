package dev.kokoichi.lifeconsole

import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class WidgetSyncQueueTest {
    private val work = ArrayDeque<Runnable>()
    private val completions = ArrayDeque<Runnable>()
    private val queue = WidgetSyncQueue(Executor { work.addLast(it) }) { completions.addLast(it) }

    @Test
    fun updatesOnlyAfterSynchronizationHasCompleted() {
        val events = mutableListOf<String>()
        queue.start(2, { events.add("saved") }) { events.add("updated") }
        work.removeFirst().run()
        assertEquals(listOf("saved"), events)
        completions.removeFirst().run()
        assertEquals(listOf("saved", "updated"), events)
    }

    @Test
    fun oldCompletionDoesNotRemoveReplacementWithSameJobId() {
        val updates = mutableListOf<String>()
        queue.start(2, {}) { updates.add("old") }
        work.removeFirst().run()
        queue.stop(2)
        queue.start(2, {}) { updates.add("new") }
        work.removeFirst().run()
        completions.removeFirst().run()
        completions.removeFirst().run()
        assertEquals(listOf("new"), updates)
    }

    @Test
    fun canceledWorkDoesNotUpdateWidget() {
        val events = mutableListOf<String>()
        queue.start(2, { events.add("saved") }) { events.add("updated") }
        queue.stop(2)
        work.removeFirst().run()
        completions.removeFirst().run()
        assertEquals(emptyList<String>(), events)
    }

    @Test
    fun unexpectedFailureIsPropagatedInsteadOfLeavingJobRunningSilently() {
        queue.start(2, { error("programming error") }) { error("must not update") }
        work.removeFirst().run()
        assertThrows(ExecutionException::class.java) { completions.removeFirst().run() }
    }
}
