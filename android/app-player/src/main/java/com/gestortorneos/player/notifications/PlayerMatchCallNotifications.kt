package com.gestortorneos.player.notifications

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.gestortorneos.player.MainActivity
import com.gestortorneos.player.R
import com.gestortorneos.player.data.remote.PlayerMatchDto
import com.gestortorneos.player.data.remote.PlayerTournamentDto

const val MATCH_CALLS_CHANNEL_ID = "match_calls"
const val MATCH_SYNC_CHANNEL_ID = "match_sync"
const val MATCH_SYNC_NOTIFICATION_ID = 1001

private const val PREFS_NAME = "gestor_torneos_player_notifications"
private const val KEY_PREFIX = "called_match_"
private const val LADDER_KEY_PREFIX = "ladder_match_"

fun ensureNotificationsChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        return
    }
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
        MATCH_CALLS_CHANNEL_ID,
        "Match calls",
        NotificationManager.IMPORTANCE_HIGH
    ).apply {
        description = "Notifications when you are called to play."
        enableLights(true)
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 300, 200, 300)
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
    val syncChannel = NotificationChannel(
        MATCH_SYNC_CHANNEL_ID,
        "Match synchronization",
        NotificationManager.IMPORTANCE_LOW
    ).apply {
        description = "Background service to follow your matches."
    }
    manager.createNotificationChannel(syncChannel)
}

fun hasNotificationsPermission(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        return true
    }
    return ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.POST_NOTIFICATIONS
    ) == PackageManager.PERMISSION_GRANTED
}

fun areMatchCallNotificationsEnabled(context: Context): Boolean {
    val notificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
    if (!notificationsEnabled) {
        return false
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        return true
    }
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = manager.getNotificationChannel(MATCH_CALLS_CHANNEL_ID) ?: return true
    return channel.importance != NotificationManager.IMPORTANCE_NONE
}

fun isBatteryOptimizationIgnored(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        return true
    }
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
}

fun openAppNotificationSettings(context: Context) {
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        }
    } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
}

fun openMatchCallChannelSettings(context: Context) {
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            putExtra(Settings.EXTRA_CHANNEL_ID, MATCH_CALLS_CHANNEL_ID)
        }
    } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching {
        context.startActivity(intent)
    }.getOrElse {
        openAppNotificationSettings(context)
    }
}

fun openBatteryOptimizationSettings(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        openAppNotificationSettings(context)
        return
    }
    val appIntent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${context.packageName}")
        if (context !is Activity) {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }
    runCatching {
        context.startActivity(appIntent)
    }.getOrElse {
        val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { context.startActivity(fallbackIntent) }
            .getOrElse { openAppNotificationSettings(context) }
    }
}

