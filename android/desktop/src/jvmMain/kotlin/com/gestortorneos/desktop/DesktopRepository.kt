package com.gestortorneos.desktop

import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.HttpException
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import java.time.Instant
import java.time.temporal.ChronoUnit

internal object DesktopConfig {
    const val desktopApplicationId: String = "com.example.tournamentmanager.desktop"
    const val desktopVersion: String = "0.1.12"
    val baseUrl: String = System.getenv("GT_BACKEND_URL")
        ?: "https://your-domain.example/"
    val displayWebUrl: String = System.getenv("GT_DISPLAY_WEB_URL")
        ?: "https://your-domain.example/"
    val appClientKey: String = System.getenv("GT_APP_CLIENT_KEY")
        ?: "replace_with_your_app_client_key"
    val adminDeleteKey: String = ""
}

data class DesktopTournamentSummary(
    val id: String,
    val title: String,
    val game: String,
    val status: String,
    val format: String,
    val maxParticipants: Int,
    val registeredParticipants: Int
)

data class DesktopTournamentDetail(
    val fortniteLobbySize: Int = 20,
    val fortniteGamesPerRound: Int = 3,
    val teamSize: Int = 1,
    val reserveCount: Int = 0,
    val allowSoloRegistration: Boolean = false,
    val displayEnabled: Boolean = true,
    val registrationEnabled: Boolean = false,
    val registrationUrl: String? = null,
    val importProgress: String? = null,
    val id: String,
    val title: String,
    val game: String,
    val description: String,
    val platform: String,
    val status: String,
    val format: String,
    val rawFormat: String,
    val bracketMode: String,
    val mkartAdvanceCount: Int,
    val mkartLosersAdvanceCount: Int,
    val bestOf: Int,
    val winnersBestOf: Int,
    val losersBestOf: Int,
    val seedingMethod: String,
    val callTimeoutMinutes: Int,
    val setupCount: Int,
    val streamCount: Int = 0,
    val playAreaName: String?,
    val isStartggMirrored: Boolean,
    val startggEventUrl: String?,
    val supportsSmashCharacterReporting: Boolean,
    val maxParticipants: Int,
    val registeredParticipants: Int,
    val participants: List<DesktopParticipantSummary>,
    val matches: List<DesktopMatchSummary>,
    val ladder: DesktopLadderSummary? = null
)

data class DesktopLadderSummary(
    val session: DesktopLadderSessionSummary? = null,
    val queue: List<DesktopLadderQueueSummary> = emptyList(),
    val activeMatches: List<DesktopLadderMatchSummary> = emptyList(),
    val completedMatches: List<DesktopLadderMatchSummary> = emptyList(),
    val standings: List<DesktopLadderStandingSummary> = emptyList()
)

data class DesktopLadderSessionSummary(
    val options: com.gestortorneos.ui.LadderOptions? = null,
    val id: String,
    val tournamentId: String,
    val status: String,
    val createdAt: String,
    val startedAt: String,
    val completedAt: String? = null
)

data class DesktopLadderQueueSummary(
    val id: String,
    val participantId: String,
    val displayName: String,
    val queuedAt: String
)

data class DesktopLadderMatchSummary(
    val id: String,
    val status: String,
    val bestOf: Int,
    val participants: List<DesktopMatchParticipant>,
    val participantsLabel: String,
    val winnerParticipantId: String? = null,
    val winnerName: String? = null,
    val startedAt: String? = null,
    val completedAt: String? = null
) {
    val label: String
        get() = "Ladder Match"
}

data class DesktopLadderStandingSummary(
    val participantId: String,
    val displayName: String,
    val matchesPlayed: Int,
    val wins: Int,
    val losses: Int,
    val gamesWon: Int,
    val gamesLost: Int,
    val gameDifferential: Int
)

data class DesktopStartggPreview(
    val eventName: String,
    val formatLabel: String,
    val gameTitle: String,
    val entrantCount: Int,
    val participants: List<DesktopParticipantSummary>
)

data class DesktopParticipantSummary(
    val id: String,
    val displayName: String,
    val seed: Int?,
    val seedLabel: String,
    val status: String
)

data class DesktopAdminNotificationSettings(
    val telegramEnabled: Boolean,
    val whatsappEnabled: Boolean
)

data class DesktopAppUpdateInfo(
    val applicationId: String,
    val currentVersion: String,
    val targetVersion: String,
    val msiUrl: String,
    val required: Boolean,
    val title: String?,
    val notes: String?,
    val changelog: List<String>,
    val sha256: String? = null,
    val sizeBytes: Long? = null,
)

