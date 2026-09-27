package com.gestortorneos.app.data.remote

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

data class TournamentListItemDto(
    val registeredParticipants: Int? = null,
    val id: String,
    val title: String,
    val gameTitle: String,
    val description: String,
    val platform: String,
    val status: String,
    val maxParticipants: Int,
    val settings: TournamentSettingsDto,
    val importSource: TournamentImportSourceDto? = null
)

data class TournamentImportSourceDto(
    val provider: String,
    val eventUrl: String? = null,
    val entrantSize: Int? = null,
    val hasPools: Boolean? = null
)

data class StartggImportJobDto(val state: String = "", val eventUrl: String = "", val error: String? = null, val progress: ImportProgressDto? = null)

data class TournamentSettingsDto(
    val fortniteLobbySize: Int? = null,
    val fortniteGamesPerRound: Int? = null,
    val teamSize: Int? = null,
    val reserveCount: Int? = null,
    val allowSoloRegistration: Boolean? = null,
    val displayEnabled: Boolean? = null,
    val registrationEnabled: Boolean? = null,
    val registrationUrl: String? = null,
    val importJob: StartggImportJobDto? = null,
    val format: String,
    val bracketMode: String? = null,
    val mkartAdvanceCount: Int? = null,
    val mkartLosersAdvanceCount: Int? = null,
    val setupCount: Int? = null,
    val streamCount: Int? = null,
    val playAreaName: String? = null,
    val bestOf: Int,
    val winnersBestOf: Int? = null,
    val losersBestOf: Int? = null,
    val hasThirdPlaceMatch: Boolean,
    val checkInRequired: Boolean,
    val allowRematchReview: Boolean,
    val seedingMethod: String,
    val autoCallMatches: Boolean,
    val callTimeoutMinutes: Int,
    val autoDisqualifyAfterMinutes: Int?,
    val manualSeedingLocked: Boolean,
    val playerMatchReportingEnabled: Boolean? = null
)

data class TournamentParticipantDto(
    val id: String,
    val displayName: String,
    val seed: Int?,
    val checkedIn: Boolean,
    val status: String
)

data class MatchParticipantDto(
    val participantId: String,
    val displayName: String,
    val slot: Int,
    val score: Int
)

data class MatchCallDto(
    val calledAt: String,
    val calledByUserId: String,
    val stationLabel: String?,
    val startedAt: String?,
    val startedByUserId: String?
)

data class MatchDto(
    val operationRevision: String? = null,
    val syncStatus: MatchSyncStatus? = null,
    val displayLabel: String? = null,
    val displayIdentifier: String? = null,
    val startggStreamLabel: String? = null,
    val roundLabel: String? = null,
    val id: String,
    val bracketStage: String,
    val roundNumber: Int,
    val matchNumber: Int,
    val status: String,
    val bestOf: Int,
    val reportedBestOf: Int? = null,
    val advancersRequired: Int,
    val advancingParticipantIds: List<String>? = null,
    val participants: List<MatchParticipantDto>,
    val characterSelections: List<MatchCharacterSelectionDto>? = null,
    val gameResults: List<String>? = null,
    val gameCharacterSelections: List<MatchGameCharacterSelectionsDto>? = null,
    val winnerParticipantId: String?,
    val call: MatchCallDto?,
    val externalRef: MatchExternalRefDto? = null
)

data class MatchExternalRefDto(
    val phaseId: String? = null,
    val phaseGroupId: String? = null,
    val phaseName: String? = null,
    val phaseOrder: Int? = null,
    val phaseGroupName: String? = null,
    val phaseType: String? = null,
    val isPoolPhase: Boolean? = null,
    val fullRoundText: String? = null
)

data class MatchCharacterSelectionDto(
    val participantId: String,
    val characterId: Int,
    val characterName: String
)

data class MatchGameCharacterSelectionsDto(
    val gameNum: Int,
    val selections: List<MatchCharacterSelectionDto>
)

data class LadderSessionDto(
    val options: com.gestortorneos.ui.LadderOptions? = null,
    val id: String,
    val tournamentId: String,
    val status: String,
    val createdAt: String,
    val startedAt: String,
    val completedAt: String? = null
)

data class LadderQueueEntryDto(
    val id: String,
    val participantId: String,
    val displayName: String,
    val queuedAt: String
)

