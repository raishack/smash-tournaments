package com.gestortorneos.app.data

import com.gestortorneos.app.data.remote.CreateTournamentRequestDto
import com.gestortorneos.app.data.remote.CreateParticipantRequestDto
import com.gestortorneos.app.data.remote.NetworkModule
import com.gestortorneos.app.data.remote.CallMatchRequestDto
import com.gestortorneos.app.data.remote.DetailedReportGameDto
import com.gestortorneos.app.data.remote.DetailedReportGameSelectionDto
import com.gestortorneos.app.data.remote.DetailedReportResultRequestDto
import com.gestortorneos.app.data.remote.MatchScoreDto
import com.gestortorneos.app.data.remote.NotificationSettingsDto
import com.gestortorneos.app.data.remote.RecordGameWinRequestDto
import com.gestortorneos.app.data.remote.SelectMarioKartAdvancerRequestDto
import com.gestortorneos.app.data.remote.ReportResultRequestDto
import com.gestortorneos.app.data.remote.ResolveAbsenceRequestDto
import com.gestortorneos.app.data.remote.StartMatchRequestDto
import com.gestortorneos.app.data.remote.StartggImportPreviewRequestDto
import com.gestortorneos.app.data.remote.StartggImportRequestDto
import com.gestortorneos.app.data.remote.TournamentDetailDto
import com.gestortorneos.app.data.remote.TournamentListItemDto
import com.gestortorneos.app.data.remote.TournamentSettingsDto
import com.gestortorneos.app.data.remote.UpdateNotificationSettingsRequestDto
import com.gestortorneos.app.data.remote.UpdateMatchCharacterSelectionDto
import com.gestortorneos.app.data.remote.UpdateMatchCharactersRequestDto
import com.gestortorneos.app.data.remote.UpdateParticipantRequestDto
import com.gestortorneos.app.data.remote.UpdateTournamentRequestDto
import com.gestortorneos.app.ui.AddParticipantInput
import com.gestortorneos.app.ui.CreateTournamentInput
import com.gestortorneos.app.ui.MatchGameCharacterSelectionsSummary
import com.gestortorneos.app.ui.MatchSummary
import com.gestortorneos.app.ui.LadderMatchSummary
import com.gestortorneos.app.ui.LadderQueueSummary
import com.gestortorneos.app.ui.LadderStandingSummary
import com.gestortorneos.app.ui.LadderSummary
import com.gestortorneos.app.ui.TournamentDetail
import com.gestortorneos.app.ui.TournamentParticipantSummary
import com.gestortorneos.app.ui.TournamentSummary
import java.time.Instant
import java.time.temporal.ChronoUnit
import retrofit2.HttpException
import org.json.JSONObject