data class DesktopMatchSummary(
    val operationRevision: String? = null,
    val tournamentId: String = "",
    val syncStatus: MatchSyncStatus? = null,
    val fullRoundText: String? = null,
    val displayIdentifier: String? = null,
    val startggStreamLabel: String? = null,
    val entrantSize: Int = 1,
    val gameTitle: String = "",
    val id: String,
    val label: String,
    val status: String,
    val bestOf: Int,
    val reportedBestOf: Int? = null,
    val bracketMode: String,
    val bracketStage: String,
    val roundNumber: Int,
    val matchNumber: Int,
    val advancersRequired: Int,
    val participantIds: List<String>,
    val participantNames: List<String>,
    val participantsLabel: String,
    val participants: List<DesktopMatchParticipant>,
    val scores: List<Int>,
    val characterSelections: List<DesktopMatchCharacterSelection> = emptyList(),
    val gameResults: List<String> = emptyList(),
    val gameCharacterSelections: List<DesktopMatchGameCharacterSelections> = emptyList(),
    val winnerParticipantId: String?,
    val winnerName: String?,
    val stationLabel: String?,
    val calledAt: String?,
    val startedAt: String?,
    val advancingParticipantIds: List<String>,
    val phaseName: String? = null,
    val phaseGroupName: String? = null
) {
    val effectiveBestOf: Int
        get() = reportedBestOf ?: bestOf

    val poolLabel: String?
        get() = phaseGroupName?.trim()?.takeIf { it.isNotEmpty() }
            ?: phaseName?.trim()?.takeIf { it.isNotEmpty() }

    val poolAwareLabel: String
        get() = poolLabel?.let { "$it · $label" } ?: label
}

data class DesktopMatchCharacterSelection(
    val participantId: String,
    val characterName: String
)

data class DesktopMatchGameCharacterSelections(
    val gameNum: Int,
    val selections: List<DesktopMatchCharacterSelection> = emptyList()
)

data class DesktopMatchParticipant(
    val id: String,
    val name: String
)

data class CreateTournamentInput(
    val fortniteLobbySize: Int? = null,
    val fortniteGamesPerRound: Int? = null,
    val teamSize: Int? = null,
    val reserveCount: Int? = null,
    val allowSoloRegistration: Boolean? = null,
    val title: String,
    val gameTitle: String,
    val description: String,
    val platform: String,
    val maxParticipants: Int,
    val format: String = "SINGLE_ELIMINATION",
    val bracketMode: String = "STANDARD",
    val mkartAdvanceCount: Int = 1,
    val mkartLosersAdvanceCount: Int = 1,
    val bestOf: Int = 3,
    val winnersBestOf: Int = 3,
    val losersBestOf: Int = 3,
    val seedingMethod: String = "MANUAL",
    val callTimeoutMinutes: Int = 10,
    val setupCount: Int = 1,
    val streamCount: Int = 0,
    val playAreaName: String? = null
)

data class DesktopDetailedReportedGame(
        val expectedRevision: String? = null,
    val winnerParticipantId: String,
    val selections: List<Pair<String, String>> = emptyList()
)

private data class TournamentListItemDto(
    val registeredParticipants: Int? = null,
    val id: String = "",
    val title: String = "",
    val gameTitle: String = "",
    val description: String = "",
    val platform: String = "",
    val status: String = "",
    val maxParticipants: Int = 0,
    val settings: TournamentSettingsDto = TournamentSettingsDto(),
    val importSource: TournamentImportSourceDto? = null
)

private data class TournamentImportSourceDto(
    val provider: String = "",
    val eventUrl: String? = null,
    val entrantSize: Int? = null,
    val hasPools: Boolean? = null
)

private data class StartggImportJobDto(val state: String = "", val eventUrl: String = "", val error: String? = null, val progress: ImportProgressDto? = null)

private data class TournamentSettingsDto(
    val fortniteLobbySize: Int? = null,
    val fortniteGamesPerRound: Int? = null,
    val teamSize: Int? = null,
    val reserveCount: Int? = null,
    val allowSoloRegistration: Boolean? = null,
    val displayEnabled: Boolean? = null,
    val registrationEnabled: Boolean? = null,
    val registrationUrl: String? = null,
    val importJob: StartggImportJobDto? = null,
    val format: String = "SINGLE_ELIMINATION",
    val bracketMode: String? = null,
    val mkartAdvanceCount: Int? = null,
    val mkartLosersAdvanceCount: Int? = null,
    val setupCount: Int? = null,
    val streamCount: Int? = null,
    val playAreaName: String? = null,
    val bestOf: Int = 1,
    val winnersBestOf: Int? = null,
    val losersBestOf: Int? = null,
    val hasThirdPlaceMatch: Boolean = false,
    val checkInRequired: Boolean = true,
    val allowRematchReview: Boolean = true,
    val seedingMethod: String = "MANUAL",
    val autoCallMatches: Boolean = false,
    val callTimeoutMinutes: Int = 10,
    val autoDisqualifyAfterMinutes: Int? = 15,
    val manualSeedingLocked: Boolean = false
)

private data class TournamentParticipantDto(
    val id: String = "",
    val displayName: String = "",
    val seed: Int? = null,
    val checkedIn: Boolean = false,
    val status: String = ""
)

private data class MatchParticipantDto(
    val participantId: String = "",
    val displayName: String = "",
    val slot: Int = 0,
    val score: Int = 0
)

private data class MatchCallDto(
    val calledAt: String = "",
    val calledByUserId: String = "",
    val stationLabel: String? = null,
    val startedAt: String? = null,
    val startedByUserId: String? = null
)

private data class MatchDto(
    val operationRevision: String? = null,
    val syncStatus: MatchSyncStatus? = null,
    val displayLabel: String? = null,
    val displayIdentifier: String? = null,
    val startggStreamLabel: String? = null,
    val roundLabel: String? = null,
    val id: String = "",
    val bracketStage: String = "",
    val roundNumber: Int = 0,
    val matchNumber: Int = 0,
    val status: String = "",
    val bestOf: Int = 1,
    val reportedBestOf: Int? = null,
    val advancersRequired: Int = 1,
    val participants: List<MatchParticipantDto> = emptyList(),
    val characterSelections: List<MatchCharacterSelectionDto>? = null,
    val gameResults: List<String>? = null,
    val gameCharacterSelections: List<MatchGameCharacterSelectionsDto>? = null,
    val advancingParticipantIds: List<String>? = null,
    val winnerParticipantId: String? = null,
    val call: MatchCallDto? = null,
    val externalRef: MatchExternalRefDto? = null
)

