package dev.kokoichi.lifeconsole

import java.util.concurrent.Callable
import java.util.concurrent.Executor
import java.util.concurrent.FutureTask

// ジョブの開始・停止と完了の配送はメインスレッドで直列化する。
internal class WidgetSyncQueue(
    private val executor: Executor,
    private val dispatchCompletion: (Runnable) -> Unit,
) {
    private val tasks = mutableMapOf<Int, FutureTask<Unit>>()

    fun start(jobId: Int, synchronize: () -> Unit, onFinished: () -> Unit) {
        val task = object : FutureTask<Unit>(Callable { synchronize() }) {
            override fun done() {
                dispatchCompletion(
                    Runnable {
                        // 同じ ID で再実行していても、停止済みの実行から新しい実行を取り除かない。
                        if (tasks[jobId] === this) {
                            tasks.remove(jobId)
                            get()
                            onFinished()
                        }
                    },
                )
            }
        }
        tasks[jobId] = task
        executor.execute(task)
    }

    fun stop(jobId: Int) {
        tasks.remove(jobId)?.cancel(true)
    }
}