class TournamentRepository(
    private val api: com.gestortorneos.app.data.remote.TournamentApi = NetworkModule.tournamentApi
) {
    suspend fun setArchived(tournamentId: String, archived: Boolean): TournamentDetail {
        api.setArchived(tournamentId, mapOf("archived" to archived))
        return getTournament(tournamentId)
    }
    data class DetailedReportedGame(
        val expectedRevision: String? = null,
        val winnerParticipantId: String,
        val selections: List<Pair<String, String>> = emptyList()
    )

    data class StartggPreviewResult(
        val eventName: String,
        val formatLabel: String,
        val gameTitle: String,
        val entrantCount: Int,
        val participants: List<TournamentParticipantSummary>
    )

    data class AdminNotificationSettings(
        val telegramEnabled: Boolean,
        val whatsappEnabled: Boolean
    )

    suspend fun previewStartggImport(eventUrl: String): StartggPreviewResult {
        val preview = try {
            api.previewStartggImport(
                StartggImportPreviewRequestDto(eventUrl = eventUrl)
            )
        } catch (error: HttpException) {
            throw IllegalStateException(error.toBackendMessage())
        }
        val formatLabel = when (preview.format) {
            "DOUBLE_ELIMINATION" -> "Doble eliminacion - W Bo${preview.winnersBestOf} / L Bo${preview.losersBestOf}"
            "GROUPS_PLAYOFF" -> "Pools + bracket - W Bo${preview.winnersBestOf} / L Bo${preview.losersBestOf}"
            "ROUND_ROBIN" -> "Pools - Bo${preview.bestOf}"
            else -> "Eliminacion simple - Bo${preview.bestOf}"
        }
        return StartggPreviewResult(
            eventName = preview.eventName,
            formatLabel = formatLabel,
            gameTitle = preview.gameTitle,
            entrantCount = preview.entrantCount,
            participants = preview.participants.map { participant ->
                TournamentParticipantSummary(
                    id = participant.displayName,
                    displayName = participant.displayName,
                    seedLabel = "Seed ${participant.seed}",
                    seed = participant.seed,
                    status = "IMPORTADO"
                )
            }
        )
    }

    suspend fun getTournaments(): List<TournamentSummary> {
        return api.getTournaments().map { dto ->
            dto.toSummary()
        }
    }

    suspend fun getTournament(tournamentId: String): TournamentDetail {
        val request = com.gestortorneos.app.data.remote.OperationNetwork.beginRead()
        val dto = api.getTournament(tournamentId)
        dto.matches.forEach { com.gestortorneos.app.data.remote.OperationNetwork.remember(it.id, it.operationRevision, request) }
        return dto.toDetail()
    }

    suspend fun validateAdminDeleteKey(adminKey: String) {
        try {
            api.validateAdminDeleteKey(adminKey.trim())
        } catch (error: HttpException) {
            throw IllegalStateException(error.toBackendMessage())
        }
    }

    suspend fun getAdminNotificationSettings(adminKey: String): AdminNotificationSettings {
        return try {
            api.getNotificationSettings(adminKey.trim()).toModel()
        } catch (error: HttpException) {
            throw IllegalStateException(error.toBackendMessage())
        }
    }

    suspend fun updateAdminNotificationSettings(
        adminKey: String,
        telegramEnabled: Boolean,
        whatsappEnabled: Boolean
    ): AdminNotificationSettings {
        return try {
            api.updateNotificationSettings(
                adminKey = adminKey.trim(),
                body = UpdateNotificationSettingsRequestDto(
                    telegramEnabled = telegramEnabled,
                    whatsappEnabled = whatsappEnabled
                )
            ).toModel()
        } catch (error: HttpException) {
            throw IllegalStateException(error.toBackendMessage())
        }
    }

    suspend fun createTournament(input: CreateTournamentInput): TournamentSummary {
        val startsAt = Instant.now().plus(1, ChronoUnit.DAYS).toString()
        val request = CreateTournamentRequestDto(
            ownerId = "user_admin",
            title = input.title,
            gameTitle = input.gameTitle,
                description = input.description,
                platform = input.platform,
                startsAt = startsAt,
                maxParticipants = input.maxParticipants,
                isPublic = true,
                settings = TournamentSettingsDto(
                teamSize = input.teamSize, reserveCount = input.reserveCount, allowSoloRegistration = input.allowSoloRegistration,
                fortniteLobbySize = input.fortniteLobbySize, fortniteGamesPerRound = input.fortniteGamesPerRound,
                format = input.format,
                bracketMode = input.bracketMode,
                mkartAdvanceCount = input.mkartAdvanceCount,
                mkartLosersAdvanceCount = input.mkartLosersAdvanceCount,
                setupCount = input.setupCount,
                streamCount = input.streamCount,
                playAreaName = input.playAreaName?.trim().orEmpty(),
                bestOf = input.bestOf,
                winnersBestOf = input.winnersBestOf,
                losersBestOf = input.losersBestOf,
                hasThirdPlaceMatch = false,
                checkInRequired = true,
                allowRematchReview = true,
                seedingMethod = input.seedingMethod,
                autoCallMatches = false,
                callTimeoutMinutes = input.callTimeoutMinutes,
                autoDisqualifyAfterMinutes = 15,
                manualSeedingLocked = false,
                playerMatchReportingEnabled = input.playerMatchReportingEnabled
            )
        )

        return api.createTournament(request).toSummary()
    }

    suspend fun createStartggTournament(
        eventUrl: String,
        callTimeoutMinutes: Int,
        setupCount: Int,
        streamCount: Int,
        playerMatchReportingEnabled: Boolean,
    ): TournamentSummary {
        val detail = api.createStartggImport(mapOf(
            "eventUrl" to eventUrl, "setupCount" to setupCount, "streamCount" to streamCount,
            "callTimeoutMinutes" to callTimeoutMinutes,
            "playerMatchReportingEnabled" to playerMatchReportingEnabled
        )).toDetail()
        return detail.toSummary()
    }

    suspend fun deleteTournament(tournamentId: String, adminKey: String) {
        api.deleteTournament(
            tournamentId = tournamentId,
            adminKey = adminKey
        )
    }

    suspend fun addParticipant(tournamentId: String, input: AddParticipantInput): TournamentDetail {
        api.addParticipant(
            tournamentId = tournamentId,
            body = CreateParticipantRequestDto(
                displayName = input.displayName,
                seed = input.seed
            )
        )
        return getTournament(tournamentId)
    }

    suspend fun importStartggEvent(
        tournamentId: String,
        eventUrl: String,
        syncResults: Boolean = true,
        preserveTournamentTitle: Boolean = false
    ): TournamentDetail {
        return try {
            api.importStartggEvent(
                tournamentId = tournamentId,
                body = StartggImportRequestDto(
                    eventUrl = eventUrl,
                    syncResults = syncResults,
                    preserveTournamentTitle = preserveTournamentTitle
                )
            ).toDetail()
        } catch (error: HttpException) {
            throw IllegalStateException(error.toBackendMessage())
        }
    }

    suspend fun updateSetups(tournamentId: String, count: Int, streamCount: Int): TournamentDetail {
        try { api.updateSetups(tournamentId, mapOf("setupCount" to count, "streamCount" to streamCount)) }
        catch (error: HttpException) { throw IllegalStateException(error.toBackendMessage()) }
        return getTournament(tournamentId)
    }

    suspend fun createRegistrationAdminSession(tournamentId: String, adminKey: String): String {
        return api.createRegistrationAdminSession(tournamentId, adminKey)["url"] ?: error("No se pudo abrir el panel")
    }

    suspend fun createFortniteSession(tournamentId: String): String {
        return api.createFortniteSession(tournamentId)["url"] ?: error("No se pudo abrir Fortnite")
    }

    suspend fun createTop8Session(tournamentId: String): String {
        try { return api.createTop8Session(tournamentId)["url"] ?: error("No se pudo abrir el editor") }
        catch (error: HttpException) { throw IllegalStateException(error.toBackendMessage()) }
    }

    suspend fun teamRoster(tournamentId: String): com.gestortorneos.app.ui.TeamRoster = api.teamRoster(tournamentId)
    suspend fun teamAction(tournamentId: String, body: Map<String, Any?>): com.gestortorneos.app.ui.TeamRoster {
        try { return api.teamAction(tournamentId, body) }
        catch (error: HttpException) { throw IllegalStateException(error.toBackendMessage()) }
    }

    suspend fun updatePublicOptions(tournamentId: String, adminKey: String, options: Map<String, Boolean>): TournamentDetail {
        try { api.updatePublicOptions(tournamentId, adminKey, options) }
        catch (error: HttpException) { throw IllegalStateException(error.toBackendMessage()) }
        return getTournament(tournamentId)
    }

    suspend fun updateTournament(tournamentId: String, detail: TournamentDetail): TournamentDetail {
        api.updateTournament(
            tournamentId = tournamentId,
            body = UpdateTournamentRequestDto(
                title = detail.title,
                gameTitle = detail.game,
                description = detail.description,
                platform = detail.platform,
                maxParticipants = detail.maxParticipants,
                settings = TournamentSettingsDto(
                    format = detail.rawFormat,
                    fortniteLobbySize = detail.fortniteLobbySize,
                    fortniteGamesPerRound = detail.fortniteGamesPerRound,
                    bracketMode = detail.bracketMode,
                    mkartAdvanceCount = detail.mkartAdvanceCount,
                    mkartLosersAdvanceCount = detail.mkartLosersAdvanceCount,
                    setupCount = detail.setupCount,
                    streamCount = detail.streamCount,
                    playAreaName = detail.playAreaName?.trim().orEmpty(),
                    bestOf = detail.bestOf,
                    winnersBestOf = detail.winnersBestOf,
                    losersBestOf = detail.losersBestOf,
                    hasThirdPlaceMatch = false,
                    checkInRequired = true,
                    allowRematchReview = true,
                    seedingMethod = detail.seedingMethod,
                    autoCallMatches = false,
                    callTimeoutMinutes = detail.callTimeoutMinutes,
                    autoDisqualifyAfterMinutes = 15,
                    manualSeedingLocked = false,
                    playerMatchReportingEnabled = detail.playerMatchReportingEnabled
                )
            )
        )
        return getTournament(tournamentId)
    }

    suspend fun updateParticipant(
        tournamentId: String,
        participantId: String,
        displayName: String,
        seed: Int?
    ): TournamentDetail {
        api.updateParticipant(
            tournamentId = tournamentId,
            participantId = participantId,
            body = UpdateParticipantRequestDto(
                displayName = displayName,
                seed = seed
            )
        )
        return getTournament(tournamentId)
    }

    suspend fun deleteParticipant(
        tournamentId: String,
        participantId: String
    ): TournamentDetail {
        api.deleteParticipant(
            tournamentId = tournamentId,
            participantId = participantId
        )
        return getTournament(tournamentId)
    }

    suspend fun resetTournament(tournamentId: String): TournamentDetail {
        api.resetTournament(tournamentId)
        return getTournament(tournamentId)
    }

    suspend fun generateBracket(tournamentId: String): TournamentDetail {
        api.generateBracket(tournamentId)
        return getTournament(tournamentId)
    }

    suspend fun resetAndGenerateBracket(tournamentId: String): TournamentDetail {
        api.resetTournament(tournamentId)
        api.generateBracket(tournamentId)
        return getTournament(tournamentId)
    }

    suspend fun startTournament(tournamentId: String): TournamentDetail {
        api.startTournament(tournamentId)
        return getTournament(tournamentId)
    }

    suspend fun ladderBoard(id: String) = NetworkModule.tournamentApi.ladderBoard(id)
    suspend fun ladderControl(id: String, input: com.gestortorneos.ui.LadderControl) = NetworkModule.tournamentApi.ladderControl(id,input)
    suspend fun startLadder(tournamentId: String): TournamentDetail {
        api.startLadder(
            tournamentId = tournamentId,
            body = com.gestortorneos.app.data.remote.LadderActionRequestDto(startedByUserId = "user_admin")
        )
        return getTournament(tournamentId)
    }

    suspend fun finalizeLadder(tournamentId: String): TournamentDetail {
        api.finalizeLadder(
            tournamentId = tournamentId,
            body = com.gestortorneos.app.data.remote.LadderActionRequestDto(completedByUserId = "user_admin")
        )
        return getTournament(tournamentId)
    }

    suspend fun callMatch(tournamentId: String, matchId: String, stationLabel: String?): TournamentDetail {
        api.callMatch(
            tournamentId = tournamentId,
            matchId = matchId,
            body = CallMatchRequestDto(
                calledByUserId = "user_admin",
                stationLabel = stationLabel
            )
        )
        return getTournament(tournamentId)
    }

    suspend fun startMatch(tournamentId: String, matchId: String): TournamentDetail {
        api.startMatch(
            tournamentId = tournamentId,
            matchId = matchId,
            body = StartMatchRequestDto(startedByUserId = "user_admin")
        )
        return getTournament(tournamentId)
    }

    suspend fun updateMatchCharacters(
        tournamentId: String,
        matchId: String,
        selections: List<Pair<String, String>>
    ): TournamentDetail {
        api.updateMatchCharacters(
            tournamentId = tournamentId,
            matchId = matchId,
            body = UpdateMatchCharactersRequestDto(
                selections = selections.map { (participantId, characterName) ->
                    UpdateMatchCharacterSelectionDto(
                        participantId = participantId,
                        characterName = characterName
                    )
                }
            )
        )
        return getTournament(tournamentId)
    }

    suspend fun updateMatchCharactersAndRecordGameWin(
        tournamentId: String,
        matchId: String,
        participantId: String,
        selections: List<Pair<String, String>>
    ): TournamentDetail {
        api.updateMatchCharacters(
            tournamentId = tournamentId,
            matchId = matchId,
            body = UpdateMatchCharactersRequestDto(
                selections = selections.map { (selectedParticipantId, characterName) ->
                    UpdateMatchCharacterSelectionDto(
                        participantId = selectedParticipantId,
                        characterName = characterName
                    )
                }
            )
        )
        api.recordGameWin(
            tournamentId = tournamentId,
            matchId = matchId,
            body = RecordGameWinRequestDto(participantId = participantId)
        )
        return getTournamentAfterStartggSync(tournamentId)
    }

    suspend fun updateMatchCharactersAndReportWinner(
        tournamentId: String,
        matchId: String,
        winnerParticipantId: String,
        selections: List<Pair<String, String>>
    ): TournamentDetail {
        api.updateMatchCharacters(
            tournamentId = tournamentId,
            matchId = matchId,
            body = UpdateMatchCharactersRequestDto(
                selections = selections.map { (selectedParticipantId, characterName) ->
                    UpdateMatchCharacterSelectionDto(
                        participantId = selectedParticipantId,
                        characterName = characterName
                    )
                }
            )
        )
        val detail = getTournament(tournamentId)
        val match = detail.matches.firstOrNull { it.id == matchId }
            ?: throw IllegalStateException("Match not found")
        val winsNeeded = (match.effectiveBestOf / 2) + 1
        api.reportResult(
            tournamentId = tournamentId,
            matchId = matchId,
            body = ReportResultRequestDto(
                winnerParticipantId = winnerParticipantId,
                scores = match.participantIds.map { participantId ->
                    MatchScoreDto(
                        participantId = participantId,
                        score = if (participantId == winnerParticipantId) winsNeeded else 0
                    )
                }
            )
        )
        return getTournamentAfterMirroredMatchCompletion(tournamentId, matchId)
    }

    suspend fun cancelCall(tournamentId: String, matchId: String): TournamentDetail {
        api.cancelCall(
            tournamentId = tournamentId,
            matchId = matchId
        )
        return getTournament(tournamentId)
    }

    suspend fun resolveAbsence(tournamentId: String, matchId: String, outcome: String): TournamentDetail {
        api.resolveAbsence(
            tournamentId = tournamentId,
            matchId = matchId,
            body = ResolveAbsenceRequestDto(outcome = outcome)
        )
        return getTournament(tournamentId)
    }

    suspend fun recordGameWin(tournamentId: String, matchId: String, participantId: String): TournamentDetail {
        api.recordGameWin(
            tournamentId = tournamentId,
            matchId = matchId,
            body = RecordGameWinRequestDto(participantId = participantId)
        )
        return getTournament(tournamentId)
    }

    suspend fun selectMarioKartAdvancer(tournamentId: String, matchId: String, participantId: String): TournamentDetail {
        api.selectMarioKartAdvancer(
            tournamentId = tournamentId,
            matchId = matchId,
            body = SelectMarioKartAdvancerRequestDto(participantId = participantId)
        )
        return getTournament(tournamentId)
    }

    suspend fun resetMatch(tournamentId: String, matchId: String): TournamentDetail {
        api.resetMatch(
            tournamentId = tournamentId,
            matchId = matchId
        )
        return getTournament(tournamentId)
    }

    suspend fun reportWinner(tournamentId: String, matchId: String, winnerParticipantId: String): TournamentDetail {
        val detail = getTournament(tournamentId)
        val match = detail.matches.firstOrNull { it.id == matchId }
            ?: throw IllegalStateException("Match not found")
        val winsNeeded = (match.effectiveBestOf / 2) + 1
        api.reportResult(
            tournamentId = tournamentId,
            matchId = matchId,
            body = ReportResultRequestDto(
                winnerParticipantId = winnerParticipantId,
                scores = match.participantIds.map { participantId ->
                    MatchScoreDto(
                        participantId = participantId,
                        score = if (participantId == winnerParticipantId) winsNeeded else 0
                    )
                }
            )
        )
        return getTournamentAfterMirroredMatchCompletion(tournamentId, matchId)
    }

    suspend fun reportDetailedResult(
        tournamentId: String,
        matchId: String,
        bestOfOverride: Int?,
        games: List<DetailedReportedGame>,
        onSaved: () -> Unit = {}
    ): TournamentDetail {
        api.reportDetailedResult(
            tournamentId = tournamentId,
            matchId = matchId,
            body = DetailedReportResultRequestDto(
                expectedRevision = games.firstOrNull()?.expectedRevision,
                bestOfOverride = bestOfOverride,
                games = games.map { game ->
                    DetailedReportGameDto(
                        winnerParticipantId = game.winnerParticipantId,
                        selections = game.selections
                            .takeIf { it.isNotEmpty() }
                            ?.map { (participantId, characterName) ->
                                DetailedReportGameSelectionDto(
                                    participantId = participantId,
                                    characterName = characterName
                                )
                            }
                    )
                }
            )
        )
        onSaved()
        return getTournamentAfterMirroredMatchCompletion(tournamentId, matchId)
    }

    private suspend fun getTournamentAfterStartggSync(tournamentId: String): TournamentDetail {
        return getTournament(tournamentId)
    }

    private suspend fun getTournamentAfterMirroredMatchCompletion(tournamentId: String, matchId: String): TournamentDetail {
        return getTournament(tournamentId)
    }
}