private data class MatchExternalRefDto(
    val phaseName: String? = null,
    val phaseGroupName: String? = null,
    val phaseType: String? = null
)

private data class MatchCharacterSelectionDto(
    val participantId: String = "",
    val characterId: Int = 0,
    val characterName: String = ""
)

private data class MatchGameCharacterSelectionsDto(
    val gameNum: Int = 0,
    val selections: List<MatchCharacterSelectionDto> = emptyList()
)

private data class LadderSessionDto(
    val options: com.gestortorneos.ui.LadderOptions? = null,
    val id: String = "",
    val tournamentId: String = "",
    val status: String = "",
    val createdAt: String = "",
    val startedAt: String = "",
    val completedAt: String? = null
)

private data class LadderQueueEntryDto(
    val id: String = "",
    val participantId: String = "",
    val displayName: String = "",
    val queuedAt: String = ""
)

private data class LadderMatchDto(
    val id: String = "",
    val status: String = "",
    val bestOf: Int = 1,
    val participants: List<MatchParticipantDto> = emptyList(),
    val winnerParticipantId: String? = null,
    val startedAt: String? = null,
    val completedAt: String? = null
)

private data class LadderStandingDto(
    val participantId: String = "",
    val displayName: String = "",
    val matchesPlayed: Int = 0,
    val wins: Int = 0,
    val losses: Int = 0,
    val gamesWon: Int = 0,
    val gamesLost: Int = 0,
    val gameDifferential: Int = 0
)

private data class LadderOverviewDto(
    val session: LadderSessionDto? = null,
    val queue: List<LadderQueueEntryDto> = emptyList(),
    val activeMatches: List<LadderMatchDto> = emptyList(),
    val completedMatches: List<LadderMatchDto> = emptyList(),
    val standings: List<LadderStandingDto> = emptyList()
)

private data class TournamentDetailDto(
    val tournament: TournamentListItemDto = TournamentListItemDto(),
    val participants: List<TournamentParticipantDto> = emptyList(),
    val matches: List<MatchDto> = emptyList(),
    val ladder: LadderOverviewDto? = null
)

private data class StartggImportPreviewRequestDto(
    val eventUrl: String
)

private data class StartggImportRequestDto(
    val eventUrl: String,
    val syncResults: Boolean = true,
    val preserveTournamentTitle: Boolean = false
)

private data class StartggPreviewParticipantDto(
    val displayName: String = "",
    val seed: Int = 0
)

private data class StartggImportPreviewDto(
    val eventName: String = "",
    val gameTitle: String = "",
    val entrantCount: Int = 0,
    val entrantSize: Int = 1,
    val hasPools: Boolean = false,
    val format: String = "SINGLE_ELIMINATION",
    val bestOf: Int = 3,
    val winnersBestOf: Int = 3,
    val losersBestOf: Int = 3,
    val participants: List<StartggPreviewParticipantDto> = emptyList()
)

private data class CreateTournamentRequestDto(
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

private data class UpdateTournamentRequestDto(
    val title: String,
    val gameTitle: String,
    val description: String,
    val platform: String,
    val maxParticipants: Int,
    val settings: TournamentSettingsDto
)

private data class CreateParticipantRequestDto(
    val displayName: String,
    val seed: Int?
)

internal data class UpdateParticipantRequestDto(
    val displayName: String,
    val seed: Int?,
    val clearSeed: Boolean = seed == null,
    val checkedIn: Boolean? = null,
    val status: String? = null
)

private data class CallMatchRequestDto(
    val calledByUserId: String,
    val stationLabel: String?
)

private data class StartMatchRequestDto(
    val startedByUserId: String
)

private data class RecordGameWinRequestDto(
    val participantId: String
)

private data class UpdateMatchCharactersRequestDto(
    val selections: List<UpdateMatchCharacterSelectionDto>
)

private data class UpdateMatchCharacterSelectionDto(
    val participantId: String,
    val characterName: String
)

private data class SelectMarioKartAdvancerRequestDto(
    val participantId: String
)

private data class ResolveAbsenceRequestDto(
    val outcome: String
)

private data class MatchScoreDto(
    val participantId: String,
    val score: Int
)

private data class ReportResultRequestDto(
    val winnerParticipantId: String,
    val scores: List<MatchScoreDto>
)

private data class DetailedReportGameSelectionDto(
    val participantId: String,
    val characterName: String
)

private data class DetailedReportGameDto(
    val winnerParticipantId: String,
    val selections: List<DetailedReportGameSelectionDto>? = null
)

private data class DetailedReportResultRequestDto(
    val expectedRevision: String? = null,
    val bestOfOverride: Int? = null,
    val games: List<DetailedReportGameDto>
)

private data class NotificationSettingsDto(
    val telegramEnabled: Boolean = true,
    val whatsappEnabled: Boolean = true
)

private data class UpdateNotificationSettingsRequestDto(
    val telegramEnabled: Boolean,
    val whatsappEnabled: Boolean
)

private data class WindowsAppUpdateDto(
    val applicationId: String = "",
    val version: String = "",
    val msiUrl: String = "",
    val required: Boolean = false,
    val minSupportedVersion: String? = null,
    val title: String? = null,
    val notes: String? = null,
    val changelog: List<String>? = null,
    val publishedAt: String? = null,
    val sha256: String? = null,
    val sizeBytes: Long? = null,
)

private data class LadderActionRequestDto(
    val startedByUserId: String? = null,
    val completedByUserId: String? = null
)

private interface DesktopTournamentApi {
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
    suspend fun teamRoster(@Path("tournamentId") tournamentId: String): TeamRoster

    @POST("api/tournaments/{tournamentId}/team-roster")
    suspend fun teamAction(@Path("tournamentId") tournamentId: String, @Body body: Map<String, @JvmSuppressWildcards Any?>): TeamRoster

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

    @POST("api/tournaments/{tournamentId}/update")
    suspend fun updateTournament(
        @Path("tournamentId") tournamentId: String,
        @Body body: UpdateTournamentRequestDto
    ): TournamentListItemDto

    @POST("api/tournaments/{tournamentId}/delete")
    suspend fun deleteTournament(
        @Path("tournamentId") tournamentId: String,
        @Header("X-Admin-Key") adminKey: String,
        @Body body: Map<String, String> = emptyMap()
    )

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
    )

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

    @GET("api/app-updates/windows/{applicationId}")
    suspend fun getWindowsAppUpdate(
        @Path("applicationId") applicationId: String,
    ): WindowsAppUpdateDto
}