fun notifyCalledMatches(context: Context, tournaments: List<PlayerTournamentDto>) {
    ensureNotificationsChannel(context)
    val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val editor = preferences.edit()
    val calledMatches = tournaments.flatMap { tournament ->
        tournament.activeMatches.filter { it.status == "CALLED" && !it.calledAt.isNullOrBlank() }
    }
    val activeNotificationKeys = mutableMapOf<String, String>()

    calledMatches.forEach { match ->
        val notificationKey = buildNotificationKey(
            match.id,
            match.calledAt,
            match.roundLabel,
            match.stationLabel,
            match.opponentDisplayName,
        )
        activeNotificationKeys[match.id] = notificationKey
        val storedKey = preferences.getString(KEY_PREFIX + match.id, null)
        if (storedKey == notificationKey) {
            return@forEach
        }
        editor.putString(KEY_PREFIX + match.id, notificationKey)
        showMatchCallNotificationInternal(
            context = context,
            matchId = match.id,
            tournamentTitle = match.tournamentTitle,
            roundLabel = match.roundLabel,
            opponentDisplayName = match.opponentDisplayName,
            stationLabel = match.stationLabel,
        )
    }

    preferences.all.keys
        .filter { it.startsWith(KEY_PREFIX) }
        .forEach { key ->
            val matchId = key.removePrefix(KEY_PREFIX)
            val currentKey = activeNotificationKeys[matchId]
            if (currentKey == null || preferences.getString(key, null) != currentKey) {
                editor.remove(key)
                NotificationManagerCompat.from(context).cancel(matchId.hashCode())
            }
        }

    editor.apply()

    val ladderReadyChecks = tournaments.mapNotNull { tournament -> tournament.ladder?.readyCheckMatch }
    val activeLadderNotificationKeys = mutableMapOf<String, String>()
    val ladderEditor = preferences.edit()

    ladderReadyChecks.forEach { match ->
        val notificationKey = buildLadderNotificationKey(
            matchId = match.id,
            readyDeadlineAt = match.readyDeadlineAt,
            opponentDisplayName = match.opponentDisplayName,
        )
        activeLadderNotificationKeys[match.id] = notificationKey
        val storedKey = preferences.getString(LADDER_KEY_PREFIX + match.id, null)
        if (storedKey == notificationKey) {
            return@forEach
        }
        ladderEditor.putString(LADDER_KEY_PREFIX + match.id, notificationKey)
        showLadderMatchFoundNotificationInternal(
            context = context,
            matchId = match.id,
            tournamentTitle = match.tournamentTitle,
            opponentDisplayName = match.opponentDisplayName,
            readyDeadlineAt = match.readyDeadlineAt,
        )
    }

    preferences.all.keys
        .filter { it.startsWith(LADDER_KEY_PREFIX) }
        .forEach { key ->
            val matchId = key.removePrefix(LADDER_KEY_PREFIX)
            val currentKey = activeLadderNotificationKeys[matchId]
            if (currentKey == null || preferences.getString(key, null) != currentKey) {
                ladderEditor.remove(key)
                NotificationManagerCompat.from(context).cancel(("ladder_" + matchId).hashCode())
            }
        }

    ladderEditor.apply()
}

fun showRemoteMatchCallNotification(
    context: Context,
    matchId: String,
    tournamentTitle: String,
    roundLabel: String?,
    calledAt: String?,
    opponentDisplayName: String?,
    stationLabel: String?,
) {
    ensureNotificationsChannel(context)
    val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val notificationKey = buildNotificationKey(matchId, calledAt, roundLabel, stationLabel, opponentDisplayName)
    if (preferences.getString(KEY_PREFIX + matchId, null) == notificationKey) {
        return
    }
    preferences.edit().putString(KEY_PREFIX + matchId, notificationKey).apply()
    showMatchCallNotificationInternal(
        context = context,
        matchId = matchId,
        tournamentTitle = tournamentTitle,
        roundLabel = roundLabel,
        opponentDisplayName = opponentDisplayName,
        stationLabel = stationLabel,
    )
}

fun showRemoteLadderMatchNotification(
    context: Context,
    matchId: String,
    tournamentTitle: String,
    readyDeadlineAt: String?,
    opponentDisplayName: String?,
) {
    ensureNotificationsChannel(context)
    val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val notificationKey = buildLadderNotificationKey(matchId, readyDeadlineAt, opponentDisplayName)
    if (preferences.getString(LADDER_KEY_PREFIX + matchId, null) == notificationKey) {
        return
    }
    preferences.edit().putString(LADDER_KEY_PREFIX + matchId, notificationKey).apply()
    showLadderMatchFoundNotificationInternal(
        context = context,
        matchId = matchId,
        tournamentTitle = tournamentTitle,
        opponentDisplayName = opponentDisplayName,
        readyDeadlineAt = readyDeadlineAt,
    )
}

fun clearMatchCallNotificationState(context: Context) {
    val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    preferences.all.keys
        .filter { it.startsWith(KEY_PREFIX) || it.startsWith(LADDER_KEY_PREFIX) }
        .forEach { key ->
            val notificationId = if (key.startsWith(LADDER_KEY_PREFIX)) {
                val matchId = key.removePrefix(LADDER_KEY_PREFIX)
                ("ladder_" + matchId).hashCode()
            } else {
                val matchId = key.removePrefix(KEY_PREFIX)
                matchId.hashCode()
            }
            NotificationManagerCompat.from(context).cancel(notificationId)
        }
    preferences.edit().clear().apply()
}

