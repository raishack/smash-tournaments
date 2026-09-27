package com.gestortorneos.app.ui

data class TournamentSummary(
    val id: String,
    val title: String,
    val game: String,
    val status: String,
    val participants: Int,
    val format: String,
    val nextAction: String
)

data class TournamentDetail(
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
    val status: String,
    val platform: String,
    val maxParticipants: Int,
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
    val playerMatchReportingEnabled: Boolean,
    val supportsSmashCharacterReporting: Boolean,
    val participants: List<TournamentParticipantSummary>,
    val matches: List<MatchSummary>,
    val ladder: LadderSummary? = null,
)

data class LadderSummary(
    val options: com.gestortorneos.ui.LadderOptions? = null,
    val status: String,
    val queue: List<LadderQueueSummary>,
    val activeMatches: List<LadderMatchSummary>,
    val completedMatches: List<LadderMatchSummary>,
    val standings: List<LadderStandingSummary>
)

data class LadderQueueSummary(
    val participantId: String,
    val displayName: String,
    val queuedAt: String
)

data class LadderMatchSummary(
    val id: String,
    val status: String,
    val bestOf: Int,
    val participants: List<TournamentParticipantSummary>,
    val scores: List<Int>,
    val winnerParticipantId: String? = null,
    val readyDeadlineAt: String? = null,
    val participantOneReadyAt: String? = null,
    val participantTwoReadyAt: String? = null,
    val startedAt: String? = null,
    val completedAt: String? = null,
    val characterSelections: List<MatchCharacterSelectionSummary> = emptyList(),
    val gameResults: List<String> = emptyList(),
    val gameCharacterSelections: List<MatchGameCharacterSelectionsSummary> = emptyList(),
)

data class LadderStandingSummary(
    val participantId: String,
    val displayName: String,
    val matchesPlayed: Int,
    val wins: Int,
    val losses: Int,
    val gamesWon: Int,
    val gamesLost: Int,
    val gameDifferential: Int
)

data class MatchCharacterSelectionSummary(
    val participantId: String,
    val characterName: String
)

data class MatchGameCharacterSelectionsSummary(
    val gameNum: Int,
    val selections: List<MatchCharacterSelectionSummary>
)

data class TournamentParticipantSummary(
    val id: String,
    val displayName: String,
    val seedLabel: String,
    val seed: Int?,
    val status: String
)

data class MatchSummary(
    val operationRevision: String? = null,
    val tournamentId: String = "",
    val syncStatus: com.gestortorneos.app.data.remote.MatchSyncStatus? = null,
    val displayIdentifier: String? = null,
    val startggStreamLabel: String? = null,
    val entrantSize: Int = 1,
    val gameTitle: String = "",
    val bracketMode: String = "STANDARD",
    val id: String,
    val bracketStage: String,
    val roundNumber: Int,
    val matchNumber: Int,
    val label: String,
    val status: String,
    val participantsLabel: String,
    val participantNames: List<String>,
    val participantIds: List<String>,
    val participantScores: List<Int>,
    val advancersRequired: Int,
    val advancingParticipantIds: List<String>,
    val winnerParticipantId: String? = null,
    val winnerName: String? = null,
    val bestOf: Int,
    val reportedBestOf: Int? = null,
    val characterSelections: List<MatchCharacterSelectionSummary> = emptyList(),
    val gameResults: List<String> = emptyList(),
    val gameCharacterSelections: List<MatchGameCharacterSelectionsSummary> = emptyList(),
    val calledAt: String? = null,
    val startedAt: String? = null,
    val stationLabel: String? = null,
    val calledElapsed: String? = null,
    val phaseId: String? = null,
    val phaseName: String? = null,
    val phaseOrder: Int? = null,
    val phaseGroupId: String? = null,
    val phaseGroupName: String? = null,
    val phaseType: String? = null,
    val isPoolPhase: Boolean = false,
    val fullRoundText: String? = null
) {
    val effectiveBestOf: Int
        get() = reportedBestOf ?: bestOf

    val isPoolMatch: Boolean
        get() = isPoolPhase || bracketStage == "POOLS"

    val isRoundRobinPhase: Boolean
        get() = phaseType.equals("ROUND_ROBIN", ignoreCase = true)

    val phaseKey: String
        get() = phaseId?.trim()?.takeIf { it.isNotEmpty() }
            ?: phaseName?.trim()?.takeIf { it.isNotEmpty() }
            ?: bracketStage

    val phaseDisplayLabel: String
        get() = phaseName?.trim()?.takeIf { it.isNotEmpty() } ?: bracketStage

    val poolLabel: String?
        get() = if (isPoolMatch) {
            phaseGroupName?.trim()?.takeIf { it.isNotEmpty() }
                ?: phaseDisplayLabel.takeIf { it.isNotEmpty() }
        } else {
            null
        }

    val phaseScopedPoolKey: String?
        get() = if (isPoolMatch) {
            phaseGroupId?.trim()?.takeIf { it.isNotEmpty() }?.let { "$phaseKey::$it" }
                ?: poolLabel?.let { "$phaseKey::$it" }
        } else {
            null
        }

    val roundDisplayTitle: String
        get() = fullRoundText?.trim()?.takeIf { it.isNotEmpty() } ?: label

    val poolAwareLabel: String
        get() = poolLabel?.let { "$it - $label" } ?: label
}

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
    val format: String,
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
    val playAreaName: String? = null,
    val playerMatchReportingEnabled: Boolean = true,
)

