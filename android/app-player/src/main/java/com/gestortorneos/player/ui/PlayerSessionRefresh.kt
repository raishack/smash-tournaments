package com.gestortorneos.player.ui

import kotlinx.coroutines.CancellationException

/** Notification registration is optional; a push failure must not hide the player's tournaments. */
internal suspend fun refreshPlayerSession(registerPush: suspend () -> Unit, loadTournaments: suspend () -> Unit) {
    try { registerPush() }
    catch (cancelled: CancellationException) { throw cancelled }
    catch (_: Exception) { /* Retry push registration on the next session refresh. */ }
    loadTournaments()
}
