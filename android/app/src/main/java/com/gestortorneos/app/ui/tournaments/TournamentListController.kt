package com.gestortorneos.app.ui.tournaments

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.gestortorneos.app.data.TournamentRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class TournamentListController(
    private val repository: TournamentRepository = TournamentRepository()
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    var state by mutableStateOf(TournamentListState())
        private set

    fun load(silent: Boolean = false) {
        state = if (silent) state.copy(errorMessage = null) else state.copy(isLoading = true, errorMessage = null)
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    repository.getTournaments()
                }
            }.onSuccess { tournaments ->
                state = TournamentListState(
                    isLoading = false,
                    tournaments = tournaments
                )
            }.onFailure {
                state = TournamentListState(
                    isLoading = false,
                    errorMessage = "Could not connect to the server."
                )
            }
        }
    }

    fun deleteTournament(tournamentId: String, adminKey: String) {
        state = state.copy(isLoading = true, errorMessage = null)
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    repository.deleteTournament(tournamentId, adminKey)
                    repository.getTournaments()
                }
            }.onSuccess { tournaments ->
                state = TournamentListState(
                    isLoading = false,
                    tournaments = tournaments
                )
            }.onFailure {
                state = TournamentListState(
                    isLoading = false,
                    tournaments = state.tournaments,
                    errorMessage = "Could not delete the tournament."
                )
            }
        }
    }
}