private fun TournamentListItemDto.toSummary(): TournamentSummary {
    return TournamentSummary(
        id = id,
        title = title,
        game = gameTitle,
        status = com.gestortorneos.ui.tournamentClientStatus(status, settings.importJob?.state),
        participants = maxParticipants,
        format = settings.toFormatLabel(),
        nextAction = "Abrir torneo"
    )
}

private fun TournamentDetailDto.toDetail(): TournamentDetail {
    return TournamentDetail(
        importProgress = tournament.settings.importJob?.takeIf { it.state == "RUNNING" }?.progress?.label,
        id = tournament.id,
        title = tournament.title,
        game = tournament.gameTitle,
        description = tournament.settings.importJob?.error ?: tournament.description,
        status = com.gestortorneos.ui.tournamentClientStatus(tournament.status, tournament.settings.importJob?.state),
        platform = tournament.platform,
        maxParticipants = tournament.maxParticipants,
        format = tournament.settings.toFormatLabel(),
        rawFormat = tournament.settings.format,
        bracketMode = tournament.settings.bracketMode ?: "STANDARD",
        mkartAdvanceCount = tournament.settings.mkartAdvanceCount ?: 1,
        mkartLosersAdvanceCount = tournament.settings.mkartLosersAdvanceCount ?: (tournament.settings.mkartAdvanceCount ?: 1),
        bestOf = tournament.settings.bestOf,
        winnersBestOf = tournament.settings.winnersBestOf ?: tournament.settings.bestOf,
        losersBestOf = tournament.settings.losersBestOf ?: tournament.settings.bestOf,
        seedingMethod = tournament.settings.seedingMethod,
        callTimeoutMinutes = tournament.settings.callTimeoutMinutes,
        setupCount = tournament.settings.setupCount ?: 1,
        streamCount = tournament.settings.streamCount ?: 0,
        displayEnabled = tournament.settings.displayEnabled != false,
        teamSize = tournament.settings.teamSize ?: 1,
        fortniteLobbySize = tournament.settings.fortniteLobbySize ?: 20,
        fortniteGamesPerRound = tournament.settings.fortniteGamesPerRound ?: 3,
        reserveCount = tournament.settings.reserveCount ?: 0,
        allowSoloRegistration = tournament.settings.allowSoloRegistration == true,
        registrationEnabled = tournament.settings.registrationEnabled == true,
        registrationUrl = tournament.settings.registrationUrl,
        playAreaName = tournament.settings.playAreaName?.trim()?.takeIf { it.isNotEmpty() },
        isStartggMirrored = tournament.importSource?.provider == "START_GG" || tournament.settings.importJob != null,
        startggEventUrl = tournament.importSource?.eventUrl ?: tournament.settings.importJob?.eventUrl,
        playerMatchReportingEnabled = tournament.settings.playerMatchReportingEnabled != false,
        supportsSmashCharacterReporting = tournament.importSource?.provider == "START_GG"
            && (tournament.gameTitle.contains("smash", ignoreCase = true)
                || tournament.gameTitle.contains("ultimate", ignoreCase = true) || Regex("rivals|roa", RegexOption.IGNORE_CASE).containsMatchIn(tournament.gameTitle)),
        participants = participants.map { participant ->
            TournamentParticipantSummary(
                id = participant.id,
                displayName = participant.displayName,
                seedLabel = participant.seed?.let { "Seed $it" } ?: "Sin seed",
                seed = participant.seed,
                status = participant.status.replace('_', ' ')
            )
        },
        matches = matches.map { match ->
            MatchSummary(
                operationRevision = match.operationRevision,
                tournamentId = tournament.id,
                syncStatus = match.syncStatus,
                entrantSize = tournament.importSource?.entrantSize ?: 1,
                gameTitle = tournament.gameTitle,
                bracketMode = tournament.settings.bracketMode ?: "STANDARD",
                id = match.id,
                bracketStage = match.bracketStage,
                roundNumber = match.roundNumber,
                matchNumber = match.matchNumber,
                label = match.displayLabel ?: match.bracketStage.toStageLabel(match.roundNumber, match.matchNumber),
                displayIdentifier = match.displayIdentifier,
                startggStreamLabel = match.startggStreamLabel,
                status = match.status.replace('_', ' '),
                participantsLabel = match.participants.joinToString(" vs ") { it.displayName }.ifBlank { "Pendiente de definir" },
                participantNames = match.participants.map { it.displayName },
                participantIds = match.participants.map { it.participantId },
                participantScores = match.participants.map { it.score },
                advancersRequired = match.advancersRequired,
                advancingParticipantIds = match.advancingParticipantIds ?: emptyList(),
                winnerParticipantId = match.winnerParticipantId,
                winnerName = match.participants.firstOrNull { it.participantId == match.winnerParticipantId }?.displayName,
                bestOf = match.bestOf,
                reportedBestOf = match.reportedBestOf,
                characterSelections = (match.characterSelections ?: emptyList()).groupBy { it.participantId }.values.map { selections ->
                    val selection = selections.first().copy(characterName = selections.joinToString(" / ") { it.characterName })
                    com.gestortorneos.app.ui.MatchCharacterSelectionSummary(
                        participantId = selection.participantId,
                        characterName = selection.characterName
                    )
                },
                gameResults = match.gameResults ?: emptyList(),
                gameCharacterSelections = (match.gameCharacterSelections ?: emptyList()).map { game ->
                    MatchGameCharacterSelectionsSummary(
                        gameNum = game.gameNum,
                        selections = game.selections.groupBy { it.participantId }.values.map { selections ->
                            val selection = selections.first().copy(characterName = selections.joinToString(" / ") { it.characterName })
                            com.gestortorneos.app.ui.MatchCharacterSelectionSummary(
                                participantId = selection.participantId,
                                characterName = selection.characterName
                            )
                        }
                    )
                },
                calledAt = match.call?.calledAt,
                startedAt = match.call?.startedAt,
                stationLabel = match.call?.stationLabel,
                calledElapsed = match.call?.let {
                    val stationText = it.stationLabel?.takeIf { label -> label.isNotBlank() }?.let { label -> "Estacion $label" }
                    listOfNotNull(stationText).joinToString(" - ").ifBlank { null }
                },
                phaseId = match.externalRef?.phaseId,
                phaseName = match.externalRef?.phaseName,
                phaseOrder = match.externalRef?.phaseOrder,
                phaseGroupId = match.externalRef?.phaseGroupId,
                phaseGroupName = match.externalRef?.phaseGroupName,
                phaseType = match.externalRef?.phaseType,
                isPoolPhase = match.externalRef?.isPoolPhase ?: (match.bracketStage == "POOLS"),
                fullRoundText = match.roundLabel ?: match.externalRef?.fullRoundText
            )
        },
        ladder = ladder?.toSummary()
    )
}