data class LadderMatchDto(
    val id: String,
    val status: String,
    val bestOf: Int,
    val participants: List<MatchParticipantDto>,
    val readyDeadlineAt: String? = null,
    val participantOneReadyAt: String? = null,
    val participantTwoReadyAt: String? = null,
    val winnerParticipantId: String? = null,
    val gameResults: List<String>? = null,
    val characterSelections: List<MatchCharacterSelectionDto>? = null,
    val gameCharacterSelections: List<MatchGameCharacterSelectionsDto>? = null,
    val startedAt: String? = null,
    val completedAt: String? = null
)

data class LadderStandingDto(
    val participantId: String,
    val displayName: String,
    val matchesPlayed: Int,
    val wins: Int,
    val losses: Int,
    val gamesWon: Int,
    val gamesLost: Int,
    val gameDifferential: Int
)

data class LadderOverviewDto(
    val session: LadderSessionDto? = null,
    val queue: List<LadderQueueEntryDto> = emptyList(),
    val activeMatches: List<LadderMatchDto> = emptyList(),
    val completedMatches: List<LadderMatchDto> = emptyList(),
    val standings: List<LadderStandingDto> = emptyList()
)

data class CreateParticipantRequestDto(
    val displayName: String,
    val seed: Int?
)

data class UpdateTournamentRequestDto(
    val title: String,
    val gameTitle: String,
    val description: String,
    val platform: String,
    val maxParticipants: Int,
    val settings: TournamentSettingsDto
)

data class UpdateParticipantRequestDto(
    val displayName: String,
    val seed: Int?,
    val clearSeed: Boolean = seed == null,
    val checkedIn: Boolean? = null,
    val status: String? = null
)

data class CallMatchRequestDto(
    val calledByUserId: String,
    val stationLabel: String?
)

data class MatchScoreDto(
    val participantId: String,
    val score: Int
)

data class ReportResultRequestDto(
    val winnerParticipantId: String,
    val scores: List<MatchScoreDto>
)

data class DetailedReportGameSelectionDto(
    val participantId: String,
    val characterName: String
)

data class DetailedReportGameDto(
    val winnerParticipantId: String,
    val selections: List<DetailedReportGameSelectionDto>? = null
)

data class DetailedReportResultRequestDto(
    val expectedRevision: String? = null,
    val bestOfOverride: Int? = null,
    val games: List<DetailedReportGameDto>
)

data class StartMatchRequestDto(
    val startedByUserId: String
)

data class RecordGameWinRequestDto(
    val participantId: String
)

data class UpdateMatchCharactersRequestDto(
    val selections: List<UpdateMatchCharacterSelectionDto>
)

data class UpdateMatchCharacterSelectionDto(
    val participantId: String,
    val characterName: String
)

data class SelectMarioKartAdvancerRequestDto(
    val participantId: String
)

data class ResolveAbsenceRequestDto(
    val outcome: String
)

data class TournamentDetailDto(
    val tournament: TournamentListItemDto,
    val participants: List<TournamentParticipantDto>,
    val matches: List<MatchDto>,
    val ladder: LadderOverviewDto? = null
)

data class StartggImportPreviewRequestDto(
    val eventUrl: String
)

data class StartggImportRequestDto(
    val eventUrl: String,
    val syncResults: Boolean = true,
    val preserveTournamentTitle: Boolean = false
)

data class StartggPreviewParticipantDto(
    val displayName: String,
    val seed: Int
)

data class StartggImportPreviewDto(
    val eventId: String,
    val eventName: String,
    val eventSlug: String,
    val eventUrl: String,
    val gameTitle: String,
    val entrantCount: Int,
    val entrantSize: Int,
    val hasPools: Boolean,
    val phaseGroupId: String? = null,
    val format: String,
    val bestOf: Int,
    val winnersBestOf: Int,
    val losersBestOf: Int,
    val participants: List<StartggPreviewParticipantDto>
)

data class NotificationSettingsDto(
    val telegramEnabled: Boolean,
    val whatsappEnabled: Boolean
)

data class UpdateNotificationSettingsRequestDto(
    val telegramEnabled: Boolean,
    val whatsappEnabled: Boolean
)

data class CreateTournamentRequestDto(
    val ownerId: String,
    val title: String,
    val gameTitle: String,
    val description: String,
    val platform: String,
    val startsAt: String,
    val maxParticipants: Int,
    val isPublic: Boolean,
    val settings: TournamentSettingsDto
)

data class LadderActionRequestDto(
    val startedByUserId: String? = null,
    val completedByUserId: String? = null
)