class DesktopTournamentRepository {
    suspend fun updateAttendance(tournamentId: String, participant: com.gestortorneos.ui.TournamentReviewParticipant, checkedIn: Boolean) {
        api.updateAttendance(tournamentId, participant.id, mapOf("checkedIn" to checkedIn))
    }
    suspend fun getReview(tournamentId: String) = api.getReview(tournamentId)
    suspend fun getActivity(tournamentId: String) = api.getActivity(tournamentId)
    suspend fun retrySync(tournamentId: String, matchId: String) = api.retrySync(tournamentId, matchId)

    val defaultAdminKey: String = DesktopConfig.adminDeleteKey

    private val api: DesktopTournamentApi = Retrofit.Builder()
        .baseUrl(DesktopConfig.baseUrl)
        .client(
            OkHttpClient.Builder()
                .addInterceptor(com.gestortorneos.ui.ManagementSession.interceptor)
                .addInterceptor(OperationNetwork.interceptor("Windows", DesktopConfig.desktopVersion))
                .addInterceptor { chain ->
                    val request = chain.request().newBuilder()
                        .header("X-App-Key", DesktopConfig.appClientKey)
                        .apply { if (chain.request().url.encodedPath.contains("/ladder/")) header("X-Admin-Key", DesktopConfig.adminDeleteKey) }
                        .build()
                    chain.proceed(request)
                }
                .build()
        )
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(DesktopTournamentApi::class.java)

    suspend fun getTournaments(): List<DesktopTournamentSummary> {
        return api.getTournaments().map { tournament ->
            val participantCount = tournament.registeredParticipants
                ?: runCatching { api.getTournament(tournament.id).participants.size }.getOrDefault(0)
            DesktopTournamentSummary(
                id = tournament.id,
                title = tournament.title,
                game = tournament.gameTitle,
                status = com.gestortorneos.ui.tournamentClientStatus(tournament.status, tournament.settings.importJob?.state),
                format = tournament.settings.toFormatLabel(),
                maxParticipants = tournament.maxParticipants,
                registeredParticipants = participantCount
            )
        }
    }

    suspend fun getTournament(tournamentId: String): DesktopTournamentDetail {
        val request = OperationNetwork.beginRead()
        val dto = api.getTournament(tournamentId)
        dto.matches.forEach { OperationNetwork.remember(it.id, it.operationRevision, request) }
        return dto.toModel()
    }

    suspend fun getAvailableDesktopUpdate(): DesktopAppUpdateInfo? {
        val remote = try {
            api.getWindowsAppUpdate(DesktopConfig.desktopApplicationId)
        } catch (error: HttpException) {
            if (error.code() == 404) {
                return null
            }
            throw IllegalStateException(error.toBackendMessage())
        }

        require(remote.applicationId == DesktopConfig.desktopApplicationId) { "La actualización no corresponde a Smash Tournaments." }
        if (compareVersionStrings(remote.version, DesktopConfig.desktopVersion) <= 0) {
            return null
        }

        return DesktopAppUpdateInfo(
            sha256 = remote.sha256,
            sizeBytes = remote.sizeBytes,
            applicationId = remote.applicationId,
            currentVersion = DesktopConfig.desktopVersion,
            targetVersion = remote.version,
            msiUrl = remote.msiUrl,
            required = remote.required || (
                remote.minSupportedVersion?.let {
                    compareVersionStrings(DesktopConfig.desktopVersion, it) < 0
                } == true
            ),
            title = remote.title,
            notes = remote.notes,
            changelog = remote.changelog.orEmpty(),
        )
    }

    suspend fun validateAdminDeleteKey(adminKey: String) {
        try {
            api.validateAdminDeleteKey(adminKey.trim())
        } catch (error: HttpException) {
            throw IllegalStateException(error.toBackendMessage())
        }
    }

