package com.gestortorneos.player.notifications

import android.content.Context
import android.os.Build
import com.gestortorneos.player.data.PlayerRepository
import com.gestortorneos.player.data.PlayerSessionStore
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

private fun buildDeviceLabel(): String {
    return listOf(Build.MANUFACTURER, Build.MODEL)
        .map { it.trim() }
        .filter { it.isNotBlank() }
        .joinToString(" ")
        .ifBlank { "Android" }
}

suspend fun registerCurrentPushToken(
    context: Context,
    repository: PlayerRepository,
    sessionToken: String,
) {
    val token = FirebaseMessaging.getInstance().token.await()?.trim().orEmpty()
    if (token.isBlank() || PlayerSessionStore.load(context)?.sessionToken != sessionToken) {
        return
    }
    if (PlayerSessionStore.isPushRegisteredForSession(context, sessionToken, token)) {
        return
    }
    repository.registerPushToken(sessionToken, token, buildDeviceLabel())
    if (PlayerSessionStore.load(context)?.sessionToken == sessionToken) {
        PlayerSessionStore.savePushRegistration(context, sessionToken, token)
    }
}

suspend fun unregisterCurrentPushToken(
    context: Context,
    repository: PlayerRepository,
    sessionToken: String,
    storedToken: String = PlayerSessionStore.getRegisteredPushToken(context),
) {
    if (storedToken.isBlank()) {
        return
    }
    runCatching {
        repository.unregisterPushToken(sessionToken, storedToken, buildDeviceLabel())
    }
    if (PlayerSessionStore.isPushRegisteredForSession(context, sessionToken, storedToken)) {
        PlayerSessionStore.clearPushRegistration(context)
    }
}
