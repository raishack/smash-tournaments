package com.gestortorneos.player.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationManagerCompat
import com.gestortorneos.player.data.PlayerRepository
import com.gestortorneos.player.data.PlayerSessionStore
import com.gestortorneos.player.data.remote.BackendConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

private const val POLL_INTERVAL_MS = 5_000L
private const val RESTART_DELAY_MS = 2_000L
private const val ACTION_RESTART_PLAYER_SYNC = "com.gestortorneos.player.notifications.RESTART_SYNC"

class PlayerRealtimeSyncService : android.app.Service() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var syncStarted = false

    override fun onCreate() {
        super.onCreate()
        ensureNotificationsChannel(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val session = PlayerSessionStore.load(this)
        if (session == null || !PlayerSessionStore.isBackgroundSyncArmed(this)) {
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(
            MATCH_SYNC_NOTIFICATION_ID,
            buildRealtimeSyncNotification(this, activeMatches = 0, calledMatches = 0),
        )

        if (!syncStarted) {
            syncStarted = true
            serviceScope.launch {
                BackendConfig.initialize()
                val repository = PlayerRepository()
                while (isActive) {
                    val currentSession = PlayerSessionStore.load(this@PlayerRealtimeSyncService)
                    if (currentSession == null || !PlayerSessionStore.isBackgroundSyncArmed(this@PlayerRealtimeSyncService)) {
                        stopSelf()
                        break
                    }

                    runCatching {
                        val tournaments = repository.getMyTournaments(currentSession.sessionToken)
                        if (tournaments.isEmpty()) {
                            PlayerSessionStore.setBackgroundSyncArmed(this@PlayerRealtimeSyncService, false)
                            PlayerBackgroundSyncScheduler.cancel(this@PlayerRealtimeSyncService)
                            clearMatchCallNotificationState(this@PlayerRealtimeSyncService)
                            stopSelf()
                            return@runCatching
                        }
                        notifyCalledMatches(this@PlayerRealtimeSyncService, tournaments)
                        val activeMatches = tournaments.sumOf { it.activeMatches.size }
                        val calledMatches = tournaments.sumOf { tournament ->
                            tournament.activeMatches.count { match -> match.status == "CALLED" }
                        }
                        NotificationManagerCompat.from(this@PlayerRealtimeSyncService).notify(
                            MATCH_SYNC_NOTIFICATION_ID,
                            buildRealtimeSyncNotification(
                                this@PlayerRealtimeSyncService,
                                activeMatches = activeMatches,
                                calledMatches = calledMatches,
                            ),
                        )
                    }

                    delay(POLL_INTERVAL_MS)
                }
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        if (PlayerSessionStore.load(this) != null && PlayerSessionStore.isBackgroundSyncArmed(this)) {
            scheduleRestart(this)
        }
        serviceScope.cancel()
        syncStarted = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (PlayerSessionStore.load(this) != null && PlayerSessionStore.isBackgroundSyncArmed(this)) {
            scheduleRestart(this)
        }
        super.onTaskRemoved(rootIntent)
    }

    companion object {
        fun start(context: Context) {
            if (PlayerSessionStore.load(context) == null || !PlayerSessionStore.isBackgroundSyncArmed(context)) {
                return
            }
            val intent = Intent(context, PlayerRealtimeSyncService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, PlayerRealtimeSyncService::class.java))
            NotificationManagerCompat.from(context).cancel(MATCH_SYNC_NOTIFICATION_ID)
        }

        private fun scheduleRestart(context: Context) {
            if (PlayerSessionStore.load(context) == null || !PlayerSessionStore.isBackgroundSyncArmed(context)) {
                return
            }
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val restartIntent = Intent(context, PlayerBootReceiver::class.java).apply {
                action = ACTION_RESTART_PLAYER_SYNC
                `package` = context.packageName
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                MATCH_SYNC_NOTIFICATION_ID,
                restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val triggerAt = System.currentTimeMillis() + RESTART_DELAY_MS
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        }
    }
}

class PlayerBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED && intent?.action != ACTION_RESTART_PLAYER_SYNC) {
            return
        }
        if (PlayerSessionStore.load(context) != null && PlayerSessionStore.isBackgroundSyncArmed(context)) {
            PlayerRealtimeSyncService.start(context)
        }
    }
}