interface TournamentApi {
    @POST("api/tournaments/{tournamentId}/participants/{participantId}/attendance")
    suspend fun updateAttendance(@Path("tournamentId") tournamentId: String, @Path("participantId") participantId: String, @Body input: Map<String, Boolean>)

    @GET("api/tournaments/{tournamentId}/review")
    suspend fun getReview(@Path("tournamentId") tournamentId: String): com.gestortorneos.ui.TournamentReviewData

    @GET("api/tournaments/{id}/ladder")
    suspend fun ladderBoard(@Path("id") id: String): com.gestortorneos.ui.LadderBoard
    @POST("api/tournaments/{id}/ladder/control")
    suspend fun ladderControl(@Path("id") id: String, @Body input: com.gestortorneos.ui.LadderControl): com.gestortorneos.ui.LadderBoard

    @GET("api/tournaments/{tournamentId}/activity")
    suspend fun getActivity(@Path("tournamentId") tournamentId: String): TournamentActivity

    @POST("api/tournaments/{tournamentId}/matches/{matchId}/retry-sync")
    suspend fun retrySync(@Path("tournamentId") tournamentId: String, @Path("matchId") matchId: String): Map<String, Boolean>

    @POST("api/tournaments/{tournamentId}/setups")
    suspend fun updateSetups(@Path("tournamentId") tournamentId: String, @Body body: Map<String, Int>): TournamentListItemDto

    @POST("api/tournaments/{tournamentId}/public-options")
    suspend fun updatePublicOptions(@Path("tournamentId") tournamentId: String, @Header("X-Admin-Key") adminKey: String, @Body body: Map<String, Boolean>): TournamentListItemDto

    @POST("api/tournaments/{tournamentId}/registration-admin/session")
    suspend fun createRegistrationAdminSession(@Path("tournamentId") tournamentId: String, @Header("X-Admin-Key") adminKey: String): Map<String, String>

    @POST("api/tournaments/{tournamentId}/fortnite/session")
    suspend fun createFortniteSession(@Path("tournamentId") tournamentId: String): Map<String, String>

    @POST("api/tournaments/{tournamentId}/top8-session")
    suspend fun createTop8Session(@Path("tournamentId") tournamentId: String): Map<String, String>

    @GET("api/tournaments/{tournamentId}/team-roster")
    suspend fun teamRoster(@Path("tournamentId") tournamentId: String): com.gestortorneos.app.ui.TeamRoster

    @POST("api/tournaments/{tournamentId}/team-roster")
    suspend fun teamAction(@Path("tournamentId") tournamentId: String, @Body body: Map<String, @JvmSuppressWildcards Any?>): com.gestortorneos.app.ui.TeamRoster

    @POST("api/tournaments/import/startgg")
    suspend fun createStartggImport(@Body body: Map<String, @JvmSuppressWildcards Any>): TournamentDetailDto

    @GET("api/tournaments?includeArchived=true")
    suspend fun getTournaments(): List<TournamentListItemDto>

    @POST("api/tournaments/{tournamentId}/archive")
    suspend fun setArchived(@Path("tournamentId") tournamentId: String, @Body body: Map<String, Boolean>): TournamentListItemDto

    @POST("api/tournaments/admin/validate-delete-key")
    suspend fun validateAdminDeleteKey(
        @Header("X-Admin-Key") adminKey: String,
        @Body body: Map<String, String> = emptyMap()
    )

    @GET("api/admin/notification-settings")
    suspend fun getNotificationSettings(
        @Header("X-Admin-Key") adminKey: String
    ): NotificationSettingsDto

    @POST("api/admin/notification-settings")
    suspend fun updateNotificationSettings(
        @Header("X-Admin-Key") adminKey: String,
        @Body body: UpdateNotificationSettingsRequestDto
    ): NotificationSettingsDto

    @GET("api/tournaments/{tournamentId}")
    suspend fun getTournament(@Path("tournamentId") tournamentId: String): TournamentDetailDto

    @POST("api/tournaments")
    suspend fun createTournament(@Body body: CreateTournamentRequestDto): TournamentListItemDto

    @POST("api/tournaments/import/startgg-preview")
    suspend fun previewStartggImport(@Body body: StartggImportPreviewRequestDto): StartggImportPreviewDto