    suspend fun getAdminNotificationSettings(adminKey: String): DesktopAdminNotificationSettings {
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
    ): DesktopAdminNotificationSettings {
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

    suspend fun previewStartggImport(eventUrl: String): DesktopStartggPreview {
        val preview = try {
            api.previewStartggImport(StartggImportPreviewRequestDto(eventUrl = eventUrl))
        } catch (error: HttpException) {
            throw IllegalStateException(error.toBackendMessage())
        }
        val formatLabel = when (preview.format) {
            "DOUBLE_ELIMINATION" -> "Doble eliminacion - W Bo${preview.winnersBestOf} / L Bo${preview.losersBestOf}"
            "GROUPS_PLAYOFF" -> "Pools + bracket - W Bo${preview.winnersBestOf} / L Bo${preview.losersBestOf}"
            "ROUND_ROBIN" -> "Pools - Bo${preview.bestOf}"
            else -> "Eliminacion simple - Bo${preview.bestOf}"
        }
        return DesktopStartggPreview(
            eventName = preview.eventName,
            formatLabel = formatLabel,
            gameTitle = preview.gameTitle,
            entrantCount = preview.entrantCount,
            participants = preview.participants.map {
                DesktopParticipantSummary(
                    id = it.displayName,
                    displayName = it.displayName,
                    seed = it.seed,
                    seedLabel = "Seed ${it.seed}",
                    status = "IMPORTADO"
                )
            }
        )
    }

    suspend fun createTournament(input: CreateTournamentInput): DesktopTournamentSummary {
        val startsAt = Instant.now().plus(1, ChronoUnit.DAYS).toString()
        val created = api.createTournament(
            CreateTournamentRequestDto(
                ownerId = "desktop_admin",
                title = input.title,
                gameTitle = input.gameTitle,
                description = input.description,
                platform = input.platform,
                startsAt = startsAt,
                maxParticipants = input.maxParticipants,
                isPublic = true,
                settings = input.toSettingsDto()
            )
        )
        return created.toSummary(registeredParticipants = 0)
    }

    suspend fun createStartggTournament(
        eventUrl: String,
        callTimeoutMinutes: Int,
        setupCount: Int,
        streamCount: Int
    ): DesktopTournamentSummary {
        return api.createStartggImport(mapOf(
            "eventUrl" to eventUrl, "setupCount" to setupCount, "streamCount" to streamCount,
            "callTimeoutMinutes" to callTimeoutMinutes
        )).toModel().toSummary()
    }

    suspend fun updateSetups(tournamentId: String, count: Int, streamCount: Int): DesktopTournamentDetail {
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

    suspend fun teamRoster(tournamentId: String): TeamRoster = api.teamRoster(tournamentId)
    suspend fun teamAction(tournamentId: String, body: Map<String, Any?>): TeamRoster {
        try { return api.teamAction(tournamentId, body) }
        catch (error: HttpException) { throw IllegalStateException(error.toBackendMessage()) }
    }

    suspend fun updatePublicOptions(tournamentId: String, adminKey: String, options: Map<String, Boolean>): DesktopTournamentDetail {
        try { api.updatePublicOptions(tournamentId, adminKey, options) }
        catch (error: HttpException) { throw IllegalStateException(error.toBackendMessage()) }
        return getTournament(tournamentId)
    }

    suspend fun updateTournament(
        tournamentId: String,
        input: CreateTournamentInput
    ): DesktopTournamentDetail {
        api.updateTournament(
            tournamentId = tournamentId,
            body = UpdateTournamentRequestDto(
                title = input.title,
                gameTitle = input.gameTitle,
                description = input.description,
                platform = input.platform,
                maxParticipants = input.maxParticipants,
                settings = input.toSettingsDto()
            )
        )
        return getTournament(tournamentId)
    }

    suspend fun deleteTournament(tournamentId: String, adminKey: String) {
        api.deleteTournament(tournamentId, adminKey)
    }

    suspend fun addParticipant(tournamentId: String, displayName: String): DesktopTournamentDetail {
        api.addParticipant(
            tournamentId = tournamentId,
            body = CreateParticipantRequestDto(displayName = displayName, seed = null)
        )
        return getTournament(tournamentId)
    }

    suspend fun importStartggEvent(
        tournamentId: String,
        eventUrl: String,
        syncResults: Boolean = true,
        preserveTournamentTitle: Boolean = false
    ): DesktopTournamentDetail {
        return try {
            api.importStartggEvent(
                tournamentId = tournamentId,
                body = StartggImportRequestDto(
                    eventUrl = eventUrl,
                    syncResults = syncResults,
                    preserveTournamentTitle = preserveTournamentTitle
                )
            ).toModel()
        } catch (error: HttpException) {
            throw IllegalStateException(error.toBackendMessage())
        }
    }

    suspend fun updateParticipant(
        tournamentId: String,
        participantId: String,
        displayName: String,
        seed: Int?
    ): DesktopTournamentDetail {
        api.updateParticipant(
            tournamentId = tournamentId,
            participantId = participantId,
            body = UpdateParticipantRequestDto(displayName = displayName, seed = seed)
        )
        return getTournament(tournamentId)
    }

    suspend fun deleteParticipant(tournamentId: String, participantId: String): DesktopTournamentDetail {
        api.deleteParticipant(tournamentId, participantId)
        return getTournament(tournamentId)
    }

    suspend fun resetTournament(tournamentId: String): DesktopTournamentDetail {
        api.resetTournament(tournamentId)
        return getTournament(tournamentId)
    }

    suspend fun setArchived(tournamentId: String, archived: Boolean): DesktopTournamentDetail {
        try { api.setArchived(tournamentId, mapOf("archived" to archived)) }
        catch (error: HttpException) { throw IllegalStateException(error.toBackendMessage()) }
        return getTournament(tournamentId)
    }

    suspend fun generateBracket(tournamentId: String): DesktopTournamentDetail {
        api.generateBracket(tournamentId)
        return getTournament(tournamentId)
    }

    suspend fun resetAndGenerateBracket(tournamentId: String): DesktopTournamentDetail {
        api.resetTournament(tournamentId)
        api.generateBracket(tournamentId)
        return getTournament(tournamentId)
    }

    suspend fun startTournament(tournamentId: String): DesktopTournamentDetail {
        api.startTournament(tournamentId)
        return getTournament(tournamentId)
    }

    suspend fun ladderBoard(id: String) = api.ladderBoard(id)
    suspend fun ladderControl(id: String, input: com.gestortorneos.ui.LadderControl) = api.ladderControl(id,input)
    suspend fun startLadder(tournamentId: String): DesktopTournamentDetail {
        api.startLadder(
            tournamentId = tournamentId,
            body = LadderActionRequestDto(startedByUserId = "desktop_admin")
        )
        return getTournament(tournamentId)
    }

    suspend fun finalizeLadder(tournamentId: String): DesktopTournamentDetail {
        api.finalizeLadder(
            tournamentId = tournamentId,
            body = LadderActionRequestDto(completedByUserId = "desktop_admin")
        )
        return getTournament(tournamentId)
    }

    suspend fun callMatch(tournamentId: String, matchId: String, stationLabel: String?): DesktopTournamentDetail {
        api.callMatch(
            tournamentId = tournamentId,
            matchId = matchId,
            body = CallMatchRequestDto(calledByUserId = "desktop_admin", stationLabel = stationLabel)
        )
        return getTournament(tournamentId)
    }

    suspend fun cancelCall(tournamentId: String, matchId: String): DesktopTournamentDetail {
        api.cancelCall(tournamentId, matchId)
        return getTournament(tournamentId)
    }

    suspend fun startMatch(tournamentId: String, matchId: String): DesktopTournamentDetail {
        api.startMatch(
            tournamentId = tournamentId,
            matchId = matchId,
            body = StartMatchRequestDto(startedByUserId = "desktop_admin")
        )
        return getTournament(tournamentId)
    }

    suspend fun updateMatchCharacters(
        tournamentId: String,
        matchId: String,
        selections: List<Pair<String, String>>
    ): DesktopTournamentDetail {
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

    suspend fun recordGameWin(tournamentId: String, matchId: String, participantId: String): DesktopTournamentDetail {
        api.recordGameWin(
            tournamentId = tournamentId,
            matchId = matchId,
            body = RecordGameWinRequestDto(participantId = participantId)
        )
        return getTournament(tournamentId)
    }

    suspend fun updateMatchCharactersAndRecordGameWin(
        tournamentId: String,
        matchId: String,
        participantId: String,
        selections: List<Pair<String, String>>
    ): DesktopTournamentDetail {
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
        return getTournament(tournamentId)
    }

    suspend fun selectMarioKartAdvancer(
        tournamentId: String,
        matchId: String,
        participantId: String
    ): DesktopTournamentDetail {
        api.selectMarioKartAdvancer(
            tournamentId = tournamentId,
            matchId = matchId,
            body = SelectMarioKartAdvancerRequestDto(participantId = participantId)
        )
        return getTournament(tournamentId)
    }

    suspend fun resolveAbsence(tournamentId: String, matchId: String, outcome: String): DesktopTournamentDetail {
        api.resolveAbsence(
            tournamentId = tournamentId,
            matchId = matchId,
            body = ResolveAbsenceRequestDto(outcome = outcome)
        )
        return getTournament(tournamentId)
    }

    suspend fun resetMatch(tournamentId: String, matchId: String): DesktopTournamentDetail {
        api.resetMatch(tournamentId, matchId)
        return getTournament(tournamentId)
    }

    suspend fun reportWinner(tournamentId: String, matchId: String, winnerParticipantId: String): DesktopTournamentDetail {
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
        return getTournament(tournamentId)
    }

    suspend fun updateMatchCharactersAndReportWinner(
        tournamentId: String,
        matchId: String,
        winnerParticipantId: String,
        selections: List<Pair<String, String>>
    ): DesktopTournamentDetail {
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
        return getTournament(tournamentId)
    }

    suspend fun reportDetailedResult(
        tournamentId: String,
        matchId: String,
        bestOfOverride: Int?,
        games: List<DesktopDetailedReportedGame>,
        onSaved: () -> Unit = {}
    ): DesktopTournamentDetail {
        api.reportDetailedResult(
            tournamentId = tournamentId,
            matchId = matchId,
            body = DetailedReportResultRequestDto(
                expectedRevision = games.firstOrNull()?.expectedRevision,
                bestOfOverride = bestOfOverride,
                games = games.map { game ->
                    DetailedReportGameDto(
                        winnerParticipantId = game.winnerParticipantId,
                        selections = game.selections.map { (participantId, characterName) ->
                            DetailedReportGameSelectionDto(
                                participantId = participantId,
                                characterName = characterName
                            )
                        }.ifEmpty { null }
                    )
                }
            )
        )
        onSaved()
        return getTournament(tournamentId)
    }
}

private fun CreateTournamentInput.toSettingsDto(): TournamentSettingsDto {
    return TournamentSettingsDto(
        teamSize = teamSize, reserveCount = reserveCount, allowSoloRegistration = allowSoloRegistration,
        fortniteLobbySize = fortniteLobbySize, fortniteGamesPerRound = fortniteGamesPerRound,
        format = format,
        bracketMode = bracketMode,
        mkartAdvanceCount = mkartAdvanceCount,
        mkartLosersAdvanceCount = mkartLosersAdvanceCount,
        bestOf = bestOf,
        winnersBestOf = winnersBestOf,
        losersBestOf = losersBestOf,
        seedingMethod = seedingMethod,
        callTimeoutMinutes = callTimeoutMinutes,
        setupCount = setupCount,
        streamCount = streamCount,
        playAreaName = playAreaName?.trim().orEmpty()
    )
}

private fun TournamentListItemDto.toSummary(registeredParticipants: Int): DesktopTournamentSummary {
    return DesktopTournamentSummary(
        id = id,
        title = title,
        game = gameTitle,
        status = com.gestortorneos.ui.tournamentClientStatus(status, settings.importJob?.state),
        format = settings.toFormatLabel(),
        maxParticipants = maxParticipants,
        registeredParticipants = registeredParticipants
    )
}

private fun TournamentDetailDto.toModel(): DesktopTournamentDetail {
    val isSupportedCharacterGame = tournament.gameTitle.contains("smash", ignoreCase = true)
        || tournament.gameTitle.contains("ultimate", ignoreCase = true) || Regex("rivals|roa", RegexOption.IGNORE_CASE).containsMatchIn(tournament.gameTitle)
        || tournament.gameTitle.contains("roa 2", ignoreCase = true)
        || tournament.gameTitle.contains("roa2", ignoreCase = true)
        || tournament.gameTitle.contains("roa ii", ignoreCase = true)
        || tournament.gameTitle.contains("rivals of aether 2", ignoreCase = true)
        || tournament.gameTitle.contains("rivals of aether ii", ignoreCase = true)
        || tournament.gameTitle.contains("rivals 2", ignoreCase = true)
        || tournament.gameTitle.contains("rivals ii", ignoreCase = true)
    val isMarioKart = (tournament.settings.bracketMode ?: "STANDARD").equals("MKART", ignoreCase = true)

    return DesktopTournamentDetail(
        importProgress = tournament.settings.importJob?.takeIf { it.state == "RUNNING" }?.progress?.label,
        id = tournament.id,
        title = tournament.title,
        game = tournament.gameTitle,
        description = tournament.settings.importJob?.error ?: tournament.description,
        platform = tournament.platform,
        status = com.gestortorneos.ui.tournamentClientStatus(tournament.status, tournament.settings.importJob?.state),
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
        supportsSmashCharacterReporting = isSupportedCharacterGame
            && tournament.importSource?.provider == "START_GG"
            && !isMarioKart,
        maxParticipants = tournament.maxParticipants,
        registeredParticipants = participants.size,
        participants = participants.map {
            DesktopParticipantSummary(
                id = it.id,
                displayName = it.displayName,
                seed = it.seed,
                seedLabel = it.seed?.let { seed -> "Seed $seed" } ?: "Sin seed",
                status = it.status.replace('_', ' ')
            )
        },
        matches = matches.map { match ->
            val playerNames = match.participants.map { it.displayName }
            val playerIds = match.participants.map { it.participantId }
            val mode = tournament.settings.bracketMode ?: "STANDARD"
            DesktopMatchSummary(
                operationRevision = match.operationRevision,
                tournamentId = tournament.id,
                syncStatus = match.syncStatus,
                entrantSize = tournament.importSource?.entrantSize ?: 1,
                gameTitle = tournament.gameTitle,
                id = match.id,
                label = match.displayLabel ?: match.bracketStage.toStageLabel(match.roundNumber, match.matchNumber),
                displayIdentifier = match.displayIdentifier,
                startggStreamLabel = match.startggStreamLabel,
                fullRoundText = match.roundLabel,
                status = match.status.replace('_', ' '),
                bestOf = match.bestOf,
                reportedBestOf = match.reportedBestOf,
                bracketMode = mode,
                bracketStage = match.bracketStage,
                roundNumber = match.roundNumber,
                matchNumber = match.matchNumber,
                advancersRequired = match.advancersRequired,
                participantIds = playerIds,
                participantNames = playerNames,
                participantsLabel = if (mode == "MKART") playerNames.joinToString(" / ") else playerNames.joinToString(" vs "),
                participants = match.participants.map { participant ->
                    DesktopMatchParticipant(
                        id = participant.participantId,
                        name = participant.displayName
                    )
                },
                scores = match.participants.map { it.score },
                characterSelections = (match.characterSelections ?: emptyList()).groupBy { it.participantId }.values.map { selections ->
                    val selection = selections.first().copy(characterName = selections.joinToString(" / ") { it.characterName })
                    DesktopMatchCharacterSelection(
                        participantId = selection.participantId,
                        characterName = selection.characterName
                    )
                },
                gameResults = match.gameResults ?: emptyList(),
                gameCharacterSelections = (match.gameCharacterSelections ?: emptyList()).map { game ->
                    DesktopMatchGameCharacterSelections(
                        gameNum = game.gameNum,
                        selections = game.selections.groupBy { it.participantId }.values.map { selections ->
                            val selection = selections.first().copy(characterName = selections.joinToString(" / ") { it.characterName })
                            DesktopMatchCharacterSelection(
                                participantId = selection.participantId,
                                characterName = selection.characterName
                            )
                        }
                    )
                },
                winnerParticipantId = match.winnerParticipantId,
                winnerName = match.participants.firstOrNull { it.participantId == match.winnerParticipantId }?.displayName,
                stationLabel = match.call?.stationLabel,
                calledAt = match.call?.calledAt,
                startedAt = match.call?.startedAt,
                advancingParticipantIds = match.advancingParticipantIds ?: emptyList(),
                phaseName = match.externalRef?.phaseName,
                phaseGroupName = match.externalRef?.phaseGroupName
            )
        },
        ladder = ladder?.toModel()
    )
}

private fun LadderOverviewDto.toModel(): DesktopLadderSummary {
    return DesktopLadderSummary(
        session = session?.let {
            DesktopLadderSessionSummary(
                options = it.options,
                id = it.id,
                tournamentId = it.tournamentId,
                status = it.status,
                createdAt = it.createdAt,
                startedAt = it.startedAt,
                completedAt = it.completedAt
            )
        },
        queue = queue.map {
            DesktopLadderQueueSummary(
                id = it.id,
                participantId = it.participantId,
                displayName = it.displayName,
                queuedAt = it.queuedAt
            )
        },
        activeMatches = activeMatches.map { it.toModel() },
        completedMatches = completedMatches.map { it.toModel() },
        standings = standings.map {
            DesktopLadderStandingSummary(
                participantId = it.participantId,
                displayName = it.displayName,
                matchesPlayed = it.matchesPlayed,
                wins = it.wins,
                losses = it.losses,
                gamesWon = it.gamesWon,
                gamesLost = it.gamesLost,
                gameDifferential = it.gameDifferential
            )
        }
    )
}

private fun LadderMatchDto.toModel(): DesktopLadderMatchSummary {
    val mappedParticipants = participants.map { participant ->
        DesktopMatchParticipant(
            id = participant.participantId,
            name = participant.displayName
        )
    }
    return DesktopLadderMatchSummary(
        id = id,
        status = status,
        bestOf = bestOf,
        participants = mappedParticipants,
        participantsLabel = mappedParticipants.joinToString(" vs ") { it.name },
        winnerParticipantId = winnerParticipantId,
        winnerName = mappedParticipants.firstOrNull { it.id == winnerParticipantId }?.name,
        startedAt = startedAt,
        completedAt = completedAt
    )
}

private fun DesktopTournamentDetail.toSummary(): DesktopTournamentSummary {
    return DesktopTournamentSummary(
        id = id,
        title = title,
        game = game,
        status = status,
        format = format,
        maxParticipants = maxParticipants,
        registeredParticipants = registeredParticipants
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

    val winners = winnersBestOf ?: bestOf
    val losers = losersBestOf ?: winners
    return if (format == "DOUBLE_ELIMINATION") {
        "Doble eliminacion - W Bo$winners / L Bo$losers"
    } else if (format == "GROUPS_PLAYOFF") {
        "Grupos + playoff - W Bo$winners / L Bo$losers"
    } else {
        "Eliminacion simple - Bo$winners"
    }
}

private fun String.toStageLabel(roundNumber: Int, matchNumber: Int): String {
    val stage = when (this) {
        "POOLS" -> "Pool"
        "WINNERS" -> "Winners"
        "LOSERS" -> "Losers"
        "FINALS" -> "Grand Final"
        else -> "Ronda"
    }
    return if (this == "FINALS") stage else "$stage R$roundNumber - Match $matchNumber"
}

private fun HttpException.toBackendMessage(): String {
    val fallback = "HTTP ${code()} ${message() ?: "error"}"
    val rawBody = response()?.errorBody()?.string().orEmpty()
    val marker = "\"message\":\""
    val start = rawBody.indexOf(marker)
    if (start == -1) return fallback
    val from = start + marker.length
    val end = rawBody.indexOf('"', from)
    if (end == -1) return fallback
    return rawBody.substring(from, end)
}

private fun compareVersionStrings(left: String, right: String): Int {
    val leftParts = left.split('.').map { it.toIntOrNull() ?: 0 }
    val rightParts = right.split('.').map { it.toIntOrNull() ?: 0 }
    val maxSize = maxOf(leftParts.size, rightParts.size)
    for (index in 0 until maxSize) {
        val leftValue = leftParts.getOrElse(index) { 0 }
        val rightValue = rightParts.getOrElse(index) { 0 }
        if (leftValue != rightValue) {
            return leftValue.compareTo(rightValue)
        }
    }
    return 0
}

private fun NotificationSettingsDto.toModel(): DesktopAdminNotificationSettings {
    return DesktopAdminNotificationSettings(
        telegramEnabled = telegramEnabled,
        whatsappEnabled = whatsappEnabled
    )
}
