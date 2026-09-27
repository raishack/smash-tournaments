package com.gestortorneos.player.ui

import com.gestortorneos.ui.MainPalette
import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.view.MotionEvent
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.gestortorneos.player.data.PlayerRepository
import com.gestortorneos.player.data.PlayerSession
import com.gestortorneos.player.data.remote.PlayerBracketMatchDto
import com.gestortorneos.player.data.remote.PlayerBracketMatchParticipantDto
import com.gestortorneos.player.data.remote.PlayerGameCharacterSelectionsDto
import com.gestortorneos.player.data.remote.PlayerMatchCharacterSelectionDto
import com.gestortorneos.player.data.remote.PlayerTournamentDto
import kotlinx.coroutines.launch

private enum class PlayerBracketRenderMode(val key: String, val label: String) {
    Classic("classic", "Classic"),
    Modern("modern", "Modern"),
}

private data class PlayerBracketMatchSummary(
    val displayIdentifier: String? = null,
    val startggStreamLabel: String? = null,
    val id: String,
    val bracketStage: String,
    val roundNumber: Int,
    val matchNumber: Int,
    val label: String,
    val status: String,
    val participantNames: List<String>,
    val participantIds: List<String>,
    val participantScores: List<Int>,
    val advancersRequired: Int,
    val advancingParticipantIds: List<String>,
    val winnerParticipantId: String? = null,
    val bestOf: Int,
    val reportedBestOf: Int? = null,
    val characterSelections: List<PlayerMatchCharacterSelectionDto> = emptyList(),
    val gameResults: List<String> = emptyList(),
    val gameCharacterSelections: List<PlayerGameCharacterSelectionsDto> = emptyList(),
    val calledAt: String? = null,
    val startedAt: String? = null,
    val stationLabel: String? = null,
    val phaseId: String? = null,
    val phaseName: String? = null,
    val phaseOrder: Int? = null,
    val phaseGroupId: String? = null,
    val phaseGroupName: String? = null,
    val phaseType: String? = null,
    val isPoolPhase: Boolean = false,
    val fullRoundText: String? = null,
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
}

private data class PlayerBracketSection(
    val id: String,
    val label: String,
    val clusters: List<PlayerBracketCluster>,
)

private data class PlayerBracketCluster(
    val id: String,
    val label: String,
    val rounds: List<PlayerBracketRound>,
)

private data class PlayerBracketRound(
    val title: String,
    val matches: List<PlayerBracketMatchSummary>,
)

private data class PlayerMatchPhaseBucket(
    val key: String,
    val order: Int,
    val label: String,
    val matches: List<PlayerBracketMatchSummary>,
)

private data class PlayerMatchPoolBucket(
    val key: String,
    val label: String,
    val matches: List<PlayerBracketMatchSummary>,
)

