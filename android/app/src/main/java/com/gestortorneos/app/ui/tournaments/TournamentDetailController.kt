package com.gestortorneos.app.ui.tournaments

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.gestortorneos.app.data.TournamentRepository
import com.gestortorneos.app.data.toTournamentErrorMessage
import com.gestortorneos.app.data.TournamentRepository.DetailedReportedGame
import com.gestortorneos.app.ui.AddParticipantInput
import com.gestortorneos.app.ui.TournamentDetail
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class TournamentDetailController(
    private val repository: TournamentRepository = TournamentRepository()
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var latestRequestId = 0L
    private val mutationMutex = Mutex()
    private var pendingMutations = 0

    var state by mutableStateOf(TournamentDetailState())
        private set

    fun load(tournamentId: String, silent: Boolean = false) {
        if (pendingMutations > 0) return
        val requestId = nextRequestId()
        if (!silent) state = TournamentDetailState(isLoading = true)
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    repository.getTournament(tournamentId)
                }
            }.onSuccess { detail ->
                if (requestId != latestRequestId) return@onSuccess
                state = state.copy(
                    isLoading = false,
                    detail = detail,
                    isMutating = false
                )
            }.onFailure {
                if (requestId != latestRequestId) return@onFailure
                state = TournamentDetailState(
                    isLoading = false,
                    detail = state.detail,
                    errorMessage = it.toTournamentErrorMessage()
                )
            }
        }
    }

    fun addParticipant(tournamentId: String, input: AddParticipantInput) {
        mutate(tournamentId) { repository.addParticipant(tournamentId, input) }
    }

    fun setArchived(tournamentId: String, archived: Boolean) {
        mutate(tournamentId) { repository.setArchived(tournamentId, archived) }
    }

    fun updateSetups(tournamentId: String, count: Int, streamCount: Int) {
        mutate(tournamentId) { repository.updateSetups(tournamentId, count, streamCount) }
    }

    fun updatePublicOptions(tournamentId: String, adminKey: String, options: Map<String, Boolean>) {
        mutate(tournamentId) { repository.updatePublicOptions(tournamentId, adminKey, options) }
    }

    fun updateTournament(tournamentId: String, detail: TournamentDetail) {
        mutate(tournamentId) { repository.updateTournament(tournamentId, detail) }
    }

    fun updateParticipant(tournamentId: String, participantId: String, displayName: String, seed: Int?) {
        mutate(tournamentId) { repository.updateParticipant(tournamentId, participantId, displayName, seed) }
    }

    fun deleteParticipant(tournamentId: String, participantId: String) {
        mutate(tournamentId) { repository.deleteParticipant(tournamentId, participantId) }
    }

    fun importStartggEvent(
        tournamentId: String,
        eventUrl: String,
        syncResults: Boolean = true,
        preserveTournamentTitle: Boolean = false
    ) {
        mutate(tournamentId) {
            repository.importStartggEvent(
                tournamentId = tournamentId,
                eventUrl = eventUrl,
                syncResults = syncResults,
                preserveTournamentTitle = preserveTournamentTitle
            )
        }
    }

    fun resetTournament(tournamentId: String) {
        mutate(tournamentId) { repository.resetTournament(tournamentId) }
    }

    fun generateBracket(tournamentId: String) {
        mutate(tournamentId) { repository.generateBracket(tournamentId) }
    }

    fun resetAndGenerateBracket(tournamentId: String) {
        mutate(tournamentId) { repository.resetAndGenerateBracket(tournamentId) }
    }

    fun startTournament(tournamentId: String) {
        mutate(tournamentId) { repository.startTournament(tournamentId) }
    }

    fun startLadder(tournamentId: String) {
        mutate(tournamentId) { repository.startLadder(tournamentId) }
    }

    fun finalizeLadder(tournamentId: String) {
        mutate(tournamentId) { repository.finalizeLadder(tournamentId) }
    }

    fun callMatch(tournamentId: String, matchId: String, stationLabel: String?) {
        mutate(tournamentId) { repository.callMatch(tournamentId, matchId, stationLabel) }
    }

    fun cancelCall(tournamentId: String, matchId: String) {
        mutate(tournamentId) { repository.cancelCall(tournamentId, matchId) }
    }

    fun startMatch(tournamentId: String, matchId: String) {
        mutate(tournamentId) { repository.startMatch(tournamentId, matchId) }
    }

    fun updateMatchCharacters(tournamentId: String, matchId: String, selections: List<Pair<String, String>>) {
        mutate(tournamentId) { repository.updateMatchCharacters(tournamentId, matchId, selections) }
    }

    fun updateMatchCharactersAndRecordGameWin(
        tournamentId: String,
        matchId: String,
        participantId: String,
        selections: List<Pair<String, String>>
    ) {
        mutate(tournamentId) {
            repository.updateMatchCharactersAndRecordGameWin(
                tournamentId = tournamentId,
                matchId = matchId,
                participantId = participantId,
                selections = selections
            )
        }
    }

    fun updateMatchCharactersAndReportWinner(
        tournamentId: String,
        matchId: String,
        winnerParticipantId: String,
        selections: List<Pair<String, String>>
    ) {
        mutate(tournamentId) {
            repository.updateMatchCharactersAndReportWinner(
                tournamentId = tournamentId,
                matchId = matchId,
                winnerParticipantId = winnerParticipantId,
                selections = selections
            )
        }
    }

    fun resolveAbsence(tournamentId: String, matchId: String, outcome: String) {
        mutate(tournamentId) { repository.resolveAbsence(tournamentId, matchId, outcome) }
    }

    fun recordGameWin(tournamentId: String, matchId: String, participantId: String) {
        mutate(tournamentId) { repository.recordGameWin(tournamentId, matchId, participantId) }
    }

    fun selectMarioKartAdvancer(tournamentId: String, matchId: String, participantId: String) {
        mutate(tournamentId) { repository.selectMarioKartAdvancer(tournamentId, matchId, participantId) }
    }

    fun reportWinner(tournamentId: String, matchId: String, winnerParticipantId: String) {
        mutate(tournamentId) { repository.reportWinner(tournamentId, matchId, winnerParticipantId) }
    }

    fun reportDetailedResult(tournamentId: String, matchId: String, bestOfOverride: Int?, games: List<DetailedReportedGame>, onComplete: (String?) -> Unit = {}) {
        var saved = false
        mutate(tournamentId, onComplete = { error -> onComplete(if (saved) null else error) }) {
            repository.reportDetailedResult(tournamentId, matchId, bestOfOverride, games) { saved = true }
        }
    }

    fun resetMatch(tournamentId: String, matchId: String) {
        mutate(tournamentId) { repository.resetMatch(tournamentId, matchId) }
    }

    private fun mutate(
        tournamentId: String,
        onComplete: (String?) -> Unit = {},
        block: suspend TournamentRepository.() -> com.gestortorneos.app.ui.TournamentDetail,
    ) {
        val requestId = nextRequestId()
        pendingMutations += 1
        state = state.copy(isMutating = true, errorMessage = null)
        scope.launch {
            mutationMutex.withLock {
                runCatching {
                    withContext(Dispatchers.IO) {
                        repository.block()
                    }
                }.onSuccess { detail ->
                    onComplete(null)
                    pendingMutations = (pendingMutations - 1).coerceAtLeast(0)
                    if (requestId != latestRequestId) {
                        if (pendingMutations == 0) {
                            state = state.copy(isMutating = false)
                        }
                        return@onSuccess
                    }
                    state = TournamentDetailState(
                        isLoading = false,
                        detail = detail,
                        isMutating = pendingMutations > 0
                    )
                }.onFailure {
                    onComplete(it.toTournamentErrorMessage())
                    pendingMutations = (pendingMutations - 1).coerceAtLeast(0)
                    if (requestId != latestRequestId) {
                        if (pendingMutations == 0) {
                            state = state.copy(isMutating = false)
                        }
                        return@onFailure
                    }
                    state = state.copy(
                        isMutating = pendingMutations > 0,
                        errorMessage = it.toTournamentErrorMessage()
                    )
                }
            }
        }
    }

    private fun nextRequestId(): Long {
        latestRequestId += 1
        return latestRequestId
    }
}