    @POST("api/tournaments/{tournamentId}/delete")
    suspend fun deleteTournament(
        @Path("tournamentId") tournamentId: String,
        @Header("X-Admin-Key") adminKey: String,
        @Body body: Map<String, String> = emptyMap()
    )

    @POST("api/tournaments/{tournamentId}/update")
    suspend fun updateTournament(
        @Path("tournamentId") tournamentId: String,
        @Body body: UpdateTournamentRequestDto
    ): TournamentListItemDto

    @POST("api/tournaments/{tournamentId}/participants")
    suspend fun addParticipant(
        @Path("tournamentId") tournamentId: String,
        @Body body: CreateParticipantRequestDto
    ): TournamentParticipantDto

    @POST("api/tournaments/{tournamentId}/import/startgg?background=true")
    suspend fun importStartggEvent(
        @Path("tournamentId") tournamentId: String,
        @Body body: StartggImportRequestDto
    ): TournamentDetailDto

    @POST("api/tournaments/{tournamentId}/participants/{participantId}/update")
    suspend fun updateParticipant(
        @Path("tournamentId") tournamentId: String,
        @Path("participantId") participantId: String,
        @Body body: UpdateParticipantRequestDto
    ): TournamentParticipantDto

    @POST("api/tournaments/{tournamentId}/participants/{participantId}/delete")
    suspend fun deleteParticipant(
        @Path("tournamentId") tournamentId: String,
        @Path("participantId") participantId: String,
        @Body body: Map<String, String> = emptyMap()
    )

    @POST("api/tournaments/{tournamentId}/reset")
    suspend fun resetTournament(
        @Path("tournamentId") tournamentId: String,
        @Body body: Map<String, String> = emptyMap()
    ): TournamentListItemDto

    @POST("api/tournaments/{tournamentId}/bracket")
    suspend fun generateBracket(@Path("tournamentId") tournamentId: String): List<MatchDto>

    @POST("api/tournaments/{tournamentId}/start")
    suspend fun startTournament(
        @Path("tournamentId") tournamentId: String,
        @Body body: Map<String, String> = emptyMap()
    ): TournamentListItemDto

    @POST("api/tournaments/{tournamentId}/ladder/start")
    suspend fun startLadder(
        @Path("tournamentId") tournamentId: String,
        @Body body: LadderActionRequestDto
    ): LadderOverviewDto

    @POST("api/tournaments/{tournamentId}/ladder/finalize")
    suspend fun finalizeLadder(
        @Path("tournamentId") tournamentId: String,
        @Body body: LadderActionRequestDto
    ): LadderOverviewDto

    @POST("api/tournaments/{tournamentId}/matches/{matchId}/call")
    suspend fun callMatch(
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: CallMatchRequestDto
    ): MatchDto

    @POST("api/tournaments/{tournamentId}/matches/{matchId}/cancel-call")
    suspend fun cancelCall(
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String
    ): MatchDto

    @POST("api/tournaments/{tournamentId}/matches/{matchId}/start")
    suspend fun startMatch(
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: StartMatchRequestDto
    ): MatchDto

    @POST("api/tournaments/{tournamentId}/matches/{matchId}/characters")
    suspend fun updateMatchCharacters(
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: UpdateMatchCharactersRequestDto
    ): MatchDto

    @POST("api/tournaments/{tournamentId}/matches/{matchId}/game-win")
    suspend fun recordGameWin(
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: RecordGameWinRequestDto
    ): MatchDto

    @POST("api/tournaments/{tournamentId}/matches/{matchId}/mkart-advance")
    suspend fun selectMarioKartAdvancer(
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: SelectMarioKartAdvancerRequestDto
    ): MatchDto

    @POST("api/tournaments/{tournamentId}/matches/{matchId}/absence")
    suspend fun resolveAbsence(
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: ResolveAbsenceRequestDto
    ): MatchDto

    @POST("api/tournaments/{tournamentId}/matches/{matchId}/reset")
    suspend fun resetMatch(
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: Map<String, String> = emptyMap()
    ): MatchDto

    @POST("api/tournaments/{tournamentId}/matches/{matchId}/result")
    suspend fun reportResult(
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: ReportResultRequestDto
    ): MatchDto

    @POST("api/tournaments/{tournamentId}/matches/{matchId}/result-detailed")
    suspend fun reportDetailedResult(
        @Path("tournamentId") tournamentId: String,
        @Path("matchId") matchId: String,
        @Body body: DetailedReportResultRequestDto
    ): MatchDto
}