@Composable
internal fun BracketSection(
    tournaments: List<PlayerTournamentDto>,
    session: PlayerSession?,
    repository: PlayerRepository,
) {
    if (session == null) {
        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text("Sign in with start.gg to view your tournament brackets.")
        }
        return
    }

    val scope = rememberCoroutineScope()
    val expandedState = remember { mutableStateMapOf<String, Boolean>() }
    val loadingState = remember { mutableStateMapOf<String, Boolean>() }
    val errorState = remember { mutableStateMapOf<String, String>() }
    val loadedBracketTournaments = remember { mutableStateMapOf<String, PlayerTournamentDto>() }

    val tournamentsWithBracket = remember(tournaments) {
        tournaments.filter {
            !it.bracketMatches.isNullOrEmpty() ||
                it.activeMatches.isNotEmpty() ||
                it.pendingMatches.isNotEmpty() ||
                it.completedMatches.isNotEmpty()
        }
    }

    if (tournamentsWithBracket.isEmpty()) {
        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text("No brackets are currently available.")
        }
        return
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        items(tournamentsWithBracket, key = { it.tournamentId }) { tournament ->
            val expanded = expandedState[tournament.tournamentId] == true
            val isLoading = loadingState[tournament.tournamentId] == true
            val loadError = errorState[tournament.tournamentId]
            val bracketTournament = loadedBracketTournaments[tournament.tournamentId] ?: tournament
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                ),
                border = playerBracketSurfaceCardBorder(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(tournament.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("${tournament.gameTitle} · ${tournament.status}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Tournament bracket", fontWeight = FontWeight.SemiBold)
                        TextButton(
                            onClick = {
                                val nextExpanded = !expanded
                                expandedState[tournament.tournamentId] = nextExpanded
                                if (nextExpanded && loadedBracketTournaments[tournament.tournamentId] == null && !isLoading) {
                                    loadingState[tournament.tournamentId] = true
                                    errorState.remove(tournament.tournamentId)
                                    scope.launch {
                                        runCatching {
                                            repository.getMyTournament(session.sessionToken, tournament.tournamentId)
                                        }.onSuccess { detail ->
                                            loadedBracketTournaments[tournament.tournamentId] = detail
                                        }.onFailure { throwable ->
                                            errorState[tournament.tournamentId] = throwable.message ?: "Could not load the bracket"
                                        }
                                        loadingState[tournament.tournamentId] = false
                                    }
                                }
                            }
                        ) {
                            Text(if (expanded) "Hide" else "Show")
                        }
                    }
                    when {
                        !expanded -> Unit
                        isLoading -> {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                CircularProgressIndicator()
                            }
                        }
                        !loadError.isNullOrBlank() -> {
                            Text(loadError, color = MaterialTheme.colorScheme.error)
                        }
                        else -> {
                            PlayerTournamentBracketSection(
                                tournament = bracketTournament,
                                initiallyExpanded = true,
                                showHeader = false,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun PlayerTournamentBracketSection(
    tournament: PlayerTournamentDto,
    initiallyExpanded: Boolean = false,
    showHeader: Boolean = true,
) {
    val rawBracketMatches = tournament.bracketMatches.orEmpty()
    if (rawBracketMatches.isEmpty()) {
        Text(
            "The bracket is not available for this tournament yet.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    var showBracket by rememberSaveable(tournament.tournamentId, initiallyExpanded) { mutableStateOf(initiallyExpanded) }
    var renderMode by rememberSaveable(tournament.tournamentId) { mutableStateOf(PlayerBracketRenderMode.Modern.key) }

    if (showHeader) {
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Tournament bracket", fontWeight = FontWeight.SemiBold)
            TextButton(onClick = { showBracket = !showBracket }) {
                Text(if (showBracket) "Hide" else "Show")
            }
        }
    }
    if (!showBracket) {
        return
    }

    val bracketMatches = remember(rawBracketMatches) {
        rawBracketMatches.map(PlayerBracketMatchDto::toPlayerBracketMatchSummary)
    }

    PlayerBracketRenderModeRow(
        selected = renderMode,
        onSelect = { renderMode = it },
    )
    Spacer(Modifier.height(12.dp))

    if (renderMode == PlayerBracketRenderMode.Modern.key) {
        PlayerModernBracketBoard(matches = bracketMatches, callTimeoutMinutes = tournament.callTimeoutMinutes)
    } else {
        PlayerClassicBracketBoard(matches = bracketMatches)
    }
}

@Composable
private fun PlayerBracketRenderModeRow(
    selected: String,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PlayerBracketRenderMode.entries.forEach { option ->
            val isSelected = selected == option.key
            Button(
                onClick = { onSelect(option.key) },
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            ) {
                Text(option.label)
            }
        }
    }
}

@Composable
private fun PlayerClassicBracketBoard(matches: List<PlayerBracketMatchSummary>) {
    val visibleMatches = remember(matches) {
        matches.filterNot { playerIsDormantGrandFinalReset(matches, it) }
    }
    val sections = remember(visibleMatches) { buildPlayerBracketSections(visibleMatches) }
    val isDarkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val sectionCardColor = if (isDarkTheme) {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f)
    } else {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
    }
    val sectionAccentColor = if (isDarkTheme) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else {
        Color(0xFF334155)
    }

    if (sections.isEmpty()) {
        Text(
            text = "There is not enough structure to display the bracket.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        sections.forEach { section ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = sectionCardColor,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                ),
                border = playerBracketSurfaceCardBorder(),
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(section.label, fontWeight = FontWeight.Bold)
                    section.clusters.forEach { cluster ->
                        if (section.clusters.size > 1) {
                            Text(
                                text = cluster.label,
                                color = sectionAccentColor,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            cluster.rounds.forEach { round ->
                                Column(
                                    modifier = Modifier.width(if (round.matches.any { it.participantNames.size > 2 }) 290.dp else 250.dp),
                                    verticalArrangement = Arrangement.spacedBy(16.dp),
                                ) {
                                    Text(
                                        text = round.title,
                                        fontWeight = FontWeight.SemiBold,
                                        color = sectionAccentColor,
                                    )
                                    round.matches.forEach { match ->
                                        PlayerBracketMatchCard(match)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlayerBracketMatchCard(match: PlayerBracketMatchSummary) {
    val isDarkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val cardColor = if (isDarkTheme) {
        MaterialTheme.colorScheme.surface.copy(alpha = 0.96f)
    } else {
        MaterialTheme.colorScheme.surface
    }
    val mutedColor = if (isDarkTheme) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else {
        Color(0xFF64748B)
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = cardColor,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
        border = playerBracketSurfaceCardBorder(),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("M${match.matchNumber}", color = mutedColor)
                Text(match.status, color = mutedColor)
            }
            match.participantNames.forEachIndexed { index, participantName ->
                val participantId = match.participantIds.getOrElse(index) { "" }
                val scoreLabel = playerBracketParticipantScoreLabel(match, index)
                val characterName = playerBracketLatestCharacterForParticipant(match, participantId)
                val isResolved = match.status == "COMPLETED" || match.status == "WALKOVER"
                val isAdvanced = if (match.advancersRequired > 1) {
                    participantId.isNotBlank() && match.advancingParticipantIds.contains(participantId)
                } else {
                    participantId.isNotBlank() && participantId == match.winnerParticipantId
                }
                val isEliminated = isResolved && participantId.isNotBlank() && !isAdvanced
                PlayerBracketParticipantRow(
                    displayName = participantName,
                    scoreLabel = scoreLabel,
                    characterName = if (scoreLabel == "DQ") "" else characterName.orEmpty(),
                    isWinner = participantId.isNotBlank() && participantId == match.winnerParticipantId,
                    isAdvanced = isAdvanced,
                    isEliminated = isEliminated,
                )
            }
            if (!match.stationLabel.isNullOrBlank()) {
                Text("Station: ${match.stationLabel}", color = mutedColor)
            }
            if (match.advancersRequired <= 1) {
                Text("Bo${match.effectiveBestOf}", color = mutedColor)
            }
            if (match.advancersRequired > 1) {
                Text("Pasan ${match.advancersRequired}", color = mutedColor)
            }
        }
    }
}

@Composable
private fun playerBracketSurfaceCardBorder(): BorderStroke {
    val borderColor = if (MaterialTheme.colorScheme.background.luminance() < 0.5f) {
        MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)
    } else {
        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.72f)
    }
    return BorderStroke(1.dp, borderColor)
}

@Composable
private fun PlayerBracketParticipantRow(
    displayName: String,
    scoreLabel: String,
    characterName: String,
    isWinner: Boolean,
    isAdvanced: Boolean,
    isEliminated: Boolean,
) {
    val rowContainerColor = when {
        isAdvanced -> MainPalette.successContainer
        isEliminated -> MaterialTheme.colorScheme.errorContainer
        else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f)
    }
    val rowTextColor = when {
        isAdvanced -> MainPalette.success
        isEliminated -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurface
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = rowContainerColor,
            contentColor = rowTextColor,
        ),
        border = playerBracketSurfaceCardBorder(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (characterName.isNotBlank()) {
                    characterName.split(" / ").forEach { SmashCharacterIcon(name = it) }
                }
                Text(
                    text = displayName,
                    modifier = Modifier.weight(1f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    fontWeight = if (isWinner || isAdvanced) FontWeight.SemiBold else FontWeight.Normal,
                    color = rowTextColor,
                )
            }
            Text(
                text = scoreLabel,
                fontWeight = FontWeight.Bold,
                color = if (scoreLabel == "DQ") MaterialTheme.colorScheme.error else rowTextColor,
            )
        }
    }
}

@Composable
private fun PlayerModernBracketBoard(matches: List<PlayerBracketMatchSummary>, callTimeoutMinutes: Int) {
    com.gestortorneos.bracket.ModernBracketBoard(
        matches = matches.map { it.toModernBracketMatch() },
        characterAssetUrl = ::smashCharacterAssetUrl,
        callTimeoutMinutes = callTimeoutMinutes,
    )
}

private fun PlayerBracketMatchSummary.toModernBracketMatch() = com.gestortorneos.bracket.MatchSummary(
    displayIdentifier = displayIdentifier,
    startggStreamLabel = startggStreamLabel,
    id = id,
    bracketStage = bracketStage,
    roundNumber = roundNumber,
    matchNumber = matchNumber,
    label = label,
    status = status,
    participantNames = participantNames,
    participantIds = participantIds,
    participantScores = participantScores,
    advancersRequired = advancersRequired,
    advancingParticipantIds = advancingParticipantIds,
    winnerParticipantId = winnerParticipantId,
    bestOf = bestOf,
    reportedBestOf = reportedBestOf,
    characterSelections = characterSelections.map { com.gestortorneos.bracket.MatchCharacterSelectionSummary(it.participantId, it.characterName) },
    gameResults = gameResults,
    gameCharacterSelections = gameCharacterSelections.map { game -> com.gestortorneos.bracket.MatchGameCharacterSelectionsSummary(game.gameNum, game.selections.map { com.gestortorneos.bracket.MatchCharacterSelectionSummary(it.participantId, it.characterName) }) },
    calledAt = calledAt,
    startedAt = startedAt,
    stationLabel = stationLabel,
    phaseId = phaseId,
    phaseName = phaseName,
    phaseOrder = phaseOrder,
    phaseGroupId = phaseGroupId,
    phaseGroupName = phaseGroupName,
    phaseType = phaseType,
    isPoolPhase = isPoolPhase,
    fullRoundText = fullRoundText,
)

private fun PlayerBracketMatchDto.toPlayerBracketMatchSummary(): PlayerBracketMatchSummary {
    val orderedParticipants = participants.sortedBy(PlayerBracketMatchParticipantDto::slot)
    return PlayerBracketMatchSummary(
        displayIdentifier = displayIdentifier,
    startggStreamLabel = startggStreamLabel,
        id = id,
        bracketStage = bracketStage,
        roundNumber = roundNumber,
        matchNumber = matchNumber,
        label = label,
        status = status,
        participantNames = orderedParticipants.map(PlayerBracketMatchParticipantDto::displayName),
        participantIds = orderedParticipants.map(PlayerBracketMatchParticipantDto::participantId),
        participantScores = orderedParticipants.map(PlayerBracketMatchParticipantDto::score),
        advancersRequired = advancersRequired,
        advancingParticipantIds = advancingParticipantIds,
        winnerParticipantId = winnerParticipantId,
        bestOf = bestOf,
        reportedBestOf = reportedBestOf,
        characterSelections = characterSelections.orEmpty(),
        gameResults = gameResults.orEmpty(),
        gameCharacterSelections = gameCharacterSelections.orEmpty(),
        calledAt = calledAt,
        startedAt = startedAt,
        stationLabel = stationLabel,
        phaseId = phaseId,
        phaseName = phaseName,
        phaseOrder = phaseOrder,
        phaseGroupId = phaseGroupId,
        phaseGroupName = phaseGroupName,
        phaseType = phaseType,
        isPoolPhase = isPoolPhase,
        fullRoundText = fullRoundText,
    )
}

private fun buildPlayerBracketSections(matches: List<PlayerBracketMatchSummary>): List<PlayerBracketSection> {
    val stageOrder = mapOf(
        "POOLS" to 0,
        "WINNERS" to 1,
        "LOSERS" to 2,
        "FINALS" to 3,
    )
    val sortedMatches = matches.sortedWith(
        compareBy<PlayerBracketMatchSummary>(
            { stageOrder[it.bracketStage] ?: 99 },
            { it.phaseOrder ?: Int.MAX_VALUE },
            { it.phaseDisplayLabel },
            { it.poolLabel ?: "" },
            { it.roundNumber },
            { it.matchNumber },
        )
    )
    val sections = buildList {
        addAll(buildPlayerPoolSections(sortedMatches.filter { it.isPoolMatch }))
        val bracketGrouped = sortedMatches
            .filterNot { it.isPoolMatch }
            .groupBy { match ->
                if (playerHasExplicitPhaseStructure(match)) {
                    match.phaseKey
                } else {
                    "__main_bracket__"
                }
            }
        bracketGrouped.entries.forEach { (key, sectionMatches) ->
            val first = sectionMatches.firstOrNull() ?: return@forEach
            add(
                buildPlayerTournamentBracketSection(
                    id = "bracket:$key",
                    label = playerTournamentBracketLabel(first),
                    matches = sectionMatches,
                )
            )
        }
    }
    return sections.sortedBy { section ->
        when {
            section.label.startsWith("Pool ", ignoreCase = true) -> "0:${section.label}"
            section.label.equals("Final bracket", ignoreCase = true) -> "1:${section.label}"
            else -> "2:${section.label}"
        }
    }
}

private fun playerHasExplicitPhaseStructure(match: PlayerBracketMatchSummary): Boolean {
    if (!match.phaseId.isNullOrBlank()) {
        return true
    }
    val phaseName = match.phaseName?.trim().orEmpty()
    if (phaseName.isBlank()) {
        return false
    }
    if (phaseName.equals(match.bracketStage, ignoreCase = true)) {
        return false
    }
    if (phaseName.equals("bracket", ignoreCase = true)) {
        return false
    }
    return true
}

private fun buildPlayerPoolSections(matches: List<PlayerBracketMatchSummary>): List<PlayerBracketSection> {
    if (matches.isEmpty()) {
        return emptyList()
    }
    val explicitGroups = matches
        .filter { !it.phaseScopedPoolKey.isNullOrBlank() && !it.poolLabel.isNullOrBlank() && !it.poolLabel.equals("POOLS", ignoreCase = true) }
        .groupBy { it.phaseScopedPoolKey!! }
        .map { (key, groupMatches) ->
            playerPoolSectionFromMatches(
                id = "pool:$key",
                label = groupMatches.first().poolLabel ?: "Pool",
                matches = groupMatches,
            )
        }
    val fallbackMatches = matches.filter { it.phaseScopedPoolKey.isNullOrBlank() || it.poolLabel.isNullOrBlank() || it.poolLabel.equals("POOLS", ignoreCase = true) }
    val fallbackGroups = playerConnectedPoolGroups(fallbackMatches).mapIndexed { index, groupMatches ->
        playerPoolSectionFromMatches(
            id = "pool:local:$index",
            label = "Pool ${index + 1}",
            matches = groupMatches,
        )
    }
    return (explicitGroups + fallbackGroups).sortedBy { it.label }
}

private fun playerConnectedPoolGroups(matches: List<PlayerBracketMatchSummary>): List<List<PlayerBracketMatchSummary>> {
    if (matches.isEmpty()) {
        return emptyList()
    }
    val byId = matches.associateBy { it.id }
    val adjacency = matches.associate { it.id to linkedSetOf<String>() }.toMutableMap()
    matches.forEach { match ->
        playerModernSourceMatchIds(match, matches).forEach { sourceId ->
            if (sourceId in byId) {
                adjacency.getValue(match.id).add(sourceId)
                adjacency.getValue(sourceId).add(match.id)
            }
        }
    }
    val visited = linkedSetOf<String>()
    val groups = mutableListOf<List<PlayerBracketMatchSummary>>()
    matches.forEach { start ->
        if (!visited.add(start.id)) return@forEach
        val stack = ArrayDeque<String>()
        val groupIds = mutableListOf<String>()
        stack.add(start.id)
        while (stack.isNotEmpty()) {
            val current = stack.removeLast()
            groupIds += current
            adjacency[current].orEmpty().forEach { neighbor ->
                if (visited.add(neighbor)) {
                    stack.add(neighbor)
                }
            }
        }
        groups += groupIds.mapNotNull(byId::get)
    }
    return groups
}

private fun buildPlayerTournamentBracketSection(
    id: String,
    label: String,
    matches: List<PlayerBracketMatchSummary>,
): PlayerBracketSection {
    val winners = matches.filter { it.bracketStage == "POOLS" || it.bracketStage == "WINNERS" }
    val losers = matches.filter { it.bracketStage == "LOSERS" }
    val finals = matches.filter { it.bracketStage == "FINALS" }
    val clusters = buildList {
        if (winners.isNotEmpty() || finals.isNotEmpty()) {
            add(
                playerClusterFromStageGroups(
                    id = "$id:winners",
                    label = "Winners bracket",
                    stageGroups = listOf(
                        "WINNERS" to winners,
                        "FINALS" to finals,
                    ),
                )
            )
        }
        if (losers.isNotEmpty()) {
            add(
                playerClusterFromMatches(
                    id = "$id:losers",
                    label = "Losers bracket",
                    matches = losers,
                )
            )
        }
    }
    return PlayerBracketSection(
        id = sanitizePlayerBracketHtmlId(id),
        label = label,
        clusters = clusters,
    )
}

private fun playerPoolSectionFromMatches(
    id: String,
    label: String,
    matches: List<PlayerBracketMatchSummary>,
): PlayerBracketSection {
    val winnersLike = matches.filter { it.bracketStage == "POOLS" || it.bracketStage == "WINNERS" || it.bracketStage == "FINALS" }
    val losers = matches.filter { it.bracketStage == "LOSERS" }
    val clusters = buildList {
        if (winnersLike.isNotEmpty()) {
            add(
                playerClusterFromStageGroups(
                    id = "$id:winners",
                    label = "Winners bracket",
                    stageGroups = listOf(
                        "WINNERS" to winnersLike.filter { it.bracketStage == "POOLS" || it.bracketStage == "WINNERS" },
                        "FINALS" to winnersLike.filter { it.bracketStage == "FINALS" },
                    ),
                )
            )
        }
        if (losers.isNotEmpty()) {
            add(
                playerClusterFromMatches(
                    id = "$id:losers",
                    label = "Losers bracket",
                    matches = losers,
                )
            )
        }
    }
    return PlayerBracketSection(
        id = sanitizePlayerBracketHtmlId(id),
        label = label,
        clusters = clusters,
    )
}

private fun playerClusterFromStageGroups(
    id: String,
    label: String,
    stageGroups: List<Pair<String, List<PlayerBracketMatchSummary>>>,
): PlayerBracketCluster {
    val rounds = stageGroups.flatMap { (_, stageMatches) ->
        stageMatches
            .groupBy { it.roundNumber }
            .toSortedMap()
            .map { (_, roundMatches) ->
                PlayerBracketRound(
                    title = roundMatches.firstOrNull()?.roundDisplayTitle ?: "Round",
                    matches = roundMatches.sortedBy { it.matchNumber },
                )
            }
    }
    return PlayerBracketCluster(
        id = sanitizePlayerBracketHtmlId(id),
        label = label,
        rounds = rounds,
    )
}

private fun playerClusterFromMatches(
    id: String,
    label: String,
    matches: List<PlayerBracketMatchSummary>,
): PlayerBracketCluster {
    val rounds = matches
        .groupBy { it.roundNumber }
        .toSortedMap()
        .map { (_, roundMatches) ->
            PlayerBracketRound(
                title = roundMatches.firstOrNull()?.roundDisplayTitle ?: "Round",
                matches = roundMatches.sortedBy { it.matchNumber },
            )
        }
    return PlayerBracketCluster(
        id = sanitizePlayerBracketHtmlId(id),
        label = label,
        rounds = rounds,
    )
}

private fun playerTournamentBracketLabel(match: PlayerBracketMatchSummary): String {
    val customPhaseName = match.phaseDisplayLabel.takeIf {
        it.isNotBlank() &&
            !it.equals(match.bracketStage, ignoreCase = true) &&
            !it.equals("bracket", ignoreCase = true)
    }
    return customPhaseName ?: "Final bracket"
}

private fun playerModernSourceMatchIds(
    match: PlayerBracketMatchSummary,
    candidateMatches: List<PlayerBracketMatchSummary> = emptyList(),
): List<String> {
    if (match.isRoundRobinPhase) {
        return emptyList()
    }
    val sourceIds = linkedSetOf<String>()
    match.participantIds
        .mapNotNull(::playerSourceMatchIdFromPlaceholder)
        .forEach(sourceIds::add)
    val targetIndex = candidateMatches.indexOfFirst { it.id == match.id }
    val earlierMatches = if (targetIndex >= 0) {
        candidateMatches.take(targetIndex)
    } else {
        candidateMatches.filter { it.id != match.id }
    }
    match.participantIds.forEach { participantId ->
        if (participantId.isBlank() || playerSourceMatchIdFromPlaceholder(participantId) != null) {
            return@forEach
        }
        val sourceMatch = earlierMatches
            .asReversed()
            .firstOrNull { candidate -> playerFeedsParticipant(candidate, participantId) }
        sourceMatch?.id?.let(sourceIds::add)
    }
    return sourceIds.toList()
}

private fun playerFeedsParticipant(match: PlayerBracketMatchSummary, participantId: String): Boolean {
    if (participantId.isBlank()) {
        return false
    }
    if (match.advancingParticipantIds.contains(participantId)) {
        return true
    }
    if (match.winnerParticipantId == participantId) {
        return true
    }
    return match.participantIds.contains(participantId)
}

private fun playerSourceMatchIdFromPlaceholder(participantId: String): String? {
    return when {
        participantId.startsWith("winner_of_") -> participantId.removePrefix("winner_of_")
        participantId.startsWith("loser_of_") -> participantId.removePrefix("loser_of_")
        participantId.startsWith("advance_") -> Regex("^advance_\\d+_of_(.+)$").find(participantId)?.groupValues?.getOrNull(1)
        participantId.startsWith("drop_") -> Regex("^drop_\\d+_of_(.+)$").find(participantId)?.groupValues?.getOrNull(1)
        else -> null
    }?.takeIf { it.isNotBlank() }
}

private fun playerBracketLatestCharacterForParticipant(match: PlayerBracketMatchSummary, participantId: String): String? {
    val selections = match.gameCharacterSelections.sortedByDescending { it.gameNum }
        .firstOrNull { game -> game.selections.any { it.participantId == participantId } }?.selections ?: match.characterSelections
    return selections.filter { it.participantId == participantId }.joinToString(" / ") { it.characterName }.takeIf { it.isNotBlank() }
}

private fun playerBracketParticipantScoreLabel(match: PlayerBracketMatchSummary, index: Int): String {
    val participantId = match.participantIds.getOrElse(index) { "" }
    if (match.status == "WALKOVER" && match.winnerParticipantId != null && participantId.isNotBlank()) {
        return if (participantId == match.winnerParticipantId) {
            match.participantScores.getOrElse(index) { 0 }.toString()
        } else {
            "DQ"
        }
    }
    return match.participantScores.getOrElse(index) { 0 }.toString()
}

private fun playerIsDormantGrandFinalReset(
    allMatches: List<PlayerBracketMatchSummary>,
    match: PlayerBracketMatchSummary,
): Boolean {
    if (match.bracketStage != "FINALS" || match.roundNumber <= 1) {
        return false
    }
    val hasActivity = match.status == "COMPLETED" ||
        match.status == "WALKOVER" ||
        match.calledAt != null ||
        match.startedAt != null ||
        match.winnerParticipantId != null ||
        match.advancingParticipantIds.isNotEmpty() ||
        match.gameResults.isNotEmpty() ||
        match.characterSelections.isNotEmpty() ||
        match.gameCharacterSelections.isNotEmpty() ||
        match.participantScores.any { it > 0 }
    if (hasActivity) {
        return false
    }
    val grandFinal = allMatches.firstOrNull {
        it.bracketStage == "FINALS" && it.roundNumber == 1 && it.matchNumber == match.matchNumber
    } ?: return true
    val grandFinalWinnerId = grandFinal.winnerParticipantId ?: return true
    val losersSideParticipantId = grandFinal.participantIds.getOrNull(1)?.takeIf { it.isNotBlank() } ?: return true
    return grandFinalWinnerId != losersSideParticipantId
}

private fun sanitizePlayerBracketHtmlId(value: String): String {
    return buildString {
        value.forEach { ch ->
            append(
                when {
                    ch.isLetterOrDigit() -> ch.lowercaseChar()
                    else -> '-'
                }
            )
        }
    }.trim('-').ifBlank { "section" }
}

private fun escapePlayerBracketHtml(value: String): String {
    return value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;")
}