private fun TournamentDetail.toSummary(): TournamentSummary {
    return TournamentSummary(
        id = id,
        title = title,
        game = game,
        status = status,
        participants = participants.size,
        format = format,
        nextAction = "Abrir torneo"
    )
}

private fun TournamentSettingsDto.toFormatLabel(): String {
    if (bracketMode == "FORTNITE") return "Fortnite · ${fortniteLobbySize ?: 20} puestos · ${fortniteGamesPerRound ?: 3} partidas por ronda"
    if ((bracketMode ?: "STANDARD") == "MKART") {
        val formatBase = if (format == "DOUBLE_ELIMINATION") "MKART doble" else "MKART simple"
        val winnersAdvance = mkartAdvanceCount ?: 1
        val losersAdvance = mkartLosersAdvanceCount ?: winnersAdvance
        return if (format == "DOUBLE_ELIMINATION") {
            "$formatBase - W pasa $winnersAdvance / L pasa $losersAdvance"
        } else {
            "$formatBase - pasa $winnersAdvance"
        }
    }

    val formatLabel = when (format) {
        "SINGLE_ELIMINATION" -> "Eliminacion simple"
        "DOUBLE_ELIMINATION" -> "Doble eliminacion"
        "ROUND_ROBIN" -> "Round robin"
        "SWISS" -> "Swiss"
        "GROUPS_PLAYOFF" -> "Grupos + playoff"
        else -> format
    }

    val winners = winnersBestOf ?: bestOf
    val losers = losersBestOf ?: winners
    return if (format == "DOUBLE_ELIMINATION" || format == "GROUPS_PLAYOFF") {
        "$formatLabel - W Bo$winners / L Bo$losers"
    } else {
        "$formatLabel - Bo$winners"
    }
}

