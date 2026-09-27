package com.gestortorneos.player.data.remote

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

data class PlayerStartggAuthStartRequestDto(
    val redirectUri: String
)

data class PlayerStartggAuthStartResponseDto(
    val authorizationUrl: String
)

data class PlayerProfileDto(
    val displayName: String,
    val gamerTag: String,
    val provider: String
)

data class PlayerCharactersRequestDto(
    val selections: List<PlayerCharacterSelectionRequestDto>
)

data class PlayerCharacterSelectionRequestDto(
    val participantId: String,
    val characterName: String
)

data class PlayerGameWinRequestDto(
    val participantId: String
)

data class PlayerScoreDto(
    val participantId: String,
    val score: Int
)

data class PlayerReportResultRequestDto(
    val winnerParticipantId: String,
    val scores: List<PlayerScoreDto>
)

data class PlayerDetailedReportSelectionDto(
    val participantId: String,
    val characterName: String
)

data class PlayerDetailedReportGameDto(
    val winnerParticipantId: String,
    val selections: List<PlayerDetailedReportSelectionDto>? = null
)

data class PlayerDetailedReportRequestDto(
    val bestOfOverride: Int? = null,
    val games: List<PlayerDetailedReportGameDto>
)

data class PlayerAbsenceRequestDto(
    val outcome: String
)

data class PlayerLadderActionRequestDto(
    val ignored: String = ""
)

data class PlayerPushTokenRequestDto(
    val token: String,
    val deviceLabel: String? = null
)

data class PlayerTournamentListDto(
    val tournaments: List<PlayerTournamentDto>
)

data class PlayerTournamentDto(
    val callTimeoutMinutes: Int = 10,
    val tournamentId: String,
    val title: String,
    val gameTitle: String,
    val status: String,
    val startsAt: String,
    val myParticipantId: String,
    val myDisplayName: String,
    val pendingMatches: List<PlayerMatchDto>,
    val activeMatches: List<PlayerMatchDto>,
    val completedMatches: List<PlayerMatchDto>,
    val bracketMatches: List<PlayerBracketMatchDto>? = emptyList(),
    val ladder: PlayerLadderDto? = null
)

data class PlayerBracketMatchDto(
    val displayIdentifier: String? = null,
    val startggStreamLabel: String? = null,
    val id: String,
    val tournamentId: String,
    val bracketStage: String,
    val roundNumber: Int,
    val matchNumber: Int,
    val label: String,
    val status: String,
    val bestOf: Int,
    val reportedBestOf: Int? = null,
    val advancersRequired: Int,
    val participants: List<PlayerBracketMatchParticipantDto>,
    val advancingParticipantIds: List<String> = emptyList(),
    val winnerParticipantId: String? = null,
    val stationLabel: String? = null,
    val calledAt: String? = null,
    val startedAt: String? = null,
    val characterSelections: List<PlayerMatchCharacterSelectionDto>? = null,
    val gameCharacterSelections: List<PlayerGameCharacterSelectionsDto>? = null,
    val gameResults: List<String>? = null,
    val phaseId: String? = null,
    val phaseName: String? = null,
    val phaseOrder: Int? = null,
    val phaseGroupId: String? = null,
    val phaseGroupName: String? = null,
    val phaseType: String? = null,
    val isPoolPhase: Boolean = false,
    val fullRoundText: String? = null
)

data class PlayerBracketMatchParticipantDto(
    val participantId: String,
    val displayName: String,
    val slot: Int,
    val score: Int
)

data class PlayerMatchDto(
    val ladderRevision: String? = null,
    val canReviewLadderResult: Boolean = false,
    val ladderMessage: String? = null,
    val entrantSize: Int = 1,
    val gameTitle: String = "",
    val id: String,
    val tournamentId: String,
    val tournamentTitle: String,
    val tournamentStatus: String,
    val startsAt: String,
    val roundLabel: String,
    val bracketStage: String,
    val status: String,
    val bestOf: Int,
    val reportedBestOf: Int? = null,
    val stationLabel: String? = null,
    val calledAt: String? = null,
    val startedAt: String? = null,
    val callTimeoutSeconds: Int? = null,
    val readyDeadlineAt: String? = null,
    val participantOneReadyAt: String? = null,
    val participantTwoReadyAt: String? = null,
    val myParticipantId: String,
    val mySlot: Int,
    val myDisplayName: String,
    val myScore: Int,
    val opponentParticipantId: String? = null,
    val opponentSlot: Int? = null,
    val opponentDisplayName: String? = null,
    val opponentScore: Int? = null,
    val winnerParticipantId: String? = null,
    val canPlayerReportMatch: Boolean = true,
    val canReportCharacters: Boolean = true,
    val characterSelections: List<PlayerMatchCharacterSelectionDto>? = null,
    val gameCharacterSelections: List<PlayerGameCharacterSelectionsDto>? = null,
    val gameResults: List<String>? = null
) {
    val effectiveBestOf: Int
        get() = reportedBestOf ?: bestOf
}

data class PlayerLadderDto(
    val options: com.gestortorneos.ui.LadderOptions? = null,
    val waitingReason: String? = null,
    val queuePosition: Int? = null,
    val canJoin: Boolean? = null,
    val status: String,
    val queuedAt: String? = null,
    val readyCheckMatch: PlayerMatchDto? = null,
    val activeMatch: PlayerMatchDto? = null,
    val history: List<PlayerMatchDto> = emptyList(),
    val standings: List<PlayerLadderStandingDto> = emptyList()
)