data class AddParticipantInput(
    val displayName: String,
    val seed: Int?
)

val sampleFeaturedTournaments = listOf(
    TournamentSummary(
        id = "tor_1",
        title = "Liga Primavera FC 26",
        game = "EA Sports FC 26",
        status = "En curso",
        participants = 32,
        format = "Doble eliminacion",
        nextAction = "3 partidas llamadas"
    ),
    TournamentSummary(
        id = "tor_2",
        title = "Open Tekken 8 Madrid",
        game = "Tekken 8",
        status = "Listo",
        participants = 16,
        format = "Eliminacion simple",
        nextAction = "Generar bracket"
    )
)

val sampleMatches = listOf(
    MatchSummary(
        id = "m1",
        bracketStage = "WINNERS",
        roundNumber = 1,
        matchNumber = 3,
        label = "Ronda 1 - Match 3",
        status = "Llamado",
        participantsLabel = "Neko vs Blitz",
        participantNames = listOf("Neko", "Blitz"),
        participantIds = listOf("p1", "p2"),
        participantScores = listOf(1, 0),
        advancersRequired = 1,
        advancingParticipantIds = listOf("p1"),
        bestOf = 3,
        calledAt = null,
        startedAt = null,
        stationLabel = null,
        calledElapsed = "08:14"
    ),
    MatchSummary(
        id = "m2",
        bracketStage = "WINNERS",
        roundNumber = 1,
        matchNumber = 4,
        label = "Ronda 1 - Match 4",
        status = "Pendiente",
        participantsLabel = "Vortex vs Kairo",
        participantNames = listOf("Vortex", "Kairo"),
        participantIds = listOf("p3", "p4"),
        participantScores = listOf(0, 0),
        advancersRequired = 1,
        advancingParticipantIds = emptyList(),
        bestOf = 3,
        calledAt = null,
        startedAt = null,
        stationLabel = null
    ),
    MatchSummary(
        id = "m3",
        bracketStage = "WINNERS",
        roundNumber = 2,
        matchNumber = 1,
        label = "Winners Semifinal",
        status = "En juego",
        participantsLabel = "TBD vs TBD",
        participantNames = listOf("TBD", "TBD"),
        participantIds = listOf("winner_a", "winner_b"),
        participantScores = listOf(1, 1),
        advancersRequired = 1,
        advancingParticipantIds = emptyList(),
        bestOf = 3,
        calledAt = null,
        startedAt = null,
        stationLabel = null,
        calledElapsed = "02:55"
    )
)
