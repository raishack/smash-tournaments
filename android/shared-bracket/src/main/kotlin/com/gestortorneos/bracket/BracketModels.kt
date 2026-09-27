package com.gestortorneos.bracket

data class MatchCharacterSelectionSummary(
    val participantId: String,
    val characterName: String
)

data class MatchGameCharacterSelectionsSummary(
    val gameNum: Int,
    val selections: List<MatchCharacterSelectionSummary>
)

data class MatchSummary(
    val operationRevision: String? = null,
    val tournamentId: String = "",
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
    val participantsLabel: String = "",
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
