package com.gestortorneos.player.notifications

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.gestortorneos.player.data.PlayerRepository
import com.gestortorneos.player.data.PlayerSessionStore
import com.gestortorneos.player.data.remote.BackendConfig
import java.util.concurrent.TimeUnit

private const val PERIODIC_WORK_NAME = "player-match-call-sync"
private const val IMMEDIATE_WORK_NAME = "player-match-call-sync-now"

object PlayerBackgroundSyncScheduler {
    fun ensureScheduled(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val periodicRequest = PeriodicWorkRequestBuilder<PlayerMatchCallWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            periodicRequest
        )
    }

    fun triggerImmediate(context: Context) {
        val request = OneTimeWorkRequestBuilder<PlayerMatchCallWorker>().build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }

    fun cancel(context: Context) {
        val workManager = WorkManager.getInstance(context)
        workManager.cancelUniqueWork(PERIODIC_WORK_NAME)
        workManager.cancelUniqueWork(IMMEDIATE_WORK_NAME)
    }
}

class PlayerMatchCallWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        val session = PlayerSessionStore.load(applicationContext) ?: return Result.success()
        if (!PlayerSessionStore.isBackgroundSyncArmed(applicationContext)) {
            return Result.success()
        }
        return runCatching {
            BackendConfig.initialize()
            val repository = PlayerRepository()
            val tournaments = repository.getMyTournaments(session.sessionToken)
            if (tournaments.isEmpty()) {
                PlayerSessionStore.setBackgroundSyncArmed(applicationContext, false)
                PlayerBackgroundSyncScheduler.cancel(applicationContext)
                PlayerRealtimeSyncService.stop(applicationContext)
                clearMatchCallNotificationState(applicationContext)
                return Result.success()
            }
            notifyCalledMatches(applicationContext, tournaments)
            Result.success()
        }.getOrElse {
            Result.retry()
        }
    }
}