private fun buildNotificationKey(
    matchId: String,
    calledAt: String?,
    roundLabel: String?,
    stationLabel: String?,
    opponentDisplayName: String?,
): String {
    return "$matchId:${calledAt.orEmpty()}:${roundLabel.orEmpty()}:${stationLabel.orEmpty()}:${opponentDisplayName.orEmpty()}"
}

private fun buildLadderNotificationKey(
    matchId: String,
    readyDeadlineAt: String?,
    opponentDisplayName: String?,
): String {
    return "$matchId:${readyDeadlineAt.orEmpty()}:${opponentDisplayName.orEmpty()}"
}

private fun buildMatchCallText(roundLabel: String?, opponentDisplayName: String?, stationLabel: String?): String {
    return buildString {
        append("Your turn to play")
        if (!roundLabel.isNullOrBlank()) {
            append(" [")
            append(roundLabel)
            append("]")
        }
        if (!opponentDisplayName.isNullOrBlank()) {
            append(" contra ")
            append(opponentDisplayName)
        }
        if (!stationLabel.isNullOrBlank()) {
            append(" at station ")
            append(stationLabel)
        }
    }
}

private fun buildLadderMatchText(opponentDisplayName: String?, readyDeadlineAt: String?): String {
    return buildString {
        append("Ladder match found")
        if (!opponentDisplayName.isNullOrBlank()) {
            append(" contra ")
            append(opponentDisplayName)
        }
        if (!readyDeadlineAt.isNullOrBlank()) {
            append(". Confirm you are ready")
        }
    }
}

private fun showMatchCallNotificationInternal(
    context: Context,
    matchId: String,
    tournamentTitle: String,
    roundLabel: String?,
    opponentDisplayName: String?,
    stationLabel: String?,
) {
    val text = buildMatchCallText(roundLabel, opponentDisplayName, stationLabel)
    val openAppIntent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val openAppPendingIntent = PendingIntent.getActivity(
        context,
        matchId.hashCode(),
        openAppIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(context, MATCH_CALLS_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(tournamentTitle)
        .setContentText(text)
        .setStyle(NotificationCompat.BigTextStyle().bigText(text))
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_REMINDER)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setDefaults(NotificationCompat.DEFAULT_ALL)
        .setAutoCancel(true)
        .setContentIntent(openAppPendingIntent)
        .build()

    runCatching {
        NotificationManagerCompat.from(context).notify(matchId.hashCode(), notification)
    }
}

private fun showLadderMatchFoundNotificationInternal(
    context: Context,
    matchId: String,
    tournamentTitle: String,
    opponentDisplayName: String?,
    readyDeadlineAt: String?,
) {
    val text = buildLadderMatchText(opponentDisplayName, readyDeadlineAt)
    val openAppIntent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val openAppPendingIntent = PendingIntent.getActivity(
        context,
        ("ladder_" + matchId).hashCode(),
        openAppIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(context, MATCH_CALLS_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("$tournamentTitle · Ladder")
        .setContentText(text)
        .setStyle(NotificationCompat.BigTextStyle().bigText(text))
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_REMINDER)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setDefaults(NotificationCompat.DEFAULT_ALL)
        .setAutoCancel(true)
        .setContentIntent(openAppPendingIntent)
        .build()

    runCatching {
        NotificationManagerCompat.from(context).notify(("ladder_" + matchId).hashCode(), notification)
    }
}

fun buildRealtimeSyncNotification(
    context: Context,
    activeMatches: Int,
    calledMatches: Int,
): android.app.Notification {
    ensureNotificationsChannel(context)
    val text = when {
        calledMatches > 0 -> "You have $calledMatches active call(s)."
        activeMatches > 0 -> "Following $activeMatches active set(s)."
        else -> "Waiting for your next match call."
    }

    val openAppIntent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val openAppPendingIntent = PendingIntent.getActivity(
        context,
        MATCH_SYNC_NOTIFICATION_ID,
        openAppIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    return NotificationCompat.Builder(context, MATCH_SYNC_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("Smash Players")
        .setContentText(text)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(openAppPendingIntent)
        .build()
}
