package com.gestortorneos.app.ui.tournaments

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.gestortorneos.app.data.TournamentRepository
import com.gestortorneos.app.data.toTournamentErrorMessage
import com.gestortorneos.app.ui.CreateTournamentInput
import com.gestortorneos.app.ui.TournamentSummary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class CreateTournamentController(
    private val repository: TournamentRepository = TournamentRepository()
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    var state by mutableStateOf(CreateTournamentState())
        private set

    fun save(input: CreateTournamentInput, onCreated: (TournamentSummary) -> Unit) {
        if (state.isSaving) return
        state = CreateTournamentState(isSaving = true)
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    repository.createTournament(input)
                }
            }.onSuccess { tournament ->
                state = CreateTournamentState(
                    isSaving = false,
                    successMessage = "Torneo creado"
                )
                onCreated(tournament)
            }.onFailure {
                state = CreateTournamentState(
                    isSaving = false,
                    errorMessage = it.toTournamentErrorMessage()
                )
            }
        }
    }

    fun saveFromStartgg(
        eventUrl: String,
        callTimeoutMinutes: Int,
        setupCount: Int,
        streamCount: Int,
        playerMatchReportingEnabled: Boolean,
        onCreated: (TournamentSummary) -> Unit
    ) {
        state = CreateTournamentState(isSaving = true)
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    repository.createStartggTournament(
                        eventUrl = eventUrl,
                        callTimeoutMinutes = callTimeoutMinutes,
                        setupCount = setupCount,
                        streamCount = streamCount,
                        playerMatchReportingEnabled = playerMatchReportingEnabled
                    )
                }
            }.onSuccess { tournament ->
                state = CreateTournamentState(
                    isSaving = false,
                    successMessage = "Torneo start.gg creado"
                )
                onCreated(tournament)
            }.onFailure {
                state = CreateTournamentState(
                    isSaving = false,
                    errorMessage = "No se pudo crear el torneo start.gg."
                )
            }
        }
    }
}