data class PlayerLadderStandingDto(
    val rating: Int? = null,
    val eligible: Boolean? = null,
    val winRate: Int? = null,
    val participantId: String,
    val displayName: String,
    val matchesPlayed: Int,
    val wins: Int,
    val losses: Int,
    val gamesWon: Int,
    val gamesLost: Int,
    val gameDifferential: Int
)

data class PlayerMatchCharacterSelectionDto(
    val participantId: String,
    val characterId: Int,
    val characterName: String
)

data class PlayerGameCharacterSelectionsDto(
    val gameNum: Int,
    val selections: List<PlayerMatchCharacterSelectionDto>
)

data class PlayerLadderReviewRequest(val action: String, val expectedRevision: String, val reason: String? = null)
interface PlayerApi {
    @POST("api/player/tournaments/{tournamentId}/ladder/matches/{matchId}/review")
    suspend fun reviewLadder(@Header("Authorization") authorization: String, @Path("tournamentId") tournamentId: String, @Path("matchId") matchId: String, @Body input: PlayerLadderReviewRequest): PlayerTournamentDto

    @POST("api/player/auth/startgg/mobile/start")
    suspend fun createStartggLogin(@Body body: PlayerStartggAuthStartRequestDto): PlayerStartggAuthStartResponseDto

    @GET("api/player/me")
    suspend fun getProfile(@Header("Authorization") authorization: String): PlayerProfileDto

    @POST("api/player/auth/logout")
    suspend fun logout(
        @Header("Authorization") authorization: String,
        @Body body: Map<String, String> = emptyMap()
    )

    @GET("api/player/tournaments")
    suspend fun getMyTournaments(@Header("Authorization") authorization: String): PlayerTournamentListDto

    @POST("api/player/push/register")
    suspend fun registerPushToken(
        @Header("Authorization") authorization: String,
        @Body body: PlayerPushTokenRequestDto
    )

    @POST("api/player/push/unregister")
    suspend fun unregisterPushToken(
        @Header("Authorization") authorization: String,
        @Body body: PlayerPushTokenRequestDto
    )

    @GET("api/player/tournaments/{tournamentId}")
    suspend fun getMyTournament(
        @Header("Authorization") authorization: String,
        @Path("tournamentId") tournamentId: String
    ): PlayerTournamentDto

    @POST("api/player/tournaments/{tournamentId}/matches/{matchId}/characters")
    suspend fun updateCharacters(
        @Header("Authorization") authorization: String,
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: PlayerCharactersRequestDto
    ): PlayerMatchDto

    @POST("api/player/tournaments/{tournamentId}/matches/{matchId}/game-win")
    suspend fun recordGameWin(
        @Header("Authorization") authorization: String,
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: PlayerGameWinRequestDto
    ): PlayerMatchDto

    @POST("api/player/tournaments/{tournamentId}/matches/{matchId}/report")
    suspend fun reportResult(
        @Header("Authorization") authorization: String,
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: PlayerReportResultRequestDto
    ): PlayerMatchDto

    @POST("api/player/tournaments/{tournamentId}/matches/{matchId}/report-detailed")
    suspend fun reportDetailedResult(
        @Header("Authorization") authorization: String,
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: PlayerDetailedReportRequestDto
    ): PlayerMatchDto

    @POST("api/player/tournaments/{tournamentId}/matches/{matchId}/absence")
    suspend fun resolveAbsence(
        @Header("Authorization") authorization: String,
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: PlayerAbsenceRequestDto
    ): PlayerMatchDto

    @POST("api/player/tournaments/{tournamentId}/matches/{matchId}/reset")
    suspend fun resetMatch(
        @Header("Authorization") authorization: String,
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: Map<String, String> = emptyMap()
    ): PlayerMatchDto

    @POST("api/player/tournaments/{tournamentId}/ladder/join")
    suspend fun joinLadderQueue(
        @Header("Authorization") authorization: String,
        @Path("tournamentId") tournamentId: String,
        @Body body: PlayerLadderActionRequestDto = PlayerLadderActionRequestDto()
    ): PlayerTournamentDto

    @POST("api/player/tournaments/{tournamentId}/ladder/leave")
    suspend fun leaveLadderQueue(
        @Header("Authorization") authorization: String,
        @Path("tournamentId") tournamentId: String,
        @Body body: PlayerLadderActionRequestDto = PlayerLadderActionRequestDto()
    ): PlayerTournamentDto

    @POST("api/player/tournaments/{tournamentId}/ladder/matches/{matchId}/ready")
    suspend fun readyLadderMatch(
        @Header("Authorization") authorization: String,
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: PlayerLadderActionRequestDto = PlayerLadderActionRequestDto()
    ): PlayerTournamentDto

    @POST("api/player/tournaments/{tournamentId}/ladder/matches/{matchId}/cancel")
    suspend fun cancelLadderMatch(
        @Header("Authorization") authorization: String,
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: PlayerLadderActionRequestDto = PlayerLadderActionRequestDto()
    ): PlayerTournamentDto

    @POST("api/player/tournaments/{tournamentId}/ladder/matches/{matchId}/report-detailed")
    suspend fun reportLadderDetailedResult(
        @Header("Authorization") authorization: String,
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: PlayerDetailedReportRequestDto
    ): PlayerTournamentDto
}
