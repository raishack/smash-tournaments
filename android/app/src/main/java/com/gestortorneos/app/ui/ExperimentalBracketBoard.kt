package com.gestortorneos.app.ui

import androidx.compose.runtime.Composable

@Composable
fun ExperimentalBracketBoard(
    matches: List<MatchSummary>,
    hideAutomaticAdvances: Boolean = false,
    callTimeoutMinutes: Int = 10,
    selectableMatchIds: Set<String> = emptySet(),
    onMatchSelected: ((String) -> Unit)? = null,
    errorMessage: String? = null,
    onFullscreenChanged: (Boolean) -> Unit = {},
) {
    com.gestortorneos.bracket.ModernBracketBoard(
        matches = matches.map { it.toModernBracketMatch() },
        hideAutomaticAdvances = hideAutomaticAdvances,
        callTimeoutMinutes = callTimeoutMinutes,
        selectableMatchIds = selectableMatchIds,
        onMatchSelected = onMatchSelected,
        errorMessage = errorMessage,
        onFullscreenChanged = onFullscreenChanged,
        characterAssetUrl = ::smashCharacterAssetUrl,
    )
}

private fun MatchSummary.toModernBracketMatch() = com.gestortorneos.bracket.MatchSummary(
    operationRevision = operationRevision,
    tournamentId = tournamentId,
    displayIdentifier = displayIdentifier,
    startggStreamLabel = startggStreamLabel,
    entrantSize = entrantSize,
    gameTitle = gameTitle,
    bracketMode = bracketMode,
    id = id,
    bracketStage = bracketStage,
    roundNumber = roundNumber,
    matchNumber = matchNumber,
    label = label,
    status = status,
    participantsLabel = participantsLabel,
    participantNames = participantNames,
    participantIds = participantIds,
    participantScores = participantScores,
    advancersRequired = advancersRequired,
    advancingParticipantIds = advancingParticipantIds,
    winnerParticipantId = winnerParticipantId,
    winnerName = winnerName,
    bestOf = bestOf,
    reportedBestOf = reportedBestOf,
    characterSelections = characterSelections.map { com.gestortorneos.bracket.MatchCharacterSelectionSummary(it.participantId, it.characterName) },
    gameResults = gameResults,
    gameCharacterSelections = gameCharacterSelections.map { game -> com.gestortorneos.bracket.MatchGameCharacterSelectionsSummary(game.gameNum, game.selections.map { com.gestortorneos.bracket.MatchCharacterSelectionSummary(it.participantId, it.characterName) }) },
    calledAt = calledAt,
    startedAt = startedAt,
    stationLabel = stationLabel,
    calledElapsed = calledElapsed,
    phaseId = phaseId,
    phaseName = phaseName,
    phaseOrder = phaseOrder,
    phaseGroupId = phaseGroupId,
    phaseGroupName = phaseGroupName,
    phaseType = phaseType,
    isPoolPhase = isPoolPhase,
    fullRoundText = fullRoundText,
)
