package com.gestortorneos.player.notifications

import com.gestortorneos.player.data.PlayerRepository
import com.gestortorneos.player.data.PlayerSessionStore
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class PlayerFirebaseMessagingService : FirebaseMessagingService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val session = PlayerSessionStore.load(this) ?: return
        serviceScope.launch {
            runCatching {
                PlayerRepository().registerPushToken(
                    session.sessionToken,
                    token.trim(),
                    android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL,
                )
                PlayerSessionStore.savePushRegistration(
                    this@PlayerFirebaseMessagingService,
                    session.sessionToken,
                    token.trim(),
                )
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        when (data["type"]) {
            "MATCH_CALLED" -> {
                showRemoteMatchCallNotification(
                    context = this,
                    matchId = data["matchId"].orEmpty(),
                    tournamentTitle = data["tournamentTitle"].orEmpty().ifBlank { "Smash Players" },
                    roundLabel = data["roundLabel"],
                    calledAt = data["calledAt"],
                    opponentDisplayName = data["opponentDisplayName"],
                    stationLabel = data["stationLabel"],
                )
            }
            "LADDER_MATCH_FOUND" -> {
                showRemoteLadderMatchNotification(
                    context = this,
                    matchId = data["matchId"].orEmpty(),
                    tournamentTitle = data["tournamentTitle"].orEmpty().ifBlank { "Smash Players" },
                    readyDeadlineAt = data["readyDeadlineAt"],
                    opponentDisplayName = data["opponentDisplayName"],
                )
            }
        }
    }
}