private fun String.toStageLabel(roundNumber: Int, matchNumber: Int): String {
    val stage = when (this) {
        "POOLS" -> "Pool"
        "WINNERS" -> "Winners"
        "LOSERS" -> "Losers"
        "FINALS" -> "Final"
        else -> "Ronda"
    }

    return if (this == "FINALS") {
        "$stage - Match $matchNumber"
    } else {
        "$stage R$roundNumber - Match $matchNumber"
    }
}

private fun HttpException.toBackendMessage(): String {
    val fallback = "HTTP ${code()} ${message() ?: "error"}"
    return runCatching { JSONObject(response()?.errorBody()?.string().orEmpty()).optString("message").takeIf { it.isNotBlank() } }
        .getOrNull() ?: fallback
}

internal fun Throwable.toTournamentErrorMessage(): String =
    if (this is HttpException) toBackendMessage() else message?.takeIf { it.isNotBlank() } ?: "No se pudo completar la accion."

private fun NotificationSettingsDto.toModel(): TournamentRepository.AdminNotificationSettings {
    return TournamentRepository.AdminNotificationSettings(
        telegramEnabled = telegramEnabled,
        whatsappEnabled = whatsappEnabled
    )
}

private fun com.gestortorneos.app.data.remote.LadderOverviewDto.toSummary(): LadderSummary {
    return LadderSummary(
        options = session?.options,
        status = session?.status ?: "INACTIVE",
        queue = queue.map { entry ->
            LadderQueueSummary(
                participantId = entry.participantId,
                displayName = entry.displayName,
                queuedAt = entry.queuedAt
            )
        },
        activeMatches = activeMatches.map { it.toSummary() },
        completedMatches = completedMatches.map { it.toSummary() },
        standings = standings.map { standing ->
            LadderStandingSummary(
                participantId = standing.participantId,
                displayName = standing.displayName,
                matchesPlayed = standing.matchesPlayed,
                wins = standing.wins,
                losses = standing.losses,
                gamesWon = standing.gamesWon,
                gamesLost = standing.gamesLost,
                gameDifferential = standing.gameDifferential
            )
        }
    )
}

