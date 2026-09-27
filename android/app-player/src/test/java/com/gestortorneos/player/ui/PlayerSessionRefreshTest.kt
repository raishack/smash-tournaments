package com.gestortorneos.player.ui

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class PlayerSessionRefreshTest {
    @Test fun missingFirebaseOrOfflinePushDoesNotBlockTournamentLoading() = runBlocking {
        for (failure in listOf(IllegalStateException("Firebase unavailable"), java.io.IOException("Push offline"))) {
            var loaded = false
            refreshPlayerSession({ throw failure }, { loaded = true })
            assertTrue(loaded)
        }
    }

    @Test fun cancelledSessionDoesNotStartAnotherRequest() = runBlocking {
        var loaded = false
        try {
            refreshPlayerSession({ throw CancellationException("Signed out") }, { loaded = true })
            fail("Cancellation must propagate")
        } catch (_: CancellationException) { }
        assertFalse(loaded)
    }

    @Test fun tournamentFailureStillReachesTheUser() = runBlocking {
        val failure = java.io.IOException("Tournament server unavailable")
        try {
            refreshPlayerSession({}, { throw failure })
            fail("Tournament failure must propagate")
        } catch (actual: java.io.IOException) { assertSame(failure, actual) }
    }
}