private fun com.gestortorneos.app.data.remote.LadderMatchDto.toSummary(): LadderMatchSummary {
    return LadderMatchSummary(
        id = id,
        status = status,
        bestOf = bestOf,
        participants = participants.map { participant ->
            TournamentParticipantSummary(
                id = participant.participantId,
                displayName = participant.displayName,
                seedLabel = "Slot ${participant.slot}",
                seed = participant.slot,
                status = if (winnerParticipantId == participant.participantId) "GANADOR" else "LADDER"
            )
        },
        scores = participants.map { it.score },
        winnerParticipantId = winnerParticipantId,
        readyDeadlineAt = readyDeadlineAt,
        participantOneReadyAt = participantOneReadyAt,
        participantTwoReadyAt = participantTwoReadyAt,
        startedAt = startedAt,
        completedAt = completedAt,
        characterSelections = (characterSelections ?: emptyList()).map { selection ->
            com.gestortorneos.app.ui.MatchCharacterSelectionSummary(
                participantId = selection.participantId,
                characterName = selection.characterName
            )
        },
        gameResults = gameResults ?: emptyList(),
        gameCharacterSelections = (gameCharacterSelections ?: emptyList()).map { game ->
            MatchGameCharacterSelectionsSummary(
                gameNum = game.gameNum,
                selections = game.selections.groupBy { it.participantId }.values.map { selections ->
                            val selection = selections.first().copy(characterName = selections.joinToString(" / ") { it.characterName })
                    com.gestortorneos.app.ui.MatchCharacterSelectionSummary(
                        participantId = selection.participantId,
                        characterName = selection.characterName
                    )
                }
            )
        }
    )
}
