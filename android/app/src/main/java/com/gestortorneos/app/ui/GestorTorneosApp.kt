@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.gestortorneos.app.ui

import com.gestortorneos.ui.*
import com.gestortorneos.ui.MainThemeMode as ThemeMode
import androidx.compose.runtime.collectAsState
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.produceState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.gestortorneos.app.data.TournamentRepository
import com.gestortorneos.app.data.TournamentRepository.DetailedReportedGame
import com.gestortorneos.app.data.remote.BackendConfig
import com.gestortorneos.app.updates.AndroidAppUpdateGate
import com.gestortorneos.app.ui.tournaments.CreateTournamentController
import com.gestortorneos.app.ui.tournaments.TournamentDetailController
import com.gestortorneos.app.ui.tournaments.TournamentListController
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.ui.platform.LocalContext

private enum class AppSection(val label: String) {
    Home("Home"),
    Tournaments("Tournaments"),
    Operations("Match operations"),
    Profile("Profile")
}



private enum class OperationsRenderMode(val key: String, val label: String) {
    Classic("classic", "Classic"),
    Modern("modern", "Modern"),
}

internal enum class CreateTournamentMode(val title: String) {
    Manual("New tournament"),
    Startgg("New start.gg tournament")
}

private val smashUltimateCharacterNames = listOf(
    "Bayonetta",
    "Bowser Jr.",
    "Bowser",
    "Captain Falcon",
    "Cloud",
    "Corrin",
    "Daisy",
    "Dark Pit",
    "Diddy Kong",
    "Donkey Kong",
    "Dr. Mario",
    "Duck Hunt",
    "Falco",
    "Fox",
    "Ganondorf",
    "Greninja",
    "Ice Climbers",
    "Ike",
    "Inkling",
    "Jigglypuff",
    "King Dedede",
    "Kirby",
    "Link",
    "Little Mac",
    "Lucario",
    "Lucas",
    "Lucina",
    "Luigi",
    "Mario",
    "Marth",
    "Mega Man",
    "Meta Knight",
    "Mewtwo",
    "Mii Brawler",
    "Ness",
    "Olimar",
    "Pac-Man",
    "Palutena",
    "Peach",
    "Pichu",
    "Pikachu",
    "Pit",
    "Pokemon Trainer",
    "Ridley",
    "R.O.B.",
    "Robin",
    "Rosalina",
    "Roy",
    "Ryu",
    "Samus",
    "Sheik",
    "Shulk",
    "Snake",
    "Sonic",
    "Toon Link",
    "Villager",
    "Wario",
    "Wii Fit Trainer",
    "Wolf",
    "Yoshi",
    "Young Link",
    "Zelda",
    "Zero Suit Samus",
    "Mr. Game & Watch",
    "Incineroar",
    "King K. Rool",
    "Dark Samus",
    "Chrom",
    "Ken",
    "Simon Belmont",
    "Richter",
    "Isabelle",
    "Mii Swordfighter",
    "Mii Gunner",
    "Piranha Plant",
    "Joker",
    "Hero",
    "Banjo-Kazooie",
    "Terry",
    "Byleth",
    "Random Character",
    "Min Min",
    "Steve",
    "Sephiroth",
    "Pyra & Mythra",
    "Kazuya",
    "Sora",
)

@Composable
private fun surfaceCardBorder(): BorderStroke {
    return BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
}

private sealed interface AppScreen {
    data object SectionHome : AppScreen
    data object SectionTournaments : AppScreen
    data object SectionOperations : AppScreen
    data object SectionProfile : AppScreen
    data class CreateTournament(val mode: CreateTournamentMode) : AppScreen
    data class TournamentDetail(val tournamentId: String) : AppScreen
    data class TournamentOperations(val tournamentId: String) : AppScreen
}

@Composable
fun GestorTorneosApp() {
    val context = LocalContext.current
    val repository = remember { TournamentRepository() }
    val scope = rememberCoroutineScope()
    val appPreferences = remember(context) {
        context.getSharedPreferences("gestor_torneos_preferences", Context.MODE_PRIVATE)
    }
    var currentSection by remember { mutableStateOf(AppSection.Home) }
    var currentScreen by remember { mutableStateOf<AppScreen>(AppScreen.SectionHome) }
    var themeMode by remember {
        mutableStateOf(
            appPreferences.getString("theme_mode", ThemeMode.System.name)
                ?.let { saved -> runCatching { ThemeMode.valueOf(saved) }.getOrDefault(ThemeMode.System) }
                ?: ThemeMode.System
        )
    }
    var adaptiveLayout by remember { mutableStateOf(appPreferences.getBoolean("adaptive_layout", true)) }
    var textSize by remember { mutableStateOf(runCatching { MainTextSize.valueOf(appPreferences.getString("text_size", MainTextSize.Regular.name)!!) }.getOrDefault(MainTextSize.Regular)) }
    val managementSession by ManagementSession.state.collectAsState()
    val isAdmin = managementSession != null
    val adminSessionKey = managementSession?.token.orEmpty()
    var adminLoginError by rememberSaveable { mutableStateOf<String?>(null) }
    var adminLoginLoading by rememberSaveable { mutableStateOf(false) }
    var adminNotificationSettings by remember { mutableStateOf<TournamentRepository.AdminNotificationSettings?>(null) }
    var adminNotificationSettingsError by rememberSaveable { mutableStateOf<String?>(null) }
    var adminNotificationSettingsLoading by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(themeMode, textSize, adaptiveLayout) {
        appPreferences.edit().putString("theme_mode", themeMode.name).putString("text_size", textSize.name).putBoolean("adaptive_layout", adaptiveLayout).apply()
    }

    LaunchedEffect(adminSessionKey) {
        currentSection = AppSection.Home
        currentScreen = AppScreen.SectionHome
        adminNotificationSettings = null
        if (adminSessionKey.isNotBlank()) {
            runCatching { repository.getAdminNotificationSettings(adminSessionKey) }
                .onSuccess { adminNotificationSettings = it }
                .onFailure { adminNotificationSettingsError = it.message }
        }
    }

    MainTheme(MainAppearance(themeMode, textSize, { themeMode = it }, { textSize = it }, adaptiveLayout, { adaptiveLayout = it })) {
        AndroidAppUpdateGate()
        if (managementSession == null) {
            ManagementLoginScreen(BackendConfig.baseUrl)
            return@MainTheme
        }

        fun openSection(section: AppSection) {
            currentSection = section
            currentScreen = when (section) {
                AppSection.Home -> AppScreen.SectionHome
                AppSection.Tournaments -> AppScreen.SectionTournaments
                AppSection.Operations -> AppScreen.SectionOperations
                AppSection.Profile -> AppScreen.SectionProfile
            }
        }

        Scaffold(
            containerColor = Color.Transparent,
            bottomBar = {
                NavigationBar {
                    AppSection.entries.forEach { section ->
                        NavigationBarItem(
                            selected = section == currentSection,
                            onClick = { openSection(section) },
                            label = { Text(section.label) },
                            icon = { Box(modifier = Modifier.height(1.dp)) }
                        )
                    }
                }
            }
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(innerPadding)
            ) {
                when (val screen = currentScreen) {
                    AppScreen.SectionHome -> HomeScreen(
                        onCreateTournament = { currentScreen = AppScreen.CreateTournament(CreateTournamentMode.Manual) },
                        onCreateStartggTournament = { currentScreen = AppScreen.CreateTournament(CreateTournamentMode.Startgg) },
                        onOpenTournament = { tournamentId ->
                            currentSection = AppSection.Tournaments
                            currentScreen = AppScreen.TournamentDetail(tournamentId)
                        }
                    )

                    AppScreen.SectionTournaments -> TournamentListScreen(
                        isAdmin = isAdmin,
                        adminSessionKey = adminSessionKey,
                        onCreateTournament = { currentScreen = AppScreen.CreateTournament(CreateTournamentMode.Manual) },
                        onCreateStartggTournament = { currentScreen = AppScreen.CreateTournament(CreateTournamentMode.Startgg) },
                        onOpenTournament = { tournamentId ->
                            currentScreen = AppScreen.TournamentDetail(tournamentId)
                        }
                    )

                    AppScreen.SectionOperations -> OperationsTournamentSelector(
                        onOpenTournamentOperations = { tournamentId ->
                            currentScreen = AppScreen.TournamentOperations(tournamentId)
                        }
                    )

                    AppScreen.SectionProfile -> ProfileScreen(
                        themeMode = themeMode,
                        isAdmin = isAdmin,
                        adminLoginError = adminLoginError,
                        adminLoginLoading = adminLoginLoading,
                        adminNotificationSettings = adminNotificationSettings,
                        adminNotificationSettingsError = adminNotificationSettingsError,
                        adminNotificationSettingsLoading = adminNotificationSettingsLoading,
                        onThemeSelected = { themeMode = it },
                        onAdminLogin = {},
                        onAdminLogout = {
                            adminNotificationSettings = null
                            scope.launch { ManagementSession.logout() }
                        },
                        onUpdateNotificationSettings = { telegramEnabled, whatsappEnabled ->
                            if (adminSessionKey.isBlank()) {
                                adminNotificationSettingsError = "The admin session is unavailable."
                            } else {
                                adminNotificationSettingsLoading = true
                                adminNotificationSettingsError = null
                                scope.launch {
                                    runCatching {
                                        repository.updateAdminNotificationSettings(
                                            adminKey = adminSessionKey,
                                            telegramEnabled = telegramEnabled,
                                            whatsappEnabled = whatsappEnabled
                                        )
                                    }.onSuccess { settings ->
                                        adminNotificationSettings = settings
                                        adminNotificationSettingsError = null
                                    }.onFailure { error ->
                                        adminNotificationSettingsError = error.message ?: "Could not save notifications."
                                    }
                                    adminNotificationSettingsLoading = false
                                }
                            }
                        }
                    )

                    is AppScreen.CreateTournament -> CreateTournamentScreen(
                        mode = screen.mode,
                        onBack = { openSection(AppSection.Tournaments) },
                        onCreated = { tournament ->
                            currentSection = AppSection.Tournaments
                            currentScreen = AppScreen.TournamentDetail(tournament.id)
                        }
                    )

                    is AppScreen.TournamentDetail -> TournamentDetailScreen(
                        tournamentId = screen.tournamentId,
                        adminKey = adminSessionKey,
                        onBack = { openSection(AppSection.Tournaments) },
                        onOpenOperations = { currentScreen = AppScreen.TournamentOperations(screen.tournamentId) }
                    )

                    is AppScreen.TournamentOperations -> TournamentOperationsScreen(
                        tournamentId = screen.tournamentId,
                        onBack = { openSection(AppSection.Operations) }
                    )
                }
            }
        }
    }
}

@Composable
private fun HomeScreen(
    onCreateTournament: () -> Unit,
    onCreateStartggTournament: () -> Unit,
    onOpenTournament: (String) -> Unit
) {
    val controller = remember { TournamentListController() }
    val state = controller.state

    LaunchedEffect(Unit) {
        controller.load()
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(4000)
            controller.load(silent = true)
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                text = "Tournament hub",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
        }
        item {
            Text(
                text = "Manage tournaments, participants and matches in real time on Android.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        item {
            HeroCard(
                onCreateTournament = onCreateTournament,
                onCreateStartggTournament = onCreateStartggTournament
            )
        }
        item { SectionTitle("Recent tournaments") }
        when {
            state.isLoading -> item { LoadingCard() }
            state.errorMessage != null -> item { InfoCard("Offline", state.errorMessage ?: "") }
            state.tournaments.isEmpty() -> item { InfoCard("No tournaments", "No tournaments created yet.") }
            else -> items(state.tournaments.filter { it.status != "ARCHIVED" }.take(3)) { tournament ->
                TournamentCard(
                    tournament = tournament,
                    buttonLabel = "Open tournament",
                    onClick = { onOpenTournament(tournament.id) }
                )
            }
        }
    }
}

@Composable
private fun TournamentListScreen(
    isAdmin: Boolean,
    adminSessionKey: String,
    onCreateTournament: () -> Unit,
    onCreateStartggTournament: () -> Unit,
    onOpenTournament: (String) -> Unit
) {
    val controller = remember { TournamentListController() }
    val state = controller.state
    var tournamentToDelete by remember { mutableStateOf<TournamentSummary?>(null) }
    var showArchived by rememberSaveable { mutableStateOf(false) }
    val listedTournaments = state.tournaments.filter { (it.status == "ARCHIVED") == showArchived }

    LaunchedEffect(Unit) {
        controller.load()
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(4000)
            controller.load(silent = true)
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item { SectionTitle(if (showArchived) "Archived tournaments" else "Tournaments") }
        item { SegmentedChoiceRow("Tournament list", listOf("current" to "Current", "archive" to "Archived"),
            if (showArchived) "archive" else "current", { showArchived = it == "archive" }) }
        item {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onCreateTournament) {
                    Text("New tournament")
                }
                Button(onClick = onCreateStartggTournament) {
                    Text("New start.gg tournament")
                }
            }
        }
        when {
            state.isLoading -> item { LoadingCard() }
            state.errorMessage != null -> item { InfoCard("Offline", state.errorMessage ?: "") }
            listedTournaments.isEmpty() -> item { InfoCard("No tournaments", if (showArchived) "Tournaments you archive after completion will appear here." else "No tournaments in this list.") }
            else -> items(listedTournaments) { tournament ->
                TournamentCard(
                    tournament = tournament,
                    buttonLabel = if (showArchived) "View" else "Manage",
                    onClick = { onOpenTournament(tournament.id) },
                    isAdmin = isAdmin && !showArchived,
                    onDelete = { tournamentToDelete = tournament }
                )
            }
        }
    }

    if (tournamentToDelete != null) {
        AlertDialog(
            onDismissRequest = { tournamentToDelete = null },
            title = { Text("Delete tournament") },
            text = { Text("${tournamentToDelete?.title} will be deleted. This cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        tournamentToDelete?.let { controller.deleteTournament(it.id, adminSessionKey) }
                        tournamentToDelete = null
                    }
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { tournamentToDelete = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun OperationsTournamentSelector(
    onOpenTournamentOperations: (String) -> Unit
) {
    val controller = remember { TournamentListController() }
    val state = controller.state

    LaunchedEffect(Unit) {
        controller.load()
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(4000)
            controller.load(silent = true)
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item { SectionTitle("Tournament operations") }
        item {
            Text(
                text = "Select a tournament to call matches and report results within that event.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        when {
            state.isLoading -> item { LoadingCard() }
            state.errorMessage != null -> item { InfoCard("Offline", state.errorMessage ?: "") }
            state.tournaments.isEmpty() -> item { InfoCard("No tournaments", "No tournaments to manage.") }
            else -> items(state.tournaments.filter { it.status != "ARCHIVED" }) { tournament ->
                TournamentCard(
                    tournament = tournament,
                    buttonLabel = "Open match operations",
                    onClick = { onOpenTournamentOperations(tournament.id) }
                )
            }
        }
    }
}

@Composable
private fun TournamentDetailScreen(
    tournamentId: String,
    adminKey: String,
    onBack: () -> Unit,
    onOpenOperations: () -> Unit
) {
    val controller = remember { TournamentDetailController() }
    val repository = remember { com.gestortorneos.app.data.TournamentRepository() }
    val scope = rememberCoroutineScope()
    val state = controller.state
    val latestIsMutating by rememberUpdatedState(state.isMutating)
    val reviewListState = androidx.compose.foundation.lazy.rememberLazyListState()
    val reviewAnchors = remember { mutableMapOf<String, Int>() }
    var reviewTarget by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(reviewTarget) {
        val target = reviewTarget ?: return@LaunchedEffect
        delay(100)
        reviewAnchors[target]?.let { reviewListState.animateScrollToItem(it) }
        reviewTarget = null
    }
    var participantName by rememberSaveable { mutableStateOf("") }
    var showSettings by rememberSaveable { mutableStateOf(false) }
    var showParticipants by rememberSaveable { mutableStateOf(false) }
    var showSeeding by rememberSaveable { mutableStateOf(false) }
    var showBracket by rememberSaveable { mutableStateOf(false) }
    var bracketRenderer by rememberSaveable { mutableStateOf("experimental") }
    var showLadder by rememberSaveable { mutableStateOf(false) }
    var showSetups by rememberSaveable { mutableStateOf(false) }
    var title by rememberSaveable { mutableStateOf("") }
    var gameTitle by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var platform by rememberSaveable { mutableStateOf("") }
    var maxParticipantsText by rememberSaveable { mutableStateOf("16") }
    var format by rememberSaveable { mutableStateOf("SINGLE_ELIMINATION") }
    var bracketMode by rememberSaveable { mutableStateOf("STANDARD") }
    var fortniteLobbySize by rememberSaveable { mutableStateOf(20) }
    var fortniteGamesPerRound by rememberSaveable { mutableStateOf(3) }
    var mkartAdvanceMode by rememberSaveable { mutableStateOf("1") }
    var mkartLosersAdvanceMode by rememberSaveable { mutableStateOf("1") }
    var winnersBestOfText by rememberSaveable { mutableStateOf("3") }
    var losersBestOfText by rememberSaveable { mutableStateOf("3") }
    var seedingMethod by rememberSaveable { mutableStateOf("MANUAL") }
    var callTimeoutText by rememberSaveable { mutableStateOf("10") }
    var setupCountText by rememberSaveable { mutableStateOf("1") }
    var streamCountText by rememberSaveable { mutableStateOf("0") }
    var playAreaName by rememberSaveable { mutableStateOf("") }
    var playerMatchReportingMode by rememberSaveable { mutableStateOf("on") }
    var showStartggImportDialog by rememberSaveable { mutableStateOf(false) }
    var showGenerateBracketResetDialog by rememberSaveable { mutableStateOf(false) }
    var resetOnly by rememberSaveable { mutableStateOf(false) }
    var startggEventUrl by rememberSaveable { mutableStateOf("") }
    var startggPreviewName by rememberSaveable { mutableStateOf<String?>(null) }
    var startggPreviewFormat by rememberSaveable { mutableStateOf<String?>(null) }
    var startggPreviewParticipants by remember { mutableStateOf<List<TournamentParticipantSummary>>(emptyList()) }
    var startggPreviewError by rememberSaveable { mutableStateOf<String?>(null) }
    var startggPreviewLoading by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(tournamentId) {
        controller.load(tournamentId)
    }
    LaunchedEffect(tournamentId) {
        while (true) {
            delay(3000)
            if (!latestIsMutating) {
                controller.load(tournamentId, silent = true)
            }
        }
    }

    LaunchedEffect(state.detail?.id, state.detail?.title, state.detail?.game, state.detail?.playAreaName) {
        state.detail?.let { detail ->
            title = detail.title
            gameTitle = detail.game
            description = detail.description
            platform = detail.platform
            maxParticipantsText = detail.maxParticipants.toString()
            format = detail.rawFormat
            bracketMode = detail.bracketMode
            fortniteLobbySize = detail.fortniteLobbySize
            fortniteGamesPerRound = detail.fortniteGamesPerRound
            mkartAdvanceMode = detail.mkartAdvanceCount.toString()
            mkartLosersAdvanceMode = detail.mkartLosersAdvanceCount.toString()
            winnersBestOfText = detail.winnersBestOf.toString()
            losersBestOfText = detail.losersBestOf.toString()
            seedingMethod = detail.seedingMethod
            callTimeoutText = detail.callTimeoutMinutes.toString()
            setupCountText = detail.setupCount.toString()
            streamCountText = detail.streamCount.toString()
            playAreaName = detail.playAreaName.orEmpty()
            playerMatchReportingMode = if (detail.playerMatchReportingEnabled) "on" else "off"
            startggEventUrl = detail.startggEventUrl.orEmpty()
        }
    }

    LazyColumn(
        state = reviewListState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        withReviewAnchors(reviewAnchors) {
        item { TextButton(onClick = onBack) { Text("‹ Back") } }

        when {
            state.isLoading -> item { LoadingCard() }
            state.errorMessage != null && state.detail == null -> item { InfoCard("Error", state.errorMessage ?: "") }
            state.detail != null -> {
                    val detail = state.detail
                    if (detail.status == "ARCHIVED") {
                        item { SectionTitle(detail.title) }
                        item { InfoCard("Archived · read-only", "This tournament is hidden from the display. Unarchive it to make changes.") }
                        state.errorMessage?.let { message -> item { InfoCard("Could not complete", message) } }
                        item { com.gestortorneos.ui.TournamentArchiveButton(true, state.isMutating) { controller.setArchived(tournamentId, false) } }
                        item { TournamentActivityButton(detail.id) }
                        if (detail.bracketMode == "FORTNITE") item { FortnitePanelButton(detail.id) }
                        else item { ExperimentalBracketBoard(detail.matches, hideAutomaticAdvances = !detail.isStartggMirrored) }
                        if (detail.teamSize > 1 && !detail.isStartggMirrored) item { TeamRosterPanel(detail.id) {} }
                        item { SectionTitle("Participants") }
                        items(detail.participants) { participant -> Text(participant.displayName) }
                        return@withReviewAnchors
                    }
                    if (detail.status == "COMPLETED") item(key = "ARCHIVE") { com.gestortorneos.ui.TournamentArchiveButton(false, state.isMutating) { controller.setArchived(tournamentId, true) } }
                    val canChangeEntrants = !detail.isStartggMirrored && detail.status in listOf("DRAFT", "PUBLISHED", "CHECK IN", "READY") && !(detail.bracketMode == "FORTNITE" && detail.status == "READY")
                    state.errorMessage?.let { error -> item { InfoCard("Error", error) } }
                    val tournamentStarted = (detail.isStartggMirrored || isTournamentStarted(detail.status)) && detail.status != "IMPORTING"
                    item { com.gestortorneos.ui.TournamentReviewButton(detail.id,
                        load = { com.gestortorneos.app.data.remote.NetworkModule.tournamentApi.getReview(detail.id) },
                        onAttendance = { participant, value ->
                            com.gestortorneos.app.data.remote.NetworkModule.tournamentApi.updateAttendance(detail.id, participant.id, mapOf("checkedIn" to value))
                        },
                        onNavigate = { target ->
                            when (target) {
                                "PARTICIPANTS" -> showParticipants = true
                                "BRACKET" -> showBracket = true
                                "LADDER" -> showLadder = true
                                "SETTINGS" -> showSettings = true
                            }
                            if (target == "SYNC") onOpenOperations() else reviewTarget = target
                        }) }
                    item { MainTournamentSummary(detail.title, "${detail.game} · ${detail.platform} · ${detail.format}", detail.status, mainStatusLabel(detail.status),
                        "${detail.participants.size}/${detail.maxParticipants} ${if (detail.teamSize > 1) "equipos" else "participantes"}", tournamentNextStep(detail.status, detail.bracketMode == "FORTNITE")) }
                    item(key = "COMPETITION") {
                        MainSectionHeading("Competition")
                        TournamentActivityButton(detail.id)
                        if (!detail.isStartggMirrored) FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (detail.bracketMode != "FORTNITE") {
                                OutlinedButton(onClick = {
                                    if (isTournamentStarted(detail.status)) { resetOnly = false; showGenerateBracketResetDialog = true }
                                    else controller.generateBracket(tournamentId)
                                }, enabled = !state.isMutating && detail.participants.size >= 2) {
                                    MainBusyLabel(if (state.isMutating) "Processing…" else if (detail.matches.isEmpty()) "Generate bracket" else "Regenerate bracket", state.isMutating)
                                }
                                if (detail.status == "READY") Button(onClick = { controller.startTournament(tournamentId) }, enabled = !state.isMutating && detail.matches.isNotEmpty()) { Text("Start tournament") }
                            }
                        }
                        if (!detail.isStartggMirrored) MainOtherActions {
                            Text("Resetting deletes the bracket and results. Registered participants are kept.", style = MaterialTheme.typography.bodySmall)
                            MainDangerButton("Reset tournament", enabled = !state.isMutating, onClick = { resetOnly = true; showGenerateBracketResetDialog = true })
                        }
                    }
                    if (detail.bracketMode == "FORTNITE") item(key = "FORTNITE") { FortnitePanelButton(detail.id) }
                    if (detail.status == "COMPLETED") item(key = "TOP8") { Top8EditorButton(detail.id) }
                    if (!detail.isStartggMirrored && detail.teamSize > 1) item(key = "TEAMS") {
                        TeamRosterPanel(detail.id) { controller.load(tournamentId, silent = true) }
                    }
                    run {
                        item(key = "REGISTRATION") { PublicTournamentOptions(detail, adminKey.isNotBlank() && !state.isMutating, adminKey) { options ->
                            controller.updatePublicOptions(tournamentId, adminKey, options)
                        } }
                    }
                    detail.importProgress?.let { progress -> item { Text(progress) } }
                item(key = "SETTINGS") {
                    CollapsibleHeader(
                        title = if (detail.isStartggMirrored) "start.gg settings" else "Tournament settings",
                        expanded = showSettings,
                        onToggle = { showSettings = !showSettings }
                    )
                }
                if (showSettings) {
                    if (detail.isStartggMirrored) {
                        item {
                            InfoCard(
                                title = "Tournament linked to start.gg",
                                body = "This tournament uses a start.gg mirror bracket. Here you can reimport the bracket, adjust the call timeout, set available setups and decide whether players can report their sets."
                            )
                        }
                        item {
                            InfoCard(
                                title = "Event imported",
                                body = detail.startggEventUrl ?: "No saved URL"
                            )
                        }
                        item {
                            FormField(
                                value = callTimeoutText,
                                onValueChange = { callTimeoutText = it },
                                label = "Call timeout in minutes",
                                keyboardType = KeyboardType.Number
                            )
                        }
                        item {
                            FormField(
                                value = setupCountText,
                                onValueChange = { setupCountText = it.filter(Char::isDigit) },
                                label = "Setup count",
                                keyboardType = KeyboardType.Number
                            )
                            SegmentedChoiceRow("Stream", listOf("0" to "No stream", "1" to "1 stream", "2" to "2 streams"), streamCountText) { streamCountText = it }
                            Button(onClick = { controller.updateSetups(tournamentId, setupCountText.toIntOrNull() ?: detail.setupCount, streamCountText.toIntOrNull() ?: 0) }, enabled = !state.isMutating) { Text("Save setups and streams") }
                        }
                        item {
                            SegmentedChoiceRow(
                                title = "Player reporting",
                                options = listOf("on" to "Enabled", "off" to "Disabled"),
                                selected = playerMatchReportingMode,
                                onSelect = { playerMatchReportingMode = it }
                            )
                        }
                        item {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Button(
                                    onClick = {
                                        controller.updateTournament(
                                            tournamentId = tournamentId,
                                            detail = detail.copy(
                                                callTimeoutMinutes = callTimeoutText.toIntOrNull() ?: detail.callTimeoutMinutes,
                                                setupCount = setupCountText.toIntOrNull() ?: detail.setupCount,
                                                streamCount = streamCountText.toIntOrNull() ?: 0,
                                                playerMatchReportingEnabled = playerMatchReportingMode == "on"
                                            )
                                        )
                                    },
                                    enabled = !state.isMutating
                                ) {
                                    Text("Save settings")
                                }
                                Button(
                                    onClick = {
                                        detail.startggEventUrl?.takeIf { it.isNotBlank() }?.let { eventUrl ->
                                            controller.importStartggEvent(
                                                tournamentId = tournamentId,
                                                eventUrl = eventUrl,
                                                syncResults = true,
                                                preserveTournamentTitle = false
                                            )
                                        }
                                    },
                                    enabled = !state.isMutating && !detail.startggEventUrl.isNullOrBlank()
                                ) {
                                    Text("Reimport bracket")
                                }
                            }
                        }
                    } else {
                        item { FormField(value = title, onValueChange = { title = it }, label = "Tournament name") }
                        item { FormField(value = gameTitle, onValueChange = { gameTitle = it }, label = "Game") }
                        item { FormField(value = description, onValueChange = { description = it }, label = "Description", minLines = 3) }
                        item { FormField(value = platform, onValueChange = { platform = it }, label = "Platform") }
                        item {
                            FormField(
                                value = maxParticipantsText,
                                onValueChange = { maxParticipantsText = it },
                                label = if (detail.teamSize > 1) "Maximum teams" else "Maximum participants",
                                keyboardType = KeyboardType.Number
                            )
                        }
                        item {
                            SegmentedChoiceRow(
                                title = "Bracket mode",
                                options = if (detail.teamSize > 1) listOf("STANDARD" to "Standard teams") else listOf(
                                    "STANDARD" to "Standard",
                                    "MKART" to "MKART", "FORTNITE" to "Fortnite"
                                ),
                                selected = bracketMode,
                                onSelect = { bracketMode = it }
                            )
                        }
                        if (bracketMode == "FORTNITE") item {
                            FortniteConfiguration(fortniteLobbySize, fortniteGamesPerRound) { size, games ->
                                fortniteLobbySize = size; fortniteGamesPerRound = games
                            }
                            Text("Seats and games can be changed before drawing groups.")
                        }
                        if (bracketMode != "FORTNITE") item {
                            SegmentedChoiceRow(
                                title = "Format",
                                options = listOf(
                                    "SINGLE_ELIMINATION" to "Elim. simple",
                                    "DOUBLE_ELIMINATION" to "Doble elim."
                                ),
                                selected = format,
                                onSelect = { format = it }
                            )
                        }
                        if (bracketMode != "FORTNITE") item {
                            if (bracketMode == "MKART") {
                                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    SegmentedChoiceRow(
                                        title = "Main bracket",
                                        options = listOf("1" to "MKART pasa 1", "2" to "MKART pasa 2"),
                                        selected = mkartAdvanceMode,
                                        onSelect = { mkartAdvanceMode = it }
                                    )
                                    if (format == "DOUBLE_ELIMINATION") {
                                        SegmentedChoiceRow(
                                            title = "Losers bracket",
                                            options = listOf("1" to "MKART pasa 1", "2" to "MKART pasa 2"),
                                            selected = mkartLosersAdvanceMode,
                                            onSelect = { mkartLosersAdvanceMode = it }
                                        )
                                    }
                                }
                            } else if (format == "DOUBLE_ELIMINATION") {
                                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    SegmentedChoiceRow(
                                        title = "Winners series",
                                        options = listOf("1" to "Bo1", "3" to "Bo3", "5" to "Bo5"),
                                        selected = winnersBestOfText,
                                        onSelect = { winnersBestOfText = it }
                                    )
                                    SegmentedChoiceRow(
                                        title = "Losers series",
                                        options = listOf("1" to "Bo1", "3" to "Bo3", "5" to "Bo5"),
                                        selected = losersBestOfText,
                                        onSelect = { losersBestOfText = it }
                                    )
                                }
                            } else {
                                SegmentedChoiceRow(
                                    title = "Series",
                                    options = listOf("1" to "Bo1", "3" to "Bo3", "5" to "Bo5"),
                                    selected = winnersBestOfText,
                                    onSelect = { winnersBestOfText = it }
                                )
                            }
                        }
                        item {
                            SegmentedChoiceRow(
                                title = "Seeding",
                                options = listOf("MANUAL" to "Manual", "RANDOM" to "Random"),
                                selected = seedingMethod,
                                onSelect = { seedingMethod = it }
                            )
                        }
                        item {
                            FormField(
                                value = callTimeoutText,
                                onValueChange = { callTimeoutText = it.filter(Char::isDigit) },
                                label = "Call timeout in minutes",
                                keyboardType = KeyboardType.Number
                            )
                        }
                        item {
                            FormField(
                                value = setupCountText,
                                onValueChange = { setupCountText = it.filter(Char::isDigit) },
                                label = "Setup count",
                                keyboardType = KeyboardType.Number
                            )
                            SegmentedChoiceRow("Stream", listOf("0" to "No stream", "1" to "1 stream", "2" to "2 streams"), streamCountText) { streamCountText = it }
                            Button(onClick = { controller.updateSetups(tournamentId, setupCountText.toIntOrNull() ?: detail.setupCount, streamCountText.toIntOrNull() ?: 0) }, enabled = !state.isMutating) { Text("Save setups and streams") }
                        }
                        item {
                            FormField(
                                value = playAreaName,
                                onValueChange = { playAreaName = it.take(80) },
                                label = "Play area (optional)"
                            )
                        }
                        item {
                            Button(
                                onClick = {
                                    controller.updateTournament(
                                        tournamentId = tournamentId,
                                        detail = detail.copy(
                                            title = title,
                                            game = gameTitle,
                                            description = description,
                                            platform = platform,
                                            maxParticipants = maxParticipantsText.toIntOrNull() ?: detail.maxParticipants,
                                            rawFormat = format,
                                            bracketMode = bracketMode,
                                            fortniteLobbySize = fortniteLobbySize,
                                            fortniteGamesPerRound = fortniteGamesPerRound,
                                            mkartAdvanceCount = mkartAdvanceMode.toIntOrNull() ?: detail.mkartAdvanceCount,
                                            mkartLosersAdvanceCount = if (format == "DOUBLE_ELIMINATION") {
                                                mkartLosersAdvanceMode.toIntOrNull() ?: detail.mkartLosersAdvanceCount
                                            } else {
                                                mkartAdvanceMode.toIntOrNull() ?: detail.mkartAdvanceCount
                                            },
                                            format = formatLabel(
                                                format = format,
                                                bracketMode = bracketMode,
                                                mkartAdvanceCount = mkartAdvanceMode.toIntOrNull() ?: detail.mkartAdvanceCount,
                                                mkartLosersAdvanceCount = if (format == "DOUBLE_ELIMINATION") {
                                                    mkartLosersAdvanceMode.toIntOrNull() ?: detail.mkartLosersAdvanceCount
                                                } else {
                                                    mkartAdvanceMode.toIntOrNull() ?: detail.mkartAdvanceCount
                                                },
                                                winnersBestOf = winnersBestOfText.toIntOrNull() ?: detail.winnersBestOf,
                                                losersBestOf = losersBestOfText.toIntOrNull() ?: detail.losersBestOf
                                            ),
                                            bestOf = winnersBestOfText.toIntOrNull() ?: detail.bestOf,
                                            winnersBestOf = winnersBestOfText.toIntOrNull() ?: detail.winnersBestOf,
                                            losersBestOf = if (format == "DOUBLE_ELIMINATION") {
                                                losersBestOfText.toIntOrNull() ?: detail.losersBestOf
                                            } else {
                                                winnersBestOfText.toIntOrNull() ?: detail.winnersBestOf
                                            },
                                            seedingMethod = seedingMethod,
                                            callTimeoutMinutes = callTimeoutText.toIntOrNull() ?: detail.callTimeoutMinutes,
                                            setupCount = setupCountText.toIntOrNull() ?: detail.setupCount,
                                            streamCount = streamCountText.toIntOrNull() ?: 0,
                                            playAreaName = playAreaName.trim().takeIf { it.isNotEmpty() }
                                        )
                                    )
                                },
                                enabled = !state.isMutating
                            ) {
                                Text("Save options")
                            }
                        }
                    }
                }

                if (detail.isStartggMirrored) {
                    item(key = "LADDER") {
                        CollapsibleHeader(
                            title = "Internal ladder",
                            expanded = showLadder,
                            onToggle = { showLadder = !showLadder }
                        )
                    }
                    if (showLadder) {
                        item {
                            LadderManagementPanel(
                                tournamentId = detail.id,
                                participants = detail.participants.map { it.id to it.displayName },
                                ladder = detail.ladder,
                                isBusy = state.isMutating,
                                onStart = { controller.startLadder(tournamentId) },
                                onFinalize = { controller.finalizeLadder(tournamentId) }
                            )
                        }
                    }
                }

                if (!detail.isStartggMirrored) {
                    item(key = "PARTICIPANTS") {
                        CollapsibleHeader(
                            title = if (detail.teamSize > 1) "Teams and seeds" else "Players added",
                            expanded = showParticipants,
                            onToggle = { showParticipants = !showParticipants }
                        )
                    }
                    if (showParticipants) {
                        item { FormField(value = participantName, onValueChange = { participantName = it }, label = if (detail.teamSize > 1) "Team name" else "Player name") }
                        item {
                            Button(
                                onClick = {
                                    controller.addParticipant(
                                        tournamentId = tournamentId,
                                        input = AddParticipantInput(displayName = participantName, seed = null)
                                    )
                                    participantName = ""
                                },
                                enabled = canChangeEntrants && participantName.isNotBlank() && !state.isMutating && (detail.teamSize == 1 || detail.matches.isEmpty())
                            ) {
                                Text(if (detail.teamSize > 1) "Add team" else "Add player")
                            }
                        }
                        if (detail.participants.isEmpty()) {
                            item { InfoCard(if (detail.teamSize > 1) "No teams" else "No players", "No registrations yet.") }
                        } else {
                            items(detail.participants) { participant ->
                                EditableParticipantCard(
                                    participant = participant,
                                    isBusy = state.isMutating || (detail.bracketMode == "FORTNITE" && !canChangeEntrants),
                                    canChangeSeed = canChangeEntrants,
                                    onSave = { displayName, seed ->
                                        controller.updateParticipant(
                                            tournamentId = tournamentId,
                                            participantId = participant.id,
                                            displayName = displayName,
                                            seed = seed
                                        )
                                    },
                                    onDelete = {
                                        controller.deleteParticipant(
                                            tournamentId = tournamentId,
                                            participantId = participant.id
                                        )
                                    }
                                )
                            }
                        }
                    }

                    item {
                        CollapsibleHeader(
                            title = "Seeding before start",
                            expanded = showSeeding,
                            onToggle = { showSeeding = !showSeeding }
                        )
                    }
                    if (showSeeding) {
                        item {
                            InfoCard(
                                "Seed management",
                                if (canChangeEntrants) "Changing entrants or seeds invalidates prepared matches: you will need to generate the bracket again."
                                else "Entrants and seeds are locked. Reset the tournament to change them."
                            )
                        }
                        if (detail.participants.isEmpty()) {
                            item { InfoCard("No players", "Add players before assigning seeds.") }
                        } else {
                            items(detail.participants) { participant ->
                                SeedRow(
                                    participant = participant,
                                    isBusy = state.isMutating || !canChangeEntrants,
                                    onSaveSeed = { seed ->
                                        controller.updateParticipant(
                                            tournamentId = tournamentId,
                                            participantId = participant.id,
                                            displayName = participant.displayName,
                                            seed = seed
                                        )
                                    }
                                )
                            }
                        }
                    }
                }

                item(key = "BRACKET") {
                    CollapsibleHeader(
                        title = if (detail.bracketMode == "FORTNITE") "Fortnite: view groups in its panel" else "Tournament bracket",
                        expanded = showBracket,
                        onToggle = { showBracket = !showBracket }
                    )
                }
                if (showBracket && detail.bracketMode != "FORTNITE") {
                    if (detail.matches.isEmpty()) {
                        item {
                            InfoCard(
                                "No bracket",
                                if (detail.isStartggMirrored) {
                                    "No bracket has been imported yet. Use Reimport bracket to reload it."
                                } else {
                                    "Add at least two players and select Generate bracket."
                                }
                            )
                        }
                    } else {
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                SegmentedChoiceRow(
                                    title = "Bracket rendering",
                                    options = listOf("experimental" to "Modern", "actual" to "Classic"),
                                    selected = bracketRenderer,
                                    onSelect = { bracketRenderer = it }
                                )
                                if (bracketRenderer == "experimental") {
                                    ExperimentalBracketBoard(
                                        matches = detail.matches,
                                        hideAutomaticAdvances = !detail.isStartggMirrored
                                    )
                                } else {
                                    BracketBoard(
                                        matches = detail.matches,
                                        hideAutomaticAdvances = !detail.isStartggMirrored
                                    )
                                }
                            }
                        }
                    }
                }

                item {
                    CollapsibleHeader(
                        title = "Tournament setups",
                        expanded = showSetups,
                        onToggle = { showSetups = !showSetups }
                    )
                }
                if (showSetups) {
                    val setups = buildTournamentSetups(detail)
                    if (setups.isEmpty()) {
                        item { InfoCard("No setups", "This tournament has no setups configured yet.") }
                    } else {
                        val occupiedSetups = setups.filter { it.occupyingMatchLabel != null }
                        val freeSetups = setups.filter { it.occupyingMatchLabel == null }
                        item { SectionTitle("Occupied setups") }
                        if (occupiedSetups.isEmpty()) {
                            item { InfoCard("No occupied setups", "No setups are currently occupied.") }
                        } else {
                            items(occupiedSetups) { setup ->
                                InfoCard(
                                    title = setup.label,
                                    body = "Status: In use\nMatch: ${setup.occupyingMatchLabel}\nSet: ${setup.occupyingParticipants}"
                                )
                            }
                        }
                        item { SectionTitle("Available setups") }
                        if (freeSetups.isEmpty()) {
                            item { InfoCard("No available destinations", "All setups and streams are currently occupied.") }
                        } else {
                            items(freeSetups) { setup ->
                                InfoCard(
                                    title = setup.label,
                                    body = "Status: Available"
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    } // withReviewAnchors

    if (showStartggImportDialog) {
        AlertDialog(
            onDismissRequest = {
                if (!startggPreviewLoading && !state.isMutating) {
                    showStartggImportDialog = false
                }
            },
            title = { Text("Import from start.gg") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        text = "Paste the start.gg event link to import players and public seeds.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedTextField(
                        value = startggEventUrl,
                        onValueChange = { startggEventUrl = it },
                        label = { Text("Event URL") },
                        enabled = !startggPreviewLoading && !state.isMutating,
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2
                    )
                    Text("The import will continue on the server even if you lock your phone.")
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        controller.importStartggEvent(
                            tournamentId = tournamentId,
                            eventUrl = startggEventUrl.trim(),
                            syncResults = true,
                            preserveTournamentTitle = false
                        )
                        showStartggImportDialog = false
                    },
                    enabled = startggEventUrl.isNotBlank() && !state.isMutating
                ) {
                    Text("Import")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showStartggImportDialog = false },
                    enabled = !startggPreviewLoading && !state.isMutating
                ) {
                    Text("Cancel")
                }
            }
        )
    }

    if (showGenerateBracketResetDialog) {
        AlertDialog(
            onDismissRequest = { showGenerateBracketResetDialog = false },
            title = { Text(if (state.detail?.bracketMode == "FORTNITE") "Reset Fortnite" else if (resetOnly) "Reset tournament" else "Regenerate bracket") },
            text = { Text(if (state.detail?.bracketMode == "FORTNITE") "Groups, score sheets and points will be deleted. Entrants are kept. You can draw new groups in the Fortnite panel." else if (resetOnly) "The bracket and results will be deleted. Registrations and team rosters are kept." else "Continuing resets the tournament and regenerates the bracket. This deletes current progress.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showGenerateBracketResetDialog = false
                        if (resetOnly || state.detail?.bracketMode == "FORTNITE") controller.resetTournament(tournamentId) else controller.resetAndGenerateBracket(tournamentId)
                    },
                    enabled = !state.isMutating
                ) {
                    Text("Confirm")
                }
            },
            dismissButton = {
                TextButton(onClick = { showGenerateBracketResetDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun TournamentOperationsScreen(
    tournamentId: String,
    onBack: () -> Unit
) {
    val controller = remember { TournamentDetailController() }
    val state = controller.state
    val latestIsMutating by rememberUpdatedState(state.isMutating)
    var showCompletedMatches by rememberSaveable { mutableStateOf(false) }
    var operationsSearchQuery by rememberSaveable(tournamentId) { mutableStateOf("") }
    var completedSearchQuery by rememberSaveable(tournamentId) { mutableStateOf("") }

    LaunchedEffect(tournamentId) {
        controller.load(tournamentId)
    }
    LaunchedEffect(tournamentId) {
        while (true) {
            delay(2000)
            if (!latestIsMutating) {
                controller.load(tournamentId, silent = true)
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Button(onClick = onBack) {
            Text("Back")
        }
        when {
            state.isLoading -> LoadingCard()
            state.errorMessage != null && state.detail == null -> InfoCard("Error", state.errorMessage ?: "")
            state.detail?.bracketMode == "FORTNITE" -> {
                SectionTitle("Fortnite · ${state.detail.title}")
                FortnitePanelButton(tournamentId)
                Text("Manage games and points for each group in the Fortnite panel.")
            }
            state.detail != null -> {
                val detail = state.detail
                state.errorMessage?.let { InfoCard("Error", it) }
                val tournamentStarted = (detail.isStartggMirrored || isTournamentStarted(detail.status)) && detail.status != "IMPORTING"
                val visibleOperationalMatches = detail.matches
                    .filterNot { isDormantGrandFinalReset(detail.matches, it) }
                val completedMatches = visibleOperationalMatches
                    .filter { it.status == "COMPLETED" || it.status == "WALKOVER" }
                    .sortedWith(compareBy<MatchSummary>({ it.bracketStage }, { it.roundNumber }, { it.matchNumber }))
                val activeMatches = visibleOperationalMatches
                    .filterNot { it.status == "COMPLETED" || it.status == "WALKOVER" }
                    .sortedWith(
                        compareBy<MatchSummary>(
                            { activeMatchPriority(it) },
                            { activeMatchTimelineAnchor(it) ?: Long.MAX_VALUE },
                            { it.bracketStage },
                            { it.roundNumber },
                            { it.matchNumber },
                        ),
                    )
                    .filter { hasResolvedContenders(it) }
                val filteredActiveMatches = activeMatches.filter { matchMatchesPlayerQuery(it, operationsSearchQuery) }
                val activePoolSections = buildActivePoolSections(filteredActiveMatches)
                val filteredCompletedMatches = completedMatches.filter { matchMatchesPlayerQuery(it, completedSearchQuery) }
                val completedSections = buildCompletedMatchSections(filteredCompletedMatches)
                val hasConcurrentPools = activePoolSections.size > 1
                val modernSelectableMatchIds = remember(visibleOperationalMatches, tournamentStarted, detail.isStartggMirrored) {
                    visibleOperationalMatches
                        .filter { operationsModernCanInteractWithMatch(it, tournamentStarted, detail.isStartggMirrored) }
                        .mapTo(linkedSetOf()) { it.id }
                }
                val expandedPools = remember(tournamentId) { mutableStateMapOf<String, Boolean>() }
                val expandedCompletedSections = remember(tournamentId) { mutableStateMapOf<String, Boolean>() }
                var operationsRenderMode by rememberSaveable(tournamentId) { mutableStateOf(OperationsRenderMode.Classic.key) }
                var modernBracketFullscreen by remember(tournamentId) { mutableStateOf(false) }
                var selectedModernMatchId by rememberSaveable(tournamentId) { mutableStateOf<String?>(null) }
                val selectedModernMatch = selectedModernMatchId?.let { selectedId ->
                    visibleOperationalMatches.firstOrNull { it.id == selectedId }
                }
                SectionTitle("Match operations - ${detail.title}")
                TournamentActivityButton(detail.id)
                detail.importProgress?.let { Text(it) }
                InfoCard(
                    title = "Tournament status",
                    body = "${mainStatusLabel(detail.status)}\n${detail.format}\n${activeMatches.size} active · ${completedMatches.size} completed"
                )

                if (visibleOperationalMatches.isEmpty()) {
                    InfoCard("No matches", "Generate the bracket from the tournament screen first.")
                } else {
                    OperationsRenderModeRow(
                        selectedMode = operationsRenderMode,
                        onModeSelected = { operationsRenderMode = it }
                    )
                    if (adaptiveManagementPresentation) {
                        AdaptiveMatchLayout(selectedModernMatch != null, forceDialog = modernBracketFullscreen, content = {
                            if (operationsRenderMode == OperationsRenderMode.Modern.key) {
                                ExperimentalBracketBoard(matches = visibleOperationalMatches, callTimeoutMinutes = detail.callTimeoutMinutes,
                                    selectableMatchIds = modernSelectableMatchIds, onMatchSelected = { selectedModernMatchId = it }, errorMessage = state.errorMessage,
                                    onFullscreenChanged = { modernBracketFullscreen = it })
                            } else {
                                OutlinedTextField(operationsSearchQuery, { operationsSearchQuery = it }, label = { Text("Find player, team or match") }, modifier = Modifier.fillMaxWidth())
                                CollapsibleHeader("Completed (${completedMatches.size})", showCompletedMatches) { showCompletedMatches = !showCompletedMatches }
                                val rows = if (showCompletedMatches) completedMatches.filter { matchMatchesPlayerQuery(it, operationsSearchQuery) } else filteredActiveMatches
                                if (rows.isEmpty()) Text("No matches match this search.")
                                rows.forEach { match -> key(match.id) {
                                    CompactMatchRow(match.poolAwareLabel, match.participantNames, match.participantScores, match.status, match.stationLabel,
                                        selectedModernMatchId == match.id) { selectedModernMatchId = match.id }
                                } }
                            }
                        }, actions = { inline ->
                            selectedModernMatch?.let { match ->
                                ModernOperationsMatchDialog(tournamentId, detail, match, tournamentStarted, state.isMutating, controller,
                                    onDismiss = { selectedModernMatchId = null }, inline = inline)
                            }
                        })
                    } else if (operationsRenderMode == OperationsRenderMode.Modern.key) {
                        InfoCard(
                            title = "Modern match operations",
                            body = "Select any bracket match to open its actions."
                        )
                        ExperimentalBracketBoard(
                            matches = visibleOperationalMatches,
                            callTimeoutMinutes = detail.callTimeoutMinutes,
                            selectableMatchIds = modernSelectableMatchIds,
                            onMatchSelected = { selectedModernMatchId = it },
                            errorMessage = state.errorMessage,
                        )
                        if (selectedModernMatch != null) {
                            ModernOperationsMatchDialog(
                                tournamentId = tournamentId,
                                detail = detail,
                                match = selectedModernMatch,
                                tournamentStarted = tournamentStarted,
                                isBusy = state.isMutating,
                                controller = controller,
                                onDismiss = { selectedModernMatchId = null }
                            )
                        }
                    } else {
                    OutlinedTextField(
                        value = operationsSearchQuery,
                        onValueChange = { operationsSearchQuery = it },
                        label = { Text("Find player in match operations") },
                        modifier = Modifier.fillMaxWidth(),
                        textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface)
                    )
                    if (completedMatches.isNotEmpty()) {
                        CollapsibleHeader(
                            title = "Completed matches (${completedMatches.size})",
                            expanded = showCompletedMatches,
                            onToggle = { showCompletedMatches = !showCompletedMatches }
                        )
                        if (showCompletedMatches) {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                OutlinedTextField(
                                    value = completedSearchQuery,
                                    onValueChange = { completedSearchQuery = it },
                                    label = { Text("Find completed match") },
                                    modifier = Modifier.fillMaxWidth(),
                                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface)
                                )
                                if (completedSections.isEmpty()) {
                                    InfoCard(
                                        title = "No results",
                                        body = "No completed matches match this search."
                                    )
                                } else {
                                    completedSections.forEach { section ->
                                        val expanded = expandedCompletedSections[section.key] ?: false
                                        CollapsibleHeader(
                                            title = "${section.label} (${section.matches.size})",
                                            expanded = expanded,
                                            onToggle = { expandedCompletedSections[section.key] = !expanded }
                                        )
                                        if (expanded) {
                                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                                section.matches.forEach { match ->
                                                    key("completed_${section.key}_${match.id}") {
                                                        OperationsMatchCard(
                                                            match = match,
                                                            timeoutMinutes = detail.callTimeoutMinutes,
                                                            tournamentStarted = tournamentStarted,
                                                            isBusy = state.isMutating,
                                                            availableSetups = availableSetupLabelsForMatch(detail, match),
                                                            onCall = { _ -> },
                                                            onCancelCall = {},
                                                            onStart = {},
                                                            onResolveAbsence = { outcome ->
                                                                controller.resolveAbsence(
                                                                    tournamentId = tournamentId,
                                                                    matchId = match.id,
                                                                    outcome = outcome
                                                                )
                                                            },
                                                            isStartggMirrored = detail.isStartggMirrored,
                                                            supportsCharacterReporting = detail.supportsSmashCharacterReporting,
                                                            onSaveCharacters = { selections ->
                                                                controller.updateMatchCharacters(
                                                                    tournamentId = tournamentId,
                                                                    matchId = match.id,
                                                                    selections = selections
                                                                )
                                                            },
                                                            onSaveCharactersAndRecordGameWin = { participantId, selections ->
                                                                controller.updateMatchCharactersAndRecordGameWin(
                                                                    tournamentId = tournamentId,
                                                                    matchId = match.id,
                                                                    participantId = participantId,
                                                                    selections = selections
                                                                )
                                                            },
                                                            onSaveCharactersAndReportWinner = { participantId, selections ->
                                                                controller.updateMatchCharactersAndReportWinner(
                                                                    tournamentId = tournamentId,
                                                                    matchId = match.id,
                                                                    winnerParticipantId = participantId,
                                                                    selections = selections
                                                                )
                                                            },
                                                            onReportDetailedResult = { bestOfOverride, games, onComplete ->
                                                                controller.reportDetailedResult(
                                                                    tournamentId = tournamentId,
                                                                    matchId = match.id,
                                                                    bestOfOverride = bestOfOverride,
                                                                    games = games, onComplete = onComplete
                                                                )
                                                            },
                                                            onSelectMkartAdvancer = { participantId ->
                                                                controller.selectMarioKartAdvancer(
                                                                    tournamentId = tournamentId,
                                                                    matchId = match.id,
                                                                    participantId = participantId
                                                                )
                                                            },
                                                            onRecordGameWin = { participantId ->
                                                                controller.recordGameWin(
                                                                    tournamentId = tournamentId,
                                                                    matchId = match.id,
                                                                    participantId = participantId
                                                                )
                                                            },
                                                            onReportWinner = { participantId ->
                                                                controller.reportWinner(
                                                                    tournamentId = tournamentId,
                                                                    matchId = match.id,
                                                                    winnerParticipantId = participantId
                                                                )
                                                            },
                                                            onReset = {
                                                                controller.resetMatch(
                                                                    tournamentId = tournamentId,
                                                                    matchId = match.id
                                                                )
                                                            }
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if (filteredActiveMatches.isNotEmpty()) {
                        SectionTitle("Active and pending matches")
                    }
                    if (!tournamentStarted) {
                        InfoCard("Tournament has not started", "Generate the bracket and select Start tournament before operating matches.")
                    }
                    if (hasConcurrentPools) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            activePoolSections.forEach { section ->
                                val expanded = expandedPools[section.key] ?: false
                                CollapsibleHeader(
                                    title = "${section.label} (${section.matches.size})",
                                    expanded = expanded,
                                    onToggle = { expandedPools[section.key] = !expanded }
                                )
                                if (expanded) {
                                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                        section.matches.forEach { match ->
                                            key("active_${section.key}_${match.id}") {
                                                OperationsMatchCard(
                                                    match = match,
                                                    timeoutMinutes = detail.callTimeoutMinutes,
                                                    tournamentStarted = tournamentStarted,
                                                    isBusy = state.isMutating,
                                                    availableSetups = availableSetupLabelsForMatch(detail, match),
                                                    onCall = { stationNumber ->
                                                        controller.callMatch(
                                                            tournamentId = tournamentId,
                                                            matchId = match.id,
                                                            stationLabel = stationNumber
                                                        )
                                                    },
                                                    onCancelCall = {
                                                        controller.cancelCall(
                                                            tournamentId = tournamentId,
                                                            matchId = match.id
                                                        )
                                                    },
                                                    onStart = {
                                                        controller.startMatch(
                                                            tournamentId = tournamentId,
                                                            matchId = match.id
                                                        )
                                                    },
                                                    onResolveAbsence = { outcome ->
                                                        controller.resolveAbsence(
                                                            tournamentId = tournamentId,
                                                            matchId = match.id,
                                                            outcome = outcome
                                                        )
                                                    },
                                                    isStartggMirrored = detail.isStartggMirrored,
                                                    supportsCharacterReporting = detail.supportsSmashCharacterReporting,
                                                    onSaveCharacters = { selections ->
                                                        controller.updateMatchCharacters(
                                                            tournamentId = tournamentId,
                                                            matchId = match.id,
                                                            selections = selections
                                                        )
                                                    },
                                                    onSaveCharactersAndRecordGameWin = { participantId, selections ->
                                                        controller.updateMatchCharactersAndRecordGameWin(
                                                            tournamentId = tournamentId,
                                                            matchId = match.id,
                                                            participantId = participantId,
                                                            selections = selections
                                                        )
                                                    },
                                                    onSaveCharactersAndReportWinner = { participantId, selections ->
                                                        controller.updateMatchCharactersAndReportWinner(
                                                            tournamentId = tournamentId,
                                                            matchId = match.id,
                                                            winnerParticipantId = participantId,
                                                            selections = selections
                                                        )
                                                    },
                                                    onReportDetailedResult = { bestOfOverride, games, onComplete ->
                                                        controller.reportDetailedResult(
                                                            tournamentId = tournamentId,
                                                            matchId = match.id,
                                                            bestOfOverride = bestOfOverride,
                                                            games = games, onComplete = onComplete
                                                        )
                                                    },
                                                    onSelectMkartAdvancer = { participantId ->
                                                        controller.selectMarioKartAdvancer(
                                                            tournamentId = tournamentId,
                                                            matchId = match.id,
                                                            participantId = participantId
                                                        )
                                                    },
                                                    onRecordGameWin = { participantId ->
                                                        controller.recordGameWin(
                                                            tournamentId = tournamentId,
                                                            matchId = match.id,
                                                            participantId = participantId
                                                        )
                                                    },
                                                    onReportWinner = { participantId ->
                                                        controller.reportWinner(
                                                            tournamentId = tournamentId,
                                                            matchId = match.id,
                                                            winnerParticipantId = participantId
                                                        )
                                                    },
                                                    onReset = {
                                                        controller.resetMatch(
                                                            tournamentId = tournamentId,
                                                            matchId = match.id
                                                        )
                                                    }
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        filteredActiveMatches.forEach { match ->
                            key("active_${match.id}") {
                                OperationsMatchCard(
                                    match = match,
                                    timeoutMinutes = detail.callTimeoutMinutes,
                                    tournamentStarted = tournamentStarted,
                                    isBusy = state.isMutating,
                                    availableSetups = availableSetupLabelsForMatch(detail, match),
                                    onCall = { stationNumber ->
                                        controller.callMatch(
                                            tournamentId = tournamentId,
                                            matchId = match.id,
                                            stationLabel = stationNumber
                                        )
                                    },
                                    onCancelCall = {
                                        controller.cancelCall(
                                            tournamentId = tournamentId,
                                            matchId = match.id
                                        )
                                    },
                                    onStart = {
                                        controller.startMatch(
                                            tournamentId = tournamentId,
                                            matchId = match.id
                                        )
                                    },
                                    onResolveAbsence = { outcome ->
                                        controller.resolveAbsence(
                                            tournamentId = tournamentId,
                                            matchId = match.id,
                                            outcome = outcome
                                        )
                                    },
                                    isStartggMirrored = detail.isStartggMirrored,
                                    supportsCharacterReporting = detail.supportsSmashCharacterReporting,
                                    onSaveCharacters = { selections ->
                                        controller.updateMatchCharacters(
                                            tournamentId = tournamentId,
                                            matchId = match.id,
                                            selections = selections
                                        )
                                    },
                                    onSaveCharactersAndRecordGameWin = { participantId, selections ->
                                        controller.updateMatchCharactersAndRecordGameWin(
                                            tournamentId = tournamentId,
                                            matchId = match.id,
                                            participantId = participantId,
                                            selections = selections
                                        )
                                    },
                                    onSaveCharactersAndReportWinner = { participantId, selections ->
                                        controller.updateMatchCharactersAndReportWinner(
                                            tournamentId = tournamentId,
                                            matchId = match.id,
                                            winnerParticipantId = participantId,
                                            selections = selections
                                        )
                                    },
                                    onReportDetailedResult = { bestOfOverride, games, onComplete ->
                                        controller.reportDetailedResult(
                                            tournamentId = tournamentId,
                                            matchId = match.id,
                                            bestOfOverride = bestOfOverride,
                                            games = games, onComplete = onComplete
                                        )
                                    },
                                    onSelectMkartAdvancer = { participantId ->
                                        controller.selectMarioKartAdvancer(
                                            tournamentId = tournamentId,
                                            matchId = match.id,
                                            participantId = participantId
                                        )
                                    },
                                    onRecordGameWin = { participantId ->
                                        controller.recordGameWin(
                                            tournamentId = tournamentId,
                                            matchId = match.id,
                                            participantId = participantId
                                        )
                                    },
                                    onReportWinner = { participantId ->
                                        controller.reportWinner(
                                            tournamentId = tournamentId,
                                            matchId = match.id,
                                            winnerParticipantId = participantId
                                        )
                                    },
                                    onReset = {
                                        controller.resetMatch(
                                            tournamentId = tournamentId,
                                            matchId = match.id
                                        )
                                    }
                                )
                            }
                        }
                    }
                    if (filteredActiveMatches.isEmpty()) {
                        InfoCard("No results", "No pending matches match this search.")
                    }
                    }
                }
            }
        }
    }
}

@Composable
private fun OperationsRenderModeRow(
    selectedMode: String,
    onModeSelected: (String) -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OperationsRenderMode.entries.forEach { option ->
            val isSelected = selectedMode == option.key
            Button(
                onClick = { onModeSelected(option.key) },
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                ),
            ) {
                Text(if (isSelected) "[${option.label}]" else option.label)
            }
        }
    }
}

@Composable
private fun ModernOperationsMatchDialog(
    tournamentId: String,
    detail: TournamentDetail,
    match: MatchSummary,
    tournamentStarted: Boolean,
    isBusy: Boolean,
    controller: TournamentDetailController,
    onDismiss: () -> Unit,
    inline: Boolean = false,
) {
    val canOperateCalls = match.status != "COMPLETED" && match.status != "WALKOVER"
    if (adaptiveManagementPresentation) {
        val body: @Composable () -> Unit = {
            MainMatchActionPanel(match.id, match.poolAwareLabel, onDismiss) {
                controller.state.errorMessage?.let { InfoCard("Error", it) }
                OperationsMatchCard(
                    match = match,
                    timeoutMinutes = detail.callTimeoutMinutes,
                    tournamentStarted = tournamentStarted,
                    isBusy = isBusy,
                    availableSetups = availableSetupLabelsForMatch(detail, match),
                    onCall = { stationNumber ->
                        if (canOperateCalls) {
                            controller.callMatch(
                                tournamentId = tournamentId,
                                matchId = match.id,
                                stationLabel = stationNumber
                            )
                        }
                    },
                    onCancelCall = {
                        if (canOperateCalls) {
                            controller.cancelCall(
                                tournamentId = tournamentId,
                                matchId = match.id
                            )
                        }
                    },
                    onStart = {
                        if (canOperateCalls) {
                            controller.startMatch(
                                tournamentId = tournamentId,
                                matchId = match.id
                            )
                        }
                    },
                    onResolveAbsence = { outcome ->
                        controller.resolveAbsence(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            outcome = outcome
                        )
                    },
                    isStartggMirrored = detail.isStartggMirrored,
                    supportsCharacterReporting = detail.supportsSmashCharacterReporting,
                    onSaveCharacters = { selections ->
                        controller.updateMatchCharacters(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            selections = selections
                        )
                    },
                    onSaveCharactersAndRecordGameWin = { participantId, selections ->
                        controller.updateMatchCharactersAndRecordGameWin(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            participantId = participantId,
                            selections = selections
                        )
                    },
                    onSaveCharactersAndReportWinner = { participantId, selections ->
                        controller.updateMatchCharactersAndReportWinner(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            winnerParticipantId = participantId,
                            selections = selections
                        )
                    },
                    onReportDetailedResult = { bestOfOverride, games, onComplete ->
                        controller.reportDetailedResult(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            bestOfOverride = bestOfOverride,
                            games = games, onComplete = onComplete
                        )
                    },
                    onSelectMkartAdvancer = { participantId ->
                        controller.selectMarioKartAdvancer(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            participantId = participantId
                        )
                    },
                    onRecordGameWin = { participantId ->
                        controller.recordGameWin(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            participantId = participantId
                        )
                    },
                    onReportWinner = { participantId ->
                        controller.reportWinner(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            winnerParticipantId = participantId
                        )
                    },
                    onReset = {
                        controller.resetMatch(
                            tournamentId = tournamentId,
                            matchId = match.id
                        )
                    }
                )
            }
        }
        if (inline) body() else Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Box(Modifier.padding(12.dp)) { body() }
        }
        return
    }
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
                .heightIn(max = 760.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = surfaceCardBorder(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Match operations", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text(match.poolAwareLabel, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = onDismiss) {
                        Text("Close")
                    }
                }
                controller.state.errorMessage?.let { InfoCard("Error", it) }
                OperationsMatchCard(
                    match = match,
                    timeoutMinutes = detail.callTimeoutMinutes,
                    tournamentStarted = tournamentStarted,
                    isBusy = isBusy,
                    availableSetups = availableSetupLabelsForMatch(detail, match),
                    onCall = { stationNumber ->
                        if (canOperateCalls) {
                            controller.callMatch(
                                tournamentId = tournamentId,
                                matchId = match.id,
                                stationLabel = stationNumber
                            )
                        }
                    },
                    onCancelCall = {
                        if (canOperateCalls) {
                            controller.cancelCall(
                                tournamentId = tournamentId,
                                matchId = match.id
                            )
                        }
                    },
                    onStart = {
                        if (canOperateCalls) {
                            controller.startMatch(
                                tournamentId = tournamentId,
                                matchId = match.id
                            )
                        }
                    },
                    onResolveAbsence = { outcome ->
                        controller.resolveAbsence(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            outcome = outcome
                        )
                    },
                    isStartggMirrored = detail.isStartggMirrored,
                    supportsCharacterReporting = detail.supportsSmashCharacterReporting,
                    onSaveCharacters = { selections ->
                        controller.updateMatchCharacters(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            selections = selections
                        )
                    },
                    onSaveCharactersAndRecordGameWin = { participantId, selections ->
                        controller.updateMatchCharactersAndRecordGameWin(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            participantId = participantId,
                            selections = selections
                        )
                    },
                    onSaveCharactersAndReportWinner = { participantId, selections ->
                        controller.updateMatchCharactersAndReportWinner(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            winnerParticipantId = participantId,
                            selections = selections
                        )
                    },
                    onReportDetailedResult = { bestOfOverride, games, onComplete ->
                        controller.reportDetailedResult(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            bestOfOverride = bestOfOverride,
                            games = games, onComplete = onComplete
                        )
                    },
                    onSelectMkartAdvancer = { participantId ->
                        controller.selectMarioKartAdvancer(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            participantId = participantId
                        )
                    },
                    onRecordGameWin = { participantId ->
                        controller.recordGameWin(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            participantId = participantId
                        )
                    },
                    onReportWinner = { participantId ->
                        controller.reportWinner(
                            tournamentId = tournamentId,
                            matchId = match.id,
                            winnerParticipantId = participantId
                        )
                    },
                    onReset = {
                        controller.resetMatch(
                            tournamentId = tournamentId,
                            matchId = match.id
                        )
                    }
                )
            }
        }
    }
}

@Composable
internal fun CreateTournamentScreen(
    mode: CreateTournamentMode,
    onBack: () -> Unit,
    onCreated: (TournamentSummary) -> Unit
) {
    val controller = remember { CreateTournamentController() }
    val repository = remember { com.gestortorneos.app.data.TournamentRepository() }
    val scope = rememberCoroutineScope()
    val state = controller.state
    var title by rememberSaveable { mutableStateOf("") }
    var gameTitle by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var platform by rememberSaveable { mutableStateOf("PC") }
    var maxParticipantsText by rememberSaveable { mutableStateOf("16") }
    var fortniteLobbySize by rememberSaveable { mutableStateOf(20) }
    var fortniteGamesPerRound by rememberSaveable { mutableStateOf(3) }
    var teamSize by rememberSaveable { mutableStateOf(1) }
    var reserveCount by rememberSaveable { mutableStateOf(0) }
    var allowSoloRegistration by rememberSaveable { mutableStateOf(false) }
    var format by rememberSaveable { mutableStateOf("SINGLE_ELIMINATION") }
    var bracketMode by rememberSaveable { mutableStateOf("STANDARD") }
    var mkartAdvanceMode by rememberSaveable { mutableStateOf("1") }
    var mkartLosersAdvanceMode by rememberSaveable { mutableStateOf("1") }
    var winnersBestOfText by rememberSaveable { mutableStateOf("3") }
    var losersBestOfText by rememberSaveable { mutableStateOf("3") }
    var seedingMethod by rememberSaveable { mutableStateOf("MANUAL") }
    var callTimeoutText by rememberSaveable { mutableStateOf("10") }
    var setupCountText by rememberSaveable { mutableStateOf("1") }
    var streamCountText by rememberSaveable { mutableStateOf("0") }
    var playAreaName by rememberSaveable { mutableStateOf("") }
    var playerMatchReportingMode by rememberSaveable { mutableStateOf("on") }
    var startggEventUrl by rememberSaveable { mutableStateOf("") }
    var startggPreviewName by rememberSaveable { mutableStateOf<String?>(null) }
    var startggPreviewFormat by rememberSaveable { mutableStateOf<String?>(null) }
    var startggPreviewParticipants by remember { mutableStateOf<List<TournamentParticipantSummary>>(emptyList()) }
    var startggPreviewError by rememberSaveable { mutableStateOf<String?>(null) }
    var startggPreviewLoading by rememberSaveable { mutableStateOf(false) }

    val save: () -> Unit = {
        if (mode == CreateTournamentMode.Startgg) {
            controller.saveFromStartgg(
                eventUrl = startggEventUrl.trim(),
                callTimeoutMinutes = callTimeoutText.toIntOrNull() ?: 10,
                setupCount = setupCountText.toIntOrNull() ?: 1,
                streamCount = streamCountText.toIntOrNull() ?: 0,
                playerMatchReportingEnabled = playerMatchReportingMode == "on",
                onCreated = onCreated
            )
        } else {
            controller.save(
                input = CreateTournamentInput(
                    title = title,
                    gameTitle = gameTitle,
                    description = description,
                    platform = platform,
                    maxParticipants = maxParticipantsText.toIntOrNull() ?: 16,
                    fortniteLobbySize = fortniteLobbySize, fortniteGamesPerRound = fortniteGamesPerRound,
                    teamSize = teamSize,
                    reserveCount = reserveCount,
                    allowSoloRegistration = allowSoloRegistration,
                    format = format,
                    bracketMode = bracketMode,
                    mkartAdvanceCount = mkartAdvanceMode.toIntOrNull() ?: 1,
                    mkartLosersAdvanceCount = if (format == "DOUBLE_ELIMINATION") {
                        mkartLosersAdvanceMode.toIntOrNull() ?: (mkartAdvanceMode.toIntOrNull() ?: 1)
                    } else {
                        mkartAdvanceMode.toIntOrNull() ?: 1
                    },
                    bestOf = winnersBestOfText.toIntOrNull() ?: 3,
                    winnersBestOf = winnersBestOfText.toIntOrNull() ?: 3,
                    losersBestOf = if (format == "DOUBLE_ELIMINATION") {
                        losersBestOfText.toIntOrNull() ?: 3
                    } else {
                        winnersBestOfText.toIntOrNull() ?: 3
                    },
                    seedingMethod = seedingMethod,
                    callTimeoutMinutes = callTimeoutText.toIntOrNull() ?: 10,
                    setupCount = setupCountText.toIntOrNull() ?: 1,
                    streamCount = streamCountText.toIntOrNull() ?: 0,
                    playAreaName = playAreaName.trim().takeIf { it.isNotEmpty() }
                ),
                onCreated = onCreated
            )
        }
        }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = onBack) { Text("Cancel") }
                Button(
                    onClick = save,
                    enabled = if (mode == CreateTournamentMode.Startgg) {
                        !state.isSaving && startggEventUrl.isNotBlank()
                    } else {
                        !state.isSaving && title.isNotBlank() && gameTitle.isNotBlank() && description.isNotBlank()
                    }
                ) {
                    MainBusyLabel(if (state.isSaving) "Saving…" else if (mode == CreateTournamentMode.Startgg) "Import tournament" else "Create tournament", state.isSaving)
                }
            }
        }
        item { SectionTitle(mode.title) }
        if (mode == CreateTournamentMode.Startgg) {
            item {
                InfoCard(
                    title = "Import start.gg",
                    body = "This creates a mirror tournament using the format, bracket and settings from start.gg. You only need the event URL, call timeout, setup count and whether players can report their own sets."
                )
            }
            item {
                FormField(
                    value = startggEventUrl,
                    onValueChange = { startggEventUrl = it },
                    label = "start.gg event URL",
                    minLines = 3
                )
            }
            item {
                FormField(
                    value = callTimeoutText,
                    onValueChange = { callTimeoutText = it },
                    label = "Call timeout in minutes",
                    keyboardType = KeyboardType.Number
                )
            }
            item {
                FormField(
                    value = setupCountText,
                    onValueChange = { setupCountText = it.filter(Char::isDigit) },
                    label = "Setup count",
                    keyboardType = KeyboardType.Number
                )
                SegmentedChoiceRow("Stream", listOf("0" to "No stream", "1" to "1 stream", "2" to "2 streams"), streamCountText) { streamCountText = it }
            }
            item {
                SegmentedChoiceRow(
                    title = "Player reporting",
                    options = listOf("on" to "Enabled", "off" to "Disabled"),
                    selected = playerMatchReportingMode,
                    onSelect = { playerMatchReportingMode = it }
                )
            }
            item { InfoCard("Import", "You can lock your phone after starting the import. The tournament will update when it finishes.") }
        } else {
            item { FormField(value = title, onValueChange = { title = it }, label = "Tournament name") }
            item {
                LocalTournamentKind(if (teamSize > 1) "TEAMS" else bracketMode) { type ->
                    teamSize = if (type == "TEAMS") teamSize.takeIf { it > 1 } ?: 5 else 1
                    if (type != "TEAMS") { reserveCount = 0; allowSoloRegistration = false }
                    bracketMode = if (type == "TEAMS") "STANDARD" else type
                    if (type == "FORTNITE" && gameTitle.isBlank()) gameTitle = "Fortnite"
                }
            }
            if (teamSize > 1) item {
                TeamConfigurationFields(teamSize, reserveCount, allowSoloRegistration, showToggle = false) { size, reserves, solo ->
                    teamSize = size; reserveCount = reserves; allowSoloRegistration = solo
                }
            }
            if (bracketMode == "FORTNITE") item {
                FortniteConfiguration(fortniteLobbySize, fortniteGamesPerRound) { size, games -> fortniteLobbySize = size; fortniteGamesPerRound = games }
            }
            item { FormField(value = gameTitle, onValueChange = { gameTitle = it }, label = "Game") }
            item { FormField(value = description, onValueChange = { description = it }, label = "Description", minLines = 4) }
            item { FormField(value = platform, onValueChange = { platform = it }, label = "Platform") }
            item {
                FormField(
                    value = maxParticipantsText,
                    onValueChange = { maxParticipantsText = it },
                    label = if (teamSize > 1) "Maximum teams" else "Maximum participants",
                    keyboardType = KeyboardType.Number
                )
            }
            item { SectionTitle("Configuration") }
            if (bracketMode != "FORTNITE") item {
                SegmentedChoiceRow(
                    title = "Format",
                    options = listOf(
                        "SINGLE_ELIMINATION" to "Elim. simple",
                        "DOUBLE_ELIMINATION" to "Doble elim."
                    ),
                    selected = format,
                    onSelect = { format = it }
                )
            }
            if (bracketMode != "FORTNITE") item {
                if (bracketMode == "MKART") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        SegmentedChoiceRow(
                            title = "Main bracket",
                            options = listOf("1" to "MKART pasa 1", "2" to "MKART pasa 2"),
                            selected = mkartAdvanceMode,
                            onSelect = { mkartAdvanceMode = it }
                        )
                        if (format == "DOUBLE_ELIMINATION") {
                            SegmentedChoiceRow(
                                title = "Losers bracket",
                                options = listOf("1" to "MKART pasa 1", "2" to "MKART pasa 2"),
                                selected = mkartLosersAdvanceMode,
                                onSelect = { mkartLosersAdvanceMode = it }
                            )
                        }
                    }
                } else if (format == "DOUBLE_ELIMINATION") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        SegmentedChoiceRow(
                            title = "Winners series",
                            options = listOf("1" to "Bo1", "3" to "Bo3", "5" to "Bo5"),
                            selected = winnersBestOfText,
                            onSelect = { winnersBestOfText = it }
                        )
                        SegmentedChoiceRow(
                            title = "Losers series",
                            options = listOf("1" to "Bo1", "3" to "Bo3", "5" to "Bo5"),
                            selected = losersBestOfText,
                            onSelect = { losersBestOfText = it }
                        )
                    }
                } else {
                    SegmentedChoiceRow(
                        title = "Series",
                        options = listOf("1" to "Bo1", "3" to "Bo3", "5" to "Bo5"),
                        selected = winnersBestOfText,
                        onSelect = { winnersBestOfText = it }
                    )
                }
            }
            item {
                FormField(
                    value = callTimeoutText,
                    onValueChange = { callTimeoutText = it.filter(Char::isDigit) },
                    label = "Call timeout in minutes",
                    keyboardType = KeyboardType.Number
                )
            }
            item {
                FormField(
                    value = setupCountText,
                    onValueChange = { setupCountText = it.filter(Char::isDigit) },
                    label = "Setup count",
                    keyboardType = KeyboardType.Number
                )
                SegmentedChoiceRow("Stream", listOf("0" to "No stream", "1" to "1 stream", "2" to "2 streams"), streamCountText) { streamCountText = it }
            }
            item {
                FormField(
                    value = playAreaName,
                    onValueChange = { playAreaName = it.take(80) },
                    label = "Play area (optional)"
                )
            }
            item {
                SegmentedChoiceRow(
                    title = "Seeding",
                    options = listOf("MANUAL" to "Manual", "RANDOM" to "Random"),
                    selected = seedingMethod,
                    onSelect = { seedingMethod = it }
                )
            }
        }
        if (state.errorMessage != null) {
            item { InfoCard("Error", state.errorMessage ?: "") }
        }
        item {
            Button(onClick = save, modifier = Modifier.fillMaxWidth(),
                enabled = !state.isSaving && if (mode == CreateTournamentMode.Startgg) startggEventUrl.isNotBlank()
                    else title.isNotBlank() && gameTitle.isNotBlank() && description.isNotBlank()) {
                Text(if (state.isSaving) "Saving…" else if (mode == CreateTournamentMode.Startgg) "Create start.gg tournament" else "Create tournament")
            }
        }
    }
}

@Composable
private fun EditableParticipantCard(
    participant: TournamentParticipantSummary,
    isBusy: Boolean,
    canChangeSeed: Boolean,
    onSave: (String, Int?) -> Unit,
    onDelete: () -> Unit
) {
    var displayName by remember(participant.id, participant.displayName) { mutableStateOf(participant.displayName) }
    var seedText by remember(participant.id, participant.seed) { mutableStateOf(participant.seed?.toString() ?: "") }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FormField(value = displayName, onValueChange = { displayName = it }, label = "Player")
            if (canChangeSeed) FormField(
                value = seedText,
                onValueChange = { seedText = it },
                label = "Seed",
                keyboardType = KeyboardType.Number
            ) else Text(participant.seedLabel, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(text = participant.status, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { onSave(displayName, if (canChangeSeed) seedText.trim().toIntOrNull() else participant.seed) },
                    enabled = !isBusy && displayName.isNotBlank() && (!canChangeSeed || com.gestortorneos.ui.isValidParticipantSeed(seedText))
                ) {
                    Text("Save player")
                }
                Button(
                    onClick = onDelete,
                    enabled = !isBusy && canChangeSeed,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError)
                ) {
                    Text("Delete")
                }
            }
        }
    }
}

@Composable
private fun SeedRow(
    participant: TournamentParticipantSummary,
    isBusy: Boolean,
    onSaveSeed: (Int?) -> Unit
) {
    var seedText by remember(participant.id, participant.seed) { mutableStateOf(participant.seed?.toString() ?: "") }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(participant.displayName, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold)
                Text(participant.seedLabel, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedTextField(
                value = seedText,
                onValueChange = { seedText = it },
                enabled = !isBusy,
                modifier = Modifier.width(110.dp),
                label = { Text("Seed") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            Button(onClick = { onSaveSeed(seedText.trim().toIntOrNull()) }, enabled = !isBusy && com.gestortorneos.ui.isValidParticipantSeed(seedText)) {
                Text("OK")
            }
        }
    }
}

@Composable
internal fun ProfileScreen(
    themeMode: ThemeMode,
    isAdmin: Boolean,
    adminLoginError: String?,
    adminLoginLoading: Boolean,
    adminNotificationSettings: TournamentRepository.AdminNotificationSettings?,
    adminNotificationSettingsError: String?,
    adminNotificationSettingsLoading: Boolean,
    onThemeSelected: (ThemeMode) -> Unit,
    onAdminLogin: (String) -> Unit,
    onAdminLogout: () -> Unit,
    onUpdateNotificationSettings: (Boolean, Boolean) -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        MainSectionHeading("Profile", "Your account and app preferences.")
        MainAdaptivePair(first = {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Management account", style = MaterialTheme.typography.titleLarge)
                ManagementAccountControls(onLogout = onAdminLogout, showLogout = false)
            }
        }
        }, second = {
        Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(20.dp)) { AppearanceControls() } }
        })
        if (isAdmin) Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                MainSectionHeading("Group notifications", "Tournament notifications in Telegram and WhatsApp.")
                if (adminNotificationSettings == null) {
                    MainBusyLabel(if (adminNotificationSettingsLoading) "Loading status…" else "Status unavailable", adminNotificationSettingsLoading)
                } else {
                    MainSwitchRow("Telegram", if (adminNotificationSettings.telegramEnabled) "Notifications enabled" else "Notifications disabled",
                        adminNotificationSettings.telegramEnabled, !adminNotificationSettingsLoading) { onUpdateNotificationSettings(it, adminNotificationSettings.whatsappEnabled) }
                    HorizontalDivider()
                    MainSwitchRow("WhatsApp", if (adminNotificationSettings.whatsappEnabled) "Notifications enabled" else "Notifications disabled",
                        adminNotificationSettings.whatsappEnabled, !adminNotificationSettingsLoading) { onUpdateNotificationSettings(adminNotificationSettings.telegramEnabled, it) }
                }
                if (adminNotificationSettingsLoading && adminNotificationSettings != null) MainBusyLabel("Saving…", true)
                adminNotificationSettingsError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        }
        com.gestortorneos.app.updates.AndroidUpdateSettings()
        InfoCard("Local configuration", "Smash Tournaments · Android ${com.gestortorneos.app.BuildConfig.VERSION_NAME}\nDisplay web: ${BackendConfig.displayWebUrl}")
        MainDangerButton("Sign out", onClick = onAdminLogout)
    }
}

@Composable
private fun HeroCard(
    onCreateTournament: () -> Unit,
    onCreateStartggTournament: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        border = surfaceCardBorder(),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "Tournament management",
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Recent tournaments, flexible creation, player registration, brackets and match operations.",
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.82f),
                style = MaterialTheme.typography.bodyLarge
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onCreateTournament) {
                    Text("Create tournament")
                }
                OutlinedButton(onClick = onCreateStartggTournament) {
                    Text("Import from start.gg")
                }
            }
        }
    }
}

@Composable
internal fun TournamentCard(
    tournament: TournamentSummary,
    buttonLabel: String,
    onClick: () -> Unit,
    isAdmin: Boolean = false,
    onDelete: (() -> Unit)? = null
) {
    var showActions by remember(tournament.id) { mutableStateOf(false) }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f)
        ),
        border = surfaceCardBorder()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = tournament.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(tournament.game, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                MainStatusBadge(mainStatusLabel(tournament.status), tournament.status)
                Text("${tournament.participants} participants · ${tournament.format}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 6.dp))
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onClick) { Text(buttonLabel + "  ›") }
                if (isAdmin && onDelete != null) Box {
                    TextButton(onClick = { showActions = true }) { Text("More options") }
                    DropdownMenu(expanded = showActions, onDismissRequest = { showActions = false }) {
                        DropdownMenuItem(text = { Text("Delete tournament", color = MaterialTheme.colorScheme.error) },
                            onClick = { showActions = false; onDelete() })
                    }
                }
            }
        }
    }
}

@Composable
private fun MatchCard(match: MatchSummary) {
    InfoCard(
        title = "${match.poolAwareLabel} - ${mainStatusLabel(match.status)}",
        body = buildString {
            append(match.participantsLabel)
            if (match.advancersRequired <= 1) {
                append("\nBo${match.effectiveBestOf}")
            }
            if (match.calledElapsed != null) {
                append("\n")
                append(match.calledElapsed)
            }
        }
    )
}

@Composable
private fun OperationsMatchCard(
    match: MatchSummary,
    timeoutMinutes: Int,
    tournamentStarted: Boolean,
    isBusy: Boolean,
    availableSetups: List<String>,
    onCall: (String) -> Unit,
    onCancelCall: () -> Unit,
    onStart: () -> Unit,
    onResolveAbsence: (String) -> Unit,
    isStartggMirrored: Boolean,
    supportsCharacterReporting: Boolean,
    onSaveCharacters: (List<Pair<String, String>>) -> Unit,
    onSaveCharactersAndRecordGameWin: (String, List<Pair<String, String>>) -> Unit,
    onSaveCharactersAndReportWinner: (String, List<Pair<String, String>>) -> Unit,
    onReportDetailedResult: (Int?, List<DetailedReportedGame>, (String?) -> Unit) -> Unit,
    onSelectMkartAdvancer: (String) -> Unit,
    onRecordGameWin: (String) -> Unit,
    onReportWinner: (String) -> Unit,
    onReset: () -> Unit
) {
    var showCallDialog by rememberSaveable(match.id, match.stationLabel) { mutableStateOf(false) }
    var setupMenuExpanded by rememberSaveable(match.id, match.stationLabel) { mutableStateOf(false) }
    var selectedSetup by rememberSaveable(match.id, match.stationLabel) {
        mutableStateOf(normalizeSetupLabel(match.stationLabel))
    }
    var showCharactersDialog by rememberSaveable(match.id) { mutableStateOf(false) }
    var showQuickReportModeDialog by rememberSaveable(match.id) { mutableStateOf(false) }
    var showQuickReportDialog by rememberSaveable(match.id) { mutableStateOf(false) }
    var quickReportRevision by remember(match.id) { mutableStateOf<String?>(null) }
    var quickReportSaving by remember(match.id) { mutableStateOf(false) }
    var quickReportError by remember(match.id) { mutableStateOf<String?>(null) }
    var quickReportBestOfOverride by rememberSaveable(match.id) { mutableStateOf<Int?>(null) }
    var pendingCharacterAction by remember(match.id) { mutableStateOf<(() -> Unit)?>(null) }
    var characterOne by remember(match.id) { mutableStateOf("") }
    var characterTwo by remember(match.id) { mutableStateOf("") }
    var quickReportPresetCharacterOne by remember(match.id) { mutableStateOf("") }
    var quickReportPresetCharacterTwo by remember(match.id) { mutableStateOf("") }
    var quickReportSelectedScore by remember(match.id) { mutableStateOf<String?>(null) }
    var quickReportGames by remember(match.id) { mutableStateOf<List<QuickReportGameDraft>>(emptyList()) }
    LaunchedEffect(match.id, match.characterSelections, match.participantIds) {
        characterOne = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(0) }?.characterName ?: ""
        characterTwo = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(1) }?.characterName ?: ""
    }
    val nowMillis by produceState(initialValue = System.currentTimeMillis(), key1 = match.id, key2 = match.calledAt, key3 = match.status) {
        while (true) {
            value = System.currentTimeMillis()
            delay(1000)
        }
    }
    val remainingSeconds = remember(match.calledAt, timeoutMinutes, nowMillis) {
        computeRemainingSeconds(match.calledAt, timeoutMinutes, nowMillis)
    }
    val timerExpired = match.calledAt != null && match.startedAt == null && remainingSeconds <= 0
    val winsNeeded = (match.effectiveBestOf / 2) + 1
    val hasStarted = match.startedAt != null || match.status == "PLAYING"
    val isMarioKart = match.bracketMode == "MKART" || match.participantIds.size > 2 || match.advancersRequired > 1
    val contendersReady = match.participantIds.size >= 2
        && match.participantNames.size >= 2
        && match.participantIds.all { it.isNotBlank() && !isPlaceholderParticipantId(it) }
    val canScoreGames = contendersReady
        && match.status != "CANCELLED"
        && match.status != "COMPLETED"
        && match.status != "WALKOVER"
        && match.status != "PENDING"
        && hasStarted
        && !isMarioKart
    val canSelectAdvancers = contendersReady
        && match.status != "CANCELLED"
        && match.status != "COMPLETED"
        && match.status != "WALKOVER"
        && match.status != "PENDING"
        && hasStarted
    val hasReportedGames = match.participantScores.any { it > 0 }
    val canQuickReport = contendersReady
        && tournamentStarted
        && !isBusy
        && match.status != "CANCELLED"
        && !isMarioKart
    val canResetMirroredSet = isStartggMirrored
        && contendersReady
        && tournamentStarted
        && !isBusy
        && (hasReportedGames || match.status == "COMPLETED" || match.status == "WALKOVER")
    val isCompletedSet = match.status == "COMPLETED" || match.status == "WALKOVER"
    val canResolveAbsence = match.participantIds.size == 2
        && match.status != "CANCELLED" && contendersReady
        && tournamentStarted
        && !isBusy

    PublishMatchPrimaryAction(if (isCompletedSet) "Correct result" else "Report result", canQuickReport) {
        if (canQuickReport) {
                            quickReportPresetCharacterOne = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(0) }?.characterName ?: ""
                            quickReportPresetCharacterTwo = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(1) }?.characterName ?: ""
                            quickReportSelectedScore = null
                            quickReportGames = currentQuickReportGames(match)
                            quickReportBestOfOverride = match.reportedBestOf
                            showQuickReportModeDialog = true
        }
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f)
        ),
        border = surfaceCardBorder()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = match.poolAwareLabel,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            MainStatusBadge(mainStatusLabel(match.status), match.status)
            Text(
                text = match.participantsLabel,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            MatchSyncFeedback(match.tournamentId, match.id, match.syncStatus, tournamentStarted && !isBusy)
            if (!isMarioKart) {
                Text(
                    text = if (match.reportedBestOf != null) {
                        "Format: Bo${match.effectiveBestOf} (tournament: Bo${match.bestOf})"
                    } else {
                        "Modalidad: Bo${match.bestOf}"
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (match.participantNames.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    match.participantNames.forEachIndexed { index, name ->
                        val score = match.participantScores.getOrElse(index) { 0 }
                        val participantId = match.participantIds.getOrNull(index)
                        val isAdvanced = participantId != null && match.advancingParticipantIds.contains(participantId)
                        val lastCharacter = participantId?.let { latestCharacterForParticipant(match, it) }
                        val isWalkoverLoser = match.status == "WALKOVER"
                            && participantId != null
                            && participantId != match.winnerParticipantId
                            && !isAdvanced
                        ParticipantScoreRow(
                            name = name,
                            score = score,
                            winsNeeded = if (isMarioKart) match.advancersRequired else winsNeeded,
                            isWinner = participantId != null && (participantId == match.winnerParticipantId || isAdvanced),
                            lastCharacter = lastCharacter,
                            isWalkoverLoser = isWalkoverLoser,
                            enabled = tournamentStarted && !isBusy && ((canScoreGames && participantId != null) || (canSelectAdvancers && participantId != null && !isAdvanced && match.advancingParticipantIds.size < match.advancersRequired)),
                            actionLabel = if (isMarioKart) {
                                if (participantId != null && isAdvanced) "Qualified"
                                else "Qualify"
                            } else {
                                "+1 game"
                            },
                            onAddWin = {
                                if (participantId != null) {
                                    if (isMarioKart) {
                                        onSelectMkartAdvancer(participantId)
                                    } else {
                                        if (supportsCharacterReporting && match.participantIds.size >= 2) {
                                            characterOne = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(0) }?.characterName ?: ""
                                            characterTwo = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(1) }?.characterName ?: ""
                                            pendingCharacterAction = {
                                                onSaveCharactersAndRecordGameWin(
                                                    participantId,
                                                    listOf(
                                                        match.participantIds[0] to characterOne.trim(),
                                                        match.participantIds[1] to characterTwo.trim()
                                                    )
                                                )
                                            }
                                            showCharactersDialog = true
                                        } else {
                                            onRecordGameWin(participantId)
                                        }
                                    }
                                }
                            }
                        )
                    }
                }
            }
            if (match.calledElapsed != null) {
                Text(
                    text = match.calledElapsed,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (match.calledAt != null && match.startedAt == null && match.status == "CALLED") {
                Text(
                    text = if (remainingSeconds > 0) {
                        "Tiempo restante: ${formatTimer(remainingSeconds)}"
                    } else {
                        "Time expired"
                    },
                    color = if (remainingSeconds > 0) MaterialTheme.colorScheme.onSurfaceVariant else MainPalette.warning
                )
            }
            if (hasStarted) {
                Text(
                    text = "Match in progress",
                    color = MainPalette.success
                )
            }
            if (supportsCharacterReporting && contendersReady && match.participantIds.size >= 2) {
                val firstCharacter = match.characterSelections.firstOrNull { it.participantId == match.participantIds[0] }?.characterName
                val secondCharacter = match.characterSelections.firstOrNull { it.participantId == match.participantIds[1] }?.characterName
                Text(
                    text = "Characters: ${match.participantNames[0]} ${firstCharacter ?: "sin elegir"} · ${match.participantNames[1]} ${secondCharacter ?: "sin elegir"}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedButton(
                    onClick = {
                        characterOne = firstCharacter ?: ""
                        characterTwo = secondCharacter ?: ""
                        showCharactersDialog = true
                    },
                    enabled = tournamentStarted && !isBusy
                ) {
                    Text("Choose characters")
                }
            }
            if (match.winnerName != null) {
                Text(
                    text = "Match winner: ${match.winnerName}",
                    color = MainPalette.success,
                    fontWeight = FontWeight.Bold
                )
            } else if (isMarioKart && match.advancingParticipantIds.isNotEmpty()) {
                Text(
                    text = "Qualifiers: ${match.participantNames.filterIndexed { index, _ -> match.advancingParticipantIds.contains(match.participantIds.getOrElse(index) { "" }) }.joinToString()}",
                    color = MainPalette.success,
                    fontWeight = FontWeight.Bold
                )
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        selectedSetup = normalizeSetupLabel(match.stationLabel)
                            ?.takeIf { it in availableSetups }
                            ?: availableSetups.firstOrNull()
                        showCallDialog = true
                    },
                    enabled = tournamentStarted && !isBusy && contendersReady && match.status == "PENDING"
                ) {
                    Text("Call")
                }
                if (match.status == "CALLED" && match.startedAt == null) {
                    Button(onClick = onStart, enabled = tournamentStarted && !isBusy && contendersReady) {
                        Text("Start match")
                    }
                    OutlinedButton(onClick = onCancelCall, enabled = tournamentStarted && !isBusy && contendersReady) {
                        Text("Cancel")
                    }
                }
            }
            if (!tournamentStarted) {
                Text(
                    text = "Match operations become available after you select Start tournament.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else if (!contendersReady) {
                Text(
                    text = "Waiting for earlier matches to determine the opponents.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (timerExpired && match.status == "CALLED") {
                if (!isStartggMirrored && contendersReady && match.participantIds.size == 2) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { onResolveAbsence("NONE_PRESENT") }, enabled = tournamentStarted && !isBusy && contendersReady) {
                            Text("None")
                        }
                        Button(onClick = { onResolveAbsence("SLOT_1_ABSENT") }, enabled = tournamentStarted && !isBusy && contendersReady) {
                            Text("Falta ${match.participantNames[0]}")
                        }
                        Button(onClick = { onResolveAbsence("SLOT_2_ABSENT") }, enabled = tournamentStarted && !isBusy && contendersReady) {
                            Text("Falta ${match.participantNames[1]}")
                        }
                    }
                }
            }
            if (!isCompletedSet && canQuickReport) {
                Text(
                    text = "Mark each game win. The match closes automatically at $winsNeeded wins.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (canQuickReport) {
                    Button(
                        onClick = {
                            quickReportPresetCharacterOne = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(0) }?.characterName ?: ""
                            quickReportPresetCharacterTwo = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(1) }?.characterName ?: ""
                            quickReportSelectedScore = null
                            quickReportGames = currentQuickReportGames(match)
                            quickReportBestOfOverride = match.reportedBestOf
                            showQuickReportModeDialog = true
                        }
                    ) {
                        Text("Quick report")
                    }
                }
            } else if (isCompletedSet && canQuickReport) {
                Button(
                    onClick = {
                        quickReportPresetCharacterOne = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(0) }?.characterName ?: ""
                        quickReportPresetCharacterTwo = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(1) }?.characterName ?: ""
                        quickReportSelectedScore = null
                        quickReportGames = currentQuickReportGames(match)
                        quickReportBestOfOverride = match.reportedBestOf
                        showQuickReportModeDialog = true
                    }
                ) {
                    Text("Correct result")
                }
            } else if (canSelectAdvancers) {
                Text(
                    text = "Select ${if (match.advancersRequired == 1) "1 clasificado" else "${match.advancersRequired} clasificados"} for this heat.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else if (match.status == "CALLED" && match.startedAt == null) {
                Text(
                    text = "Mark the match as started before recording game wins.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (contendersReady && (match.status == "COMPLETED" || match.status == "WALKOVER") && !isStartggMirrored) {
                Text(
                    text = "Correct full result",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            if (supportsCharacterReporting) {
                                characterOne = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(0) }?.characterName ?: ""
                                characterTwo = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(1) }?.characterName ?: ""
                                pendingCharacterAction = {
                                    onSaveCharactersAndReportWinner(
                                        match.participantIds[0],
                                        listOf(
                                            match.participantIds[0] to characterOne.trim(),
                                            match.participantIds[1] to characterTwo.trim()
                                        )
                                    )
                                }
                                showCharactersDialog = true
                            } else {
                                onReportWinner(match.participantIds[0])
                            }
                        },
                        enabled = tournamentStarted && !isBusy && contendersReady
                    ) {
                        Text("Wins ${match.participantNames[0]}")
                    }
                    Button(
                        onClick = {
                            if (supportsCharacterReporting) {
                                characterOne = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(0) }?.characterName ?: ""
                                characterTwo = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(1) }?.characterName ?: ""
                                pendingCharacterAction = {
                                    onSaveCharactersAndReportWinner(
                                        match.participantIds[1],
                                        listOf(
                                            match.participantIds[0] to characterOne.trim(),
                                            match.participantIds[1] to characterTwo.trim()
                                        )
                                    )
                                }
                                showCharactersDialog = true
                            } else {
                                onReportWinner(match.participantIds[1])
                            }
                        },
                        enabled = tournamentStarted && !isBusy && contendersReady
                    ) {
                        Text("Wins ${match.participantNames[1]}")
                    }
                }
            }
            if (isStartggMirrored && isCompletedSet) {
                Text(
                    text = "You can correct this set in the app. Changing the winner, DQ or result will adjust dependent sets.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (canResolveAbsence) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Text("Issues", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    MainDangerButton("DQ ${match.participantNames.getOrNull(0) ?: "slot 1"}", onClick = { onResolveAbsence("SLOT_1_ABSENT") })
                    MainDangerButton("DQ ${match.participantNames.getOrNull(1) ?: "slot 2"}", onClick = { onResolveAbsence("SLOT_2_ABSENT") })
                }
            }
            if (canResetMirroredSet || (!isStartggMirrored && (match.status == "COMPLETED" || match.status == "WALKOVER" || match.status == "PLAYING"))) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    MainDangerButton("Reset set", enabled = tournamentStarted && !isBusy && contendersReady, onClick = onReset)
                }
            }
        }
    }

    if (showCallDialog) {
        AlertDialog(
            onDismissRequest = { showCallDialog = false },
            title = { Text("Assign station") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Select an available setup or stream for this match.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (availableSetups.isEmpty()) {
                        Text(
                            text = "No destinations are available. Wait for another match to finish or add setups or streams in tournament settings.",
                            color = MainPalette.warning
                        )
                    } else {
                        Box(modifier = Modifier.fillMaxWidth()) {
                            OutlinedTextField(
                                value = selectedSetup ?: "",
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Destination") },
                                placeholder = { Text("Select destination") },
                                modifier = Modifier.fillMaxWidth()
                            )
                            Box(
                                modifier = Modifier
                                    .matchParentSize()
                                    .clickable { setupMenuExpanded = true }
                            )
                            DropdownMenu(
                                expanded = setupMenuExpanded,
                                onDismissRequest = { setupMenuExpanded = false },
                                modifier = Modifier.heightIn(max = 320.dp)
                            ) {
                                availableSetups.forEach { setupLabel ->
                                    DropdownMenuItem(
                                        text = { Text(setupLabel) },
                                        onClick = {
                                            selectedSetup = setupLabel
                                            setupMenuExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val sanitizedStation = selectedSetup?.trim().orEmpty()
                        if (sanitizedStation.isNotEmpty()) {
                            onCall(sanitizedStation)
                            showCallDialog = false
                        }
                    },
                    enabled = tournamentStarted && contendersReady && !selectedSetup.isNullOrBlank() && !isBusy
                ) {
                    Text("Confirm")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCallDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    if (showCharactersDialog && supportsCharacterReporting && match.participantIds.size >= 2 && match.participantNames.size >= 2) {
        AlertDialog(
            onDismissRequest = { showCharactersDialog = false },
            title = { Text("Set characters") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Select each team member character. Only used in sets imported from start.gg.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    CharacterSelectorField(
                        characterCount = match.entrantSize, gameTitle = match.gameTitle,
                        label = match.participantNames[0],
                        selectedCharacter = characterOne,
                        onCharacterSelected = { characterOne = it }
                    )
                    CharacterSelectorField(
                        characterCount = match.entrantSize, gameTitle = match.gameTitle,
                        label = match.participantNames[1],
                        selectedCharacter = characterTwo,
                        onCharacterSelected = { characterTwo = it }
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val pending = pendingCharacterAction
                        if (pending != null) {
                            pending()
                        } else {
                            onSaveCharacters(
                                listOf(
                                    match.participantIds[0] to characterOne.trim(),
                                    match.participantIds[1] to characterTwo.trim()
                                )
                            )
                        }
                        pendingCharacterAction = null
                        showCharactersDialog = false
                    },
                    enabled = !isBusy && listOf(characterOne, characterTwo).all { value -> value.split("/").size == match.entrantSize && value.split("/").all { it.isNotBlank() } }
                ) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCharactersDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    if (showQuickReportDialog && match.participantIds.size >= 2 && match.participantNames.size >= 2) {
        QuickReportResultDialog(
            match = match,
            isSaving = quickReportSaving,
            errorMessage = quickReportError,
            effectiveBestOf = quickReportBestOfOverride ?: match.bestOf,
            requiresCharacters = supportsCharacterReporting,
            initialCharacters = listOf(
                quickReportPresetCharacterOne,
                quickReportPresetCharacterTwo,
            ),
            initialScoreKey = quickReportSelectedScore,
            initialGames = quickReportGames,
            onDismiss = { showQuickReportDialog = false },
            onSubmit = { scoreKey, firstCharacter, secondCharacter, games ->
                quickReportSaving = true
                quickReportError = null
                quickReportSelectedScore = scoreKey
                quickReportPresetCharacterOne = firstCharacter
                quickReportPresetCharacterTwo = secondCharacter
                quickReportGames = games
                onReportDetailedResult(
                    quickReportBestOfOverride,
                    games.map { game ->
                        DetailedReportedGame(
                            expectedRevision = quickReportRevision,
                            winnerParticipantId = game.winnerParticipantId,
                            selections = if (supportsCharacterReporting) {
                                listOf(
                                    match.participantIds[0] to game.firstCharacter,
                                    match.participantIds[1] to game.secondCharacter,
                                )
                            } else {
                                emptyList()
                            },
                        )
                    },
                ) { error ->
                    quickReportSaving = false
                    quickReportError = error
                    if (error == null) showQuickReportDialog = false
                }
            },
        )
    }

    if (showQuickReportModeDialog) {
        QuickReportBestOfDialog(
            defaultBestOf = match.bestOf,
            selectedOverride = quickReportBestOfOverride,
            onDismiss = { showQuickReportModeDialog = false },
            onConfirm = { bestOfOverride ->
                quickReportBestOfOverride = bestOfOverride
                showQuickReportModeDialog = false
                quickReportRevision = match.operationRevision; showQuickReportDialog = true
            },
        )
    }
}

@Composable
private fun CharacterSelectorField(
    label: String,
    selectedCharacter: String,
    characterCount: Int = 1,
    gameTitle: String = "",
    onCharacterSelected: (String) -> Unit
) {
    if (characterCount > 1) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(characterCount) { index ->
                val picks = selectedCharacter.split(" / ").toMutableList()
                while (picks.size < characterCount) picks.add("")
                CharacterSelectorField(label = "$label · Player ${index + 1}", selectedCharacter = picks[index], gameTitle = gameTitle, onCharacterSelected = { chosen ->
                    picks[index] = chosen
                    onCharacterSelected(picks.joinToString(" / "))
                })
            }
        }
        return
    }
    var expanded by remember { mutableStateOf(false) }
    var filterText by remember(selectedCharacter) { mutableStateOf("") }
    val dropdownTextColor = MaterialTheme.colorScheme.onSurface
    val characterNames = if (Regex("rivals|roa", RegexOption.IGNORE_CASE).containsMatchIn(gameTitle)) listOf("Random", "Zetterburn", "Orcane", "Wrastor", "Kragg", "Forsburn", "Maypul", "Absa", "Etalus", "Ranno", "Clairen", "Olympia", "Fleet", "Loxodont", "Galvan", "La Reina", "Slade") else smashUltimateCharacterNames
    val filteredCharacters = remember(filterText, gameTitle) {
        if (filterText.isBlank()) {
            characterNames
        } else {
            characterNames.filter { characterName ->
                characterName.contains(filterText, ignoreCase = true)
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelMedium
        )
        Button(
            onClick = {
                filterText = selectedCharacter
                expanded = true
            },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(contentColor = MaterialTheme.colorScheme.onPrimary)
        ) {
            if (selectedCharacter.isBlank()) {
                Text("Select character")
            } else {
                SmashCharacterInlineLabel(selectedCharacter, textColor = MaterialTheme.colorScheme.onPrimary)
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            Column(
                modifier = Modifier
                    .padding(8.dp)
                    .width(280.dp)
            ) {
                OutlinedTextField(
                    value = filterText,
                    onValueChange = { filterText = it },
                    label = { Text("Filter characters") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(8.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 280.dp)
                        .verticalScroll(rememberScrollState())
                ) {
                    if (filteredCharacters.isEmpty()) {
                        Text(
                            text = "No results",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(12.dp)
                        )
                    } else {
                        filteredCharacters.forEach { characterName ->
                            DropdownMenuItem(
                                text = {
                                    SmashCharacterInlineLabel(
                                        name = characterName,
                                        modifier = Modifier.fillMaxWidth(),
                                        textColor = dropdownTextColor
                                    )
                                },
                                onClick = {
                                    onCharacterSelected(characterName)
                                    expanded = false
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun ParticipantScoreRow(
    name: String,
    score: Int,
    winsNeeded: Int,
    isWinner: Boolean,
    lastCharacter: String?,
    isWalkoverLoser: Boolean,
    enabled: Boolean,
    actionLabel: String,
    onAddWin: () -> Unit
) {
    Card(colors = CardDefaults.cardColors(containerColor = if (isWinner) MainPalette.successContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f)), border = surfaceCardBorder()) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (!lastCharacter.isNullOrBlank() && !isWalkoverLoser) SmashCharacterIcon(name = lastCharacter, size = 24.dp)
                Text(name, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                if (actionLabel != "Qualify" && actionLabel != "Qualified") Text(if (isWalkoverLoser) "DQ" else score.toString(),
                    style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = if (isWalkoverLoser) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(if (actionLabel == "Qualify" || actionLabel == "Qualified") { if (isWinner) "Selected to advance" else "Awaiting qualification" }
                    else if (isWalkoverLoser) "Disqualified" else "$score of $winsNeeded games needed to win",
                    Modifier.padding(vertical = 12.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = onAddWin, enabled = enabled) { Text(actionLabel) }
            }
        }
    }
}

@Composable
private fun FormField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    minLines: Int = 1,
    keyboardType: KeyboardType = KeyboardType.Text
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        minLines = minLines,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType)
    )
}

@Composable
private fun SegmentedChoiceRow(
    title: String,
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { (value, label) ->
                Button(onClick = { onSelect(value) }) {
                    Text(if (selected == value) "[$label]" else label)
                }
            }
        }
    }
}

@Composable
private fun CollapsibleHeader(
    title: String,
    expanded: Boolean,
    onToggle: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        border = surfaceCardBorder()
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = title,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f)
            )
            Text(
                if (expanded) "Hide" else "Show",
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.82f)
            )
        }
    }
}

@Composable
private fun LadderManagementPanel(
    tournamentId: String,
    participants: List<Pair<String,String>>,
    ladder: LadderSummary?,
    isBusy: Boolean,
    onStart: () -> Unit,
    onFinalize: () -> Unit
) {
    var showConsole by remember { mutableStateOf(false) }
    val ladderRepository = remember { com.gestortorneos.app.data.TournamentRepository() }
    if (showConsole) com.gestortorneos.ui.LadderConsole(load={ladderRepository.ladderBoard(tournamentId)},control={ladderRepository.ladderControl(tournamentId,it)},participants=participants,onClose={showConsole=false})
    val summary = ladder
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f)),
        border = surfaceCardBorder()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "Matchmaking and standings alongside the official bracket.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Button(onClick={showConsole=true},enabled=!isBusy) { Text("Control, settings and results") }
            val status = summary?.status ?: "INACTIVE"
            Text(
                text = "Status: ${when (status) {
                    "ACTIVE" -> if(summary?.options?.closing == true) "Finishing sets · registration closed" else if(summary?.options?.paused == true) "Paused" else "Active"
                    "COMPLETED" -> "Finished"
                    else -> "Inactive"
                }}",
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (status == "ACTIVE") {
                    Button(onClick = onFinalize, enabled = !isBusy) {
                        Text("Close registration", color = MaterialTheme.colorScheme.onPrimary)
                    }
                } else {
                    Button(onClick = onStart, enabled = !isBusy) {
                        Text(
                            if (status == "COMPLETED") "Create new ladder" else "Enable ladder",
                            color = MaterialTheme.colorScheme.onPrimary
                        )
                    }
                }
            }
            if (summary != null && (summary.queue.isNotEmpty() || summary.activeMatches.isNotEmpty() || summary.completedMatches.isNotEmpty() || summary.standings.isNotEmpty())) {
                Text(
                    text = "Queue (${summary.queue.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                if (summary.queue.isEmpty()) {
                    Text("No players in the queue.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    summary.queue.forEach { entry ->
                        Text("• ${entry.displayName}", color = MaterialTheme.colorScheme.onSurface)
                    }
                }

                if (summary.activeMatches.isNotEmpty()) {
                    Text(
                        text = "Active matches",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    summary.activeMatches.forEach { match ->
                        LadderManagementMatchCard(match)
                    }
                }

                if (summary.standings.isNotEmpty()) {
                    Text(
                        text = "Standings",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    summary.standings.forEachIndexed { index, standing ->
                        Text(
                            text = "${index + 1}. ${standing.displayName} · ${standing.wins}-${standing.losses} · Games ${standing.gamesWon}-${standing.gamesLost}",
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }

                if (summary.completedMatches.isNotEmpty()) {
                    Text(
                        text = "Ladder history",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    summary.completedMatches.forEach { match ->
                        LadderManagementMatchCard(match)
                    }
                }
            }
        }
    }
}

@Composable
private fun LadderManagementMatchCard(match: LadderMatchSummary) {
    val participantOne = match.participants.getOrNull(0)
    val participantTwo = match.participants.getOrNull(1)
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f)),
        border = surfaceCardBorder()
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text("Ladder Bo${match.bestOf}", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            Text(
                text = when (match.status) {
                    "SUSPENDED" -> "Waiting for bracket / setup"
                    "AWAITING_CONFIRMATION" -> "Result awaiting opponent"
                    "DISPUTED" -> "Disputed · review result"
                    "READY_CHECK" -> "Confirming attendance"
                    "PLAYING" -> "Playing"
                    "COMPLETED" -> "Completed"
                    "CANCELLED" -> "Cancelled"
                    "EXPIRED" -> "Expired"
                    else -> match.status
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (participantOne != null && participantTwo != null) {
                Text(
                    text = "${participantOne.displayName} ${match.scores.getOrElse(0) { 0 }} - ${match.scores.getOrElse(1) { 0 }} ${participantTwo.displayName}",
                    color = MaterialTheme.colorScheme.onSurface
                )
                if (match.status == "READY_CHECK") {
                    val readyOne = if (match.participantOneReadyAt != null) "ready" else "pending"
                    val readyTwo = if (match.participantTwoReadyAt != null) "ready" else "pending"
                    Text(
                        text = "${participantOne.displayName}: $readyOne · ${participantTwo.displayName}: $readyTwo",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun BracketBoard(matches: List<MatchSummary>, hideAutomaticAdvances: Boolean = false) {
    val visibleMatches = if (hideAutomaticAdvances) {
        matches
            .filterNot { isDormantGrandFinalReset(matches, it) }
            .filterNot(::isAutomaticAdvanceDisplayMatch)
    } else {
        matches.filterNot { isDormantGrandFinalReset(matches, it) }
    }
    val stageOrder = listOf("POOLS", "WINNERS", "LOSERS", "FINALS")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        stageOrder.forEach { stage ->
            val stageMatches = visibleMatches.filter { it.bracketStage == stage }
            if (stageMatches.isNotEmpty()) {
                val phaseBuckets = groupedBracketPhases(stageMatches)
                phaseBuckets.forEach { phaseBucket ->
                    val concurrentPoolGroups = groupedConcurrentPools(phaseBucket.matches)
                    if (concurrentPoolGroups != null) {
                        concurrentPoolGroups.forEach { group ->
                            PoolBracketCluster(groupName = group.label, matches = group.matches)
                        }
                    } else {
                        val rounds = phaseBucket.matches.groupBy { it.roundNumber }.toSortedMap()
                        rounds.forEach { (_, roundMatches) ->
                            Column(
                                modifier = Modifier.width(if (roundMatches.any { it.participantNames.size > 2 }) 290.dp else 250.dp),
                                verticalArrangement = Arrangement.spacedBy(26.dp)
                            ) {
                                Text(
                                    text = roundDisplayTitle(stage, roundMatches, rounds.size),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                roundMatches.sortedBy { it.matchNumber }.forEach { match ->
                                    RelationalMatchNode(match = match)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private data class MatchPhaseBucket(
    val key: String,
    val order: Int,
    val label: String,
    val matches: List<MatchSummary>,
)

private data class MatchPoolBucket(
    val key: String,
    val label: String,
    val matches: List<MatchSummary>,
)

private data class ActivePoolSection(
    val key: String,
    val label: String,
    val matches: List<MatchSummary>,
)

private data class CompletedMatchSection(
    val key: String,
    val label: String,
    val matches: List<MatchSummary>,
)

private fun naturalLabelSortKey(value: String): List<Comparable<*>> {
    val parts = Regex("""\d+|\D+""").findAll(value).map { it.value }.toList()
    return parts.map { part ->
        part.toIntOrNull() ?: part.lowercase()
    }
}

private fun compareLabelsNaturally(left: String, right: String): Int {
    val leftParts = naturalLabelSortKey(left)
    val rightParts = naturalLabelSortKey(right)
    val maxSize = maxOf(leftParts.size, rightParts.size)
    for (index in 0 until maxSize) {
        val leftPart = leftParts.getOrNull(index)
        val rightPart = rightParts.getOrNull(index)
        if (leftPart == null) return -1
        if (rightPart == null) return 1
        val comparison = when {
            leftPart is Int && rightPart is Int -> leftPart.compareTo(rightPart)
            leftPart is String && rightPart is String -> leftPart.compareTo(rightPart)
            leftPart is Int -> -1
            rightPart is Int -> 1
            else -> leftPart.toString().compareTo(rightPart.toString())
        }
        if (comparison != 0) return comparison
    }
    return 0
}

private fun groupedBracketPhases(matches: List<MatchSummary>): List<MatchPhaseBucket> {
    return matches
        .groupBy { it.phaseKey }
        .map { (phaseKey, phaseMatches) ->
            MatchPhaseBucket(
                key = phaseKey,
                order = phaseMatches.firstOrNull()?.phaseOrder ?: Int.MAX_VALUE,
                label = phaseMatches.firstOrNull()?.phaseDisplayLabel ?: phaseKey,
                matches = phaseMatches.sortedWith(compareBy<MatchSummary>({ it.roundNumber }, { it.matchNumber })),
            )
        }
        .sortedWith(compareBy<MatchPhaseBucket>({ it.order }).thenComparator { left, right ->
            compareLabelsNaturally(left.label, right.label)
        })
}

private fun groupedConcurrentPools(matches: List<MatchSummary>): List<MatchPoolBucket>? {
    val groups = matches
        .mapNotNull { match ->
            val key = match.phaseScopedPoolKey ?: return@mapNotNull null
            val label = match.poolLabel ?: return@mapNotNull null
            key to (label to match)
        }
        .groupBy({ it.first }, { it.second })
        .map { (key, entries) ->
            MatchPoolBucket(
                key = key,
                label = entries.first().first,
                matches = entries.map { it.second }.sortedWith(compareBy<MatchSummary>({ it.roundNumber }, { it.matchNumber })),
            )
        }
        .sortedWith { left, right -> compareLabelsNaturally(left.label, right.label) }
    return groups.takeIf { it.size > 1 }
}

private fun buildActivePoolSections(matches: List<MatchSummary>): List<ActivePoolSection> {
    val activeMatchComparator = compareBy<MatchSummary>(
        { activeMatchPriority(it) },
        { activeMatchTimelineAnchor(it) ?: Long.MAX_VALUE },
        { it.bracketStage },
        { it.roundNumber },
        { it.matchNumber },
    )
    return buildList {
        groupedBracketPhases(matches).forEach { phaseBucket ->
            val concurrentPools = groupedConcurrentPools(phaseBucket.matches)
            if (concurrentPools != null) {
                addAll(
                    concurrentPools.map { poolBucket ->
                        ActivePoolSection(
                            key = poolBucket.key,
                            label = poolBucket.label,
                            matches = poolBucket.matches.sortedWith(activeMatchComparator),
                        )
                    }
                )
            } else if (phaseBucket.matches.isNotEmpty()) {
                add(
                    ActivePoolSection(
                        key = phaseBucket.key,
                        label = phaseBucket.matches.firstOrNull()?.poolLabel ?: phaseBucket.label,
                        matches = phaseBucket.matches.sortedWith(activeMatchComparator),
                    )
                )
            }
        }
    }
}

private fun buildCompletedMatchSections(matches: List<MatchSummary>): List<CompletedMatchSection> {
    return buildList {
        groupedBracketPhases(matches).forEach { phaseBucket ->
            val concurrentPools = groupedConcurrentPools(phaseBucket.matches)
            if (concurrentPools != null) {
                addAll(
                    concurrentPools.map { poolBucket ->
                        CompletedMatchSection(
                            key = poolBucket.key,
                            label = poolBucket.label,
                            matches = poolBucket.matches,
                        )
                    }
                )
            } else if (phaseBucket.matches.isNotEmpty()) {
                val firstMatch = phaseBucket.matches.first()
                add(
                    CompletedMatchSection(
                        key = phaseBucket.key,
                        label = completedSectionLabel(firstMatch, phaseBucket.label),
                        matches = phaseBucket.matches,
                    )
                )
            }
        }
    }
}

private fun completedSectionLabel(match: MatchSummary, fallback: String): String {
    if (match.isPoolMatch) {
        return match.poolLabel ?: fallback
    }
    val phaseLabel = match.phaseDisplayLabel.trim()
    if (phaseLabel.isNotEmpty() && !phaseLabel.equals("bracket", ignoreCase = true)) {
        return phaseLabel
    }
    return when (match.bracketStage) {
        "WINNERS", "LOSERS", "FINALS" -> "Final bracket"
        else -> fallback
    }
}

private fun roundDisplayTitle(stage: String, roundMatches: List<MatchSummary>, totalRounds: Int): String {
    return roundMatches.firstOrNull()?.roundDisplayTitle?.takeIf { it.isNotBlank() }
        ?: roundTitle(stage, roundMatches.firstOrNull()?.roundNumber ?: 1, totalRounds)
}

@Composable
private fun PoolBracketCluster(groupName: String, matches: List<MatchSummary>) {
    val rounds = matches.groupBy { it.roundNumber }.toSortedMap()
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
        border = surfaceCardBorder()
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                text = groupName,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                rounds.forEach { (round, roundMatches) ->
                    Column(
                        modifier = Modifier.width(if (roundMatches.any { it.participantNames.size > 2 }) 290.dp else 250.dp),
                        verticalArrangement = Arrangement.spacedBy(26.dp)
                    ) {
                        Text(
                            text = roundDisplayTitle(matches.firstOrNull()?.bracketStage.orEmpty(), roundMatches, rounds.size),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        roundMatches.sortedBy { it.matchNumber }.forEach { match ->
                            RelationalMatchNode(match = match)
                        }
                    }
                }
            }
        }
    }
}

private fun isAutomaticAdvanceDisplayMatch(match: MatchSummary): Boolean {
    if (match.status != "COMPLETED") {
        return false
    }
    if (match.calledAt != null || match.startedAt != null) {
        return false
    }
    if (match.characterSelections.isNotEmpty()) {
        return false
    }
    if (match.participantIds.isEmpty() || match.participantIds.size > match.advancersRequired) {
        return false
    }

    val advancedIds = buildSet {
        addAll(match.advancingParticipantIds)
        match.winnerParticipantId?.let(::add)
    }
    if (advancedIds.isEmpty()) {
        return false
    }

    return match.participantIds.indices.all { index ->
        val participantId = match.participantIds[index]
        val score = match.participantScores.getOrElse(index) { 0 }
        score == if (advancedIds.contains(participantId)) 1 else 0
    }
}

@Composable
private fun RelationalMatchNode(match: MatchSummary) {
    val isMarioKart = match.bracketMode == "MKART" || match.participantNames.size > 2 || match.advancersRequired > 1
    val isWalkover = match.status == "WALKOVER"
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f)),
        border = surfaceCardBorder(),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "M${match.matchNumber}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = match.status,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            val names = match.participantNames.ifEmpty {
                if (isMarioKart) {
                    match.participantsLabel.split(" / ")
                } else {
                    match.participantsLabel.split(" vs ")
                }
            }

            if (isMarioKart) {
                Text(
                    text = "Heat of ${names.size} players · ${match.advancersRequired} advance",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            names.forEachIndexed { index, name ->
                val participantId = match.participantIds.getOrElse(index) { "" }
                val isAdvanced = if (isMarioKart) {
                    match.advancingParticipantIds.contains(participantId)
                } else {
                    participantId.isNotBlank() && participantId == match.winnerParticipantId
                }
                val score = match.participantScores.getOrElse(index) { 0 }
                val lastCharacter = latestCharacterForParticipant(match, participantId)
                val isEliminated = (
                    match.status == "COMPLETED" ||
                        match.status == "WALKOVER"
                    ) && participantId.isNotBlank() && !isAdvanced
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = when {
                            isAdvanced -> MainPalette.successContainer
                            isEliminated -> MaterialTheme.colorScheme.errorContainer
                            else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f)
                        }
                    ),
                    border = surfaceCardBorder()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            modifier = Modifier.weight(1f),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            if (!isWalkover && !lastCharacter.isNullOrBlank()) {
                                SmashCharacterIcon(name = lastCharacter, size = 20.dp)
                            }
                            Text(
                                text = name,
                                color = when {
                                    isAdvanced -> MainPalette.success
                                    isEliminated -> MaterialTheme.colorScheme.error
                                    else -> MaterialTheme.colorScheme.onSurface
                                },
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        if (!isMarioKart) {
                            Text(
                                text = if (isWalkover && isEliminated) "DQ" else score.toString(),
                                color = when {
                                    isWalkover && isEliminated -> MaterialTheme.colorScheme.onErrorContainer
                                    isAdvanced -> MainPalette.success
                                    isEliminated -> MaterialTheme.colorScheme.error
                                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                                },
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(start = 10.dp)
                            )
                        }
                        if (isAdvanced && !isWalkover && isMarioKart) {
                            Text(
                                text = "Advances",
                                color = MainPalette.success,
                                fontWeight = FontWeight.Bold
                            )
                        } else if (isEliminated && !isWalkover && isMarioKart) {
                            Text(
                                text = "Eliminated",
                                color = MaterialTheme.colorScheme.error,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun latestCharacterForParticipant(match: MatchSummary, participantId: String): String? {
    if (participantId.isBlank()) {
        return null
    }
    return match.gameCharacterSelections
        .asReversed()
        .firstNotNullOfOrNull { game ->
            game.selections.firstOrNull { it.participantId == participantId }?.characterName
        }
        ?: match.characterSelections.firstOrNull { it.participantId == participantId }?.characterName
}

private fun activeMatchPriority(match: MatchSummary): Int = when (match.status) {
    "PLAYING" -> 0
    "CALLED" -> 1
    "CHECKED_IN" -> 2
    "PENDING" -> 3
    else -> 4
}

private fun activeMatchTimelineAnchor(match: MatchSummary): Long? {
    return match.startedAt?.let(::parseIsoMillis)
        ?: match.calledAt?.let(::parseIsoMillis)
}

private fun operationsModernCanInteractWithMatch(
    match: MatchSummary,
    tournamentStarted: Boolean,
    isStartggMirrored: Boolean,
): Boolean {
    if (!tournamentStarted || !hasResolvedContenders(match)) {
        return false
    }
    return when (match.status) {
        "PENDING", "CALLED", "CHECKED_IN", "PLAYING" -> true
        "COMPLETED", "WALKOVER" -> true
        else -> isStartggMirrored && match.status.isNotBlank()
    }
}

private fun parseIsoMillis(value: String): Long? = runCatching {
    java.time.Instant.parse(value).toEpochMilli()
}.getOrNull()

private fun roundTitle(stage: String, round: Int, totalRounds: Int): String {
    val prefix = when (stage) {
        "POOLS" -> "Pools"
        "WINNERS" -> "Winners"
        "LOSERS" -> "Losers"
        "FINALS" -> "Grand Final"
        else -> "Round"
    }

    if (stage == "FINALS") {
        return if (round > 1) "Grand Final Reset" else prefix
    }

    return when {
        round == totalRounds && totalRounds > 1 && stage == "WINNERS" -> "$prefix Final"
        round == totalRounds - 1 && totalRounds > 2 && stage == "WINNERS" -> "$prefix Semifinal"
        else -> "$prefix Round $round"
    }
}

private fun isDormantGrandFinalReset(allMatches: List<MatchSummary>, match: MatchSummary): Boolean {
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
        it.bracketStage == "FINALS" &&
            it.roundNumber == 1 &&
            it.matchNumber == match.matchNumber
    } ?: return true

    val grandFinalWinnerId = grandFinal.winnerParticipantId ?: return true
    val losersSideParticipantId = grandFinal.participantIds.getOrNull(1)?.takeIf { it.isNotBlank() } ?: return true
    return grandFinalWinnerId != losersSideParticipantId
}

private data class QuickReportScoreOption(
    val key: String,
    val winnerParticipantId: String,
    val winnerScore: Int,
    val loserScore: Int,
)

private data class QuickReportGameDraft(
    val winnerParticipantId: String,
    val firstCharacter: String = "",
    val secondCharacter: String = "",
)

@Composable
private fun QuickReportResultDialog(
    match: MatchSummary,
    isSaving: Boolean,
    errorMessage: String?,
    effectiveBestOf: Int,
    requiresCharacters: Boolean,
    initialCharacters: List<String>,
    initialScoreKey: String?,
    initialGames: List<QuickReportGameDraft>,
    onDismiss: () -> Unit,
    onSubmit: (String, String, String, List<QuickReportGameDraft>) -> Unit,
) {
    val scoreOptions = remember(match.id, effectiveBestOf, match.participantIds) {
        buildQuickReportScoreOptions(match, effectiveBestOf)
    }
    var firstCharacter by remember(match.id) { mutableStateOf(initialCharacters.getOrNull(0).orEmpty()) }
    var secondCharacter by remember(match.id) { mutableStateOf(initialCharacters.getOrNull(1).orEmpty()) }
    var selectedScoreKey by remember(match.id) { mutableStateOf(initialScoreKey) }
    var games by remember(match.id) { mutableStateOf(initialGames) }

    LaunchedEffect(match.id) {
        if (games.isEmpty() && !selectedScoreKey.isNullOrBlank()) {
            scoreOptions.firstOrNull { it.key == selectedScoreKey }?.let { option ->
                games = buildQuickReportGames(match, option, firstCharacter, secondCharacter)
            }
        }
    }

    val canSubmit = selectedScoreKey != null
        && scoreOptions.any { it.key == selectedScoreKey }
        && games.isNotEmpty()
        && games.size <= effectiveBestOf
        && (!requiresCharacters || games.all { game -> listOf(game.firstCharacter, game.secondCharacter).all { value -> value.split("/").size == match.entrantSize && value.split("/").all { it.isNotBlank() } } })

    AlertDialog(
        onDismissRequest = { if (!isSaving) onDismiss() },
        title = { Column { Text("Quick report"); errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) } } },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = "Select the final result and review games before submitting them together.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "Set format: Bo$effectiveBestOf",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (requiresCharacters) {
                    CharacterSelectorField(
                        characterCount = match.entrantSize, gameTitle = match.gameTitle,
                        label = "${match.participantNames[0]} (base)",
                        selectedCharacter = firstCharacter,
                        onCharacterSelected = {
                            firstCharacter = it
                            games = games.map { game -> game.copy(firstCharacter = it) }
                        },
                    )
                    CharacterSelectorField(
                        characterCount = match.entrantSize, gameTitle = match.gameTitle,
                        label = "${match.participantNames[1]} (base)",
                        selectedCharacter = secondCharacter,
                        onCharacterSelected = {
                            secondCharacter = it
                            games = games.map { game -> game.copy(secondCharacter = it) }
                        },
                    )
                }
                Text("Final result", fontWeight = FontWeight.SemiBold)
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    scoreOptions.forEach { option ->
                        val isSelected = option.key == selectedScoreKey
                        Button(
                            onClick = {
                                selectedScoreKey = option.key
                                games = buildQuickReportGames(match, option, firstCharacter, secondCharacter)
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                contentColor = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                            ),
                        ) {
                            Text("${winnerNameForOption(match, option)} ${option.winnerScore}-${option.loserScore}")
                        }
                    }
                }
                if (games.isNotEmpty()) {
                    Text("Game summary", fontWeight = FontWeight.SemiBold)
                    games.forEachIndexed { index, game ->
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                            ),
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text("Game ${index + 1}", fontWeight = FontWeight.SemiBold)
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(
                                        onClick = {
                                            games = games.mapIndexed { gameIndex, current ->
                                                if (gameIndex == index) current.copy(winnerParticipantId = match.participantIds[0]) else current
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = if (game.winnerParticipantId == match.participantIds[0]) MainPalette.successContainer else MaterialTheme.colorScheme.surface,
                                            contentColor = if (game.winnerParticipantId == match.participantIds[0]) MainPalette.success else MaterialTheme.colorScheme.onSurface,
                                        ),
                                    ) {
                                        Text(match.participantNames[0])
                                    }
                                    Button(
                                        onClick = {
                                            games = games.mapIndexed { gameIndex, current ->
                                                if (gameIndex == index) current.copy(winnerParticipantId = match.participantIds[1]) else current
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = if (game.winnerParticipantId == match.participantIds[1]) MainPalette.successContainer else MaterialTheme.colorScheme.surface,
                                            contentColor = if (game.winnerParticipantId == match.participantIds[1]) MainPalette.success else MaterialTheme.colorScheme.onSurface,
                                        ),
                                    ) {
                                        Text(match.participantNames[1])
                                    }
                                }
                                if (requiresCharacters) {
                                    CharacterSelectorField(
                        characterCount = match.entrantSize, gameTitle = match.gameTitle,
                                        label = match.participantNames[0],
                                        selectedCharacter = game.firstCharacter,
                                        onCharacterSelected = { character ->
                                            games = games.mapIndexed { gameIndex, current ->
                                                if (gameIndex == index) current.copy(firstCharacter = character) else current
                                            }
                                        },
                                    )
                                    CharacterSelectorField(
                        characterCount = match.entrantSize, gameTitle = match.gameTitle,
                                        label = match.participantNames[1],
                                        selectedCharacter = game.secondCharacter,
                                        onCharacterSelected = { character ->
                                            games = games.mapIndexed { gameIndex, current ->
                                                if (gameIndex == index) current.copy(secondCharacter = character) else current
                                            }
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSubmit(selectedScoreKey.orEmpty(), firstCharacter, secondCharacter, games)
                },
                enabled = canSubmit && !isSaving,
            ) {
                Text(if (isSaving) "Guardando..." else "Report")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) {
                Text("Cancel")
            }
        },
    )
}

@Composable
private fun QuickReportBestOfDialog(
    defaultBestOf: Int,
    selectedOverride: Int?,
    onDismiss: () -> Unit,
    onConfirm: (Int?) -> Unit,
) {
    val options = listOf(
        null to "Tournament default (Bo$defaultBestOf)",
        1 to "Bo1",
        3 to "Bo3",
        5 to "Bo5",
    )
    var selectedValue by rememberSaveable(defaultBestOf, selectedOverride) {
        mutableStateOf(selectedOverride)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Set format") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Select whether this match used the default tournament format or a different one.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                options.forEach { (value, label) ->
                    val selected = selectedValue == value
                    Button(
                        onClick = { selectedValue = value },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                            contentColor = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                        ),
                    ) {
                        Text(label)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(selectedValue) }) {
                Text("Continue")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}

private fun buildQuickReportScoreOptions(match: MatchSummary, effectiveBestOf: Int): List<QuickReportScoreOption> {
    if (match.participantIds.size < 2) {
        return emptyList()
    }
    val winsNeeded = (effectiveBestOf / 2) + 1
    val firstParticipantId = match.participantIds[0]
    val secondParticipantId = match.participantIds[1]
    return buildList {
        for (loserScore in 0 until winsNeeded) {
            add(
                QuickReportScoreOption(
                    key = "$firstParticipantId:$winsNeeded-$loserScore",
                    winnerParticipantId = firstParticipantId,
                    winnerScore = winsNeeded,
                    loserScore = loserScore,
                ),
            )
        }
        for (loserScore in 0 until winsNeeded) {
            add(
                QuickReportScoreOption(
                    key = "$secondParticipantId:$winsNeeded-$loserScore",
                    winnerParticipantId = secondParticipantId,
                    winnerScore = winsNeeded,
                    loserScore = loserScore,
                ),
            )
        }
    }
}

private fun buildQuickReportGames(
    match: MatchSummary,
    option: QuickReportScoreOption,
    firstCharacter: String,
    secondCharacter: String,
): List<QuickReportGameDraft> {
    if (match.participantIds.size < 2) {
        return emptyList()
    }
    val actualLoserId = match.participantIds.firstOrNull { it != option.winnerParticipantId } ?: return emptyList()
    val games = mutableListOf<QuickReportGameDraft>()
    repeat(option.loserScore) {
        games += QuickReportGameDraft(option.winnerParticipantId, firstCharacter, secondCharacter)
        games += QuickReportGameDraft(actualLoserId, firstCharacter, secondCharacter)
    }
    repeat((option.winnerScore - option.loserScore - 1).coerceAtLeast(0)) {
        games += QuickReportGameDraft(option.winnerParticipantId, firstCharacter, secondCharacter)
    }
    games += QuickReportGameDraft(option.winnerParticipantId, firstCharacter, secondCharacter)
    return games
}

private fun winnerNameForOption(match: MatchSummary, option: QuickReportScoreOption): String {
    val winnerIndex = match.participantIds.indexOf(option.winnerParticipantId)
    return match.participantNames.getOrElse(winnerIndex) { "Winner" }
}

private fun currentQuickReportGames(match: MatchSummary): List<QuickReportGameDraft> {
    if (match.participantIds.size < 2 || match.gameResults.isEmpty()) {
        return emptyList()
    }
    val firstParticipantId = match.participantIds[0]
    val secondParticipantId = match.participantIds[1]
    val latestSelections = match.characterSelections.associateBy { it.participantId }
    val selectionsByGame = match.gameCharacterSelections.associateBy { it.gameNum }
    return match.gameResults.mapIndexed { index, winnerParticipantId ->
        val perGameSelections = selectionsByGame[index + 1]
            ?.selections
            ?.associateBy { it.participantId }
            .orEmpty()
        QuickReportGameDraft(
            winnerParticipantId = winnerParticipantId,
            firstCharacter = perGameSelections[firstParticipantId]?.characterName
                ?: latestSelections[firstParticipantId]?.characterName
                .orEmpty(),
            secondCharacter = perGameSelections[secondParticipantId]?.characterName
                ?: latestSelections[secondParticipantId]?.characterName
                .orEmpty(),
        )
    }
}

private fun formatLabel(
    format: String,
    bracketMode: String,
    mkartAdvanceCount: Int,
    mkartLosersAdvanceCount: Int,
    winnersBestOf: Int,
    losersBestOf: Int
): String {
    if (bracketMode == "MKART") {
        val formatBase = if (format == "DOUBLE_ELIMINATION") "MKART double" else "MKART single"
        return if (format == "DOUBLE_ELIMINATION") {
            "$formatBase - W pasa $mkartAdvanceCount / L pasa $mkartLosersAdvanceCount"
        } else {
            "$formatBase - pasa $mkartAdvanceCount"
        }
    }

    val base = when (format) {
        "SINGLE_ELIMINATION" -> "Single elimination"
        "DOUBLE_ELIMINATION" -> "Double elimination"
        "ROUND_ROBIN" -> "Round robin"
        "SWISS" -> "Swiss"
        "GROUPS_PLAYOFF" -> "Grupos + playoff"
        else -> format
    }
    return if (format == "DOUBLE_ELIMINATION") {
        "$base - W Bo$winnersBestOf / L Bo$losersBestOf"
    } else {
        "$base - Bo$winnersBestOf"
    }
}

private fun computeRemainingSeconds(calledAt: String?, timeoutMinutes: Int, nowMillis: Long): Long {
    if (calledAt == null) {
        return 0L
    }

    val calledInstant = runCatching { Instant.parse(calledAt) }.getOrNull() ?: return 0L
    val expireInstant = calledInstant.plus(Duration.ofMinutes(timeoutMinutes.toLong()))
    return Duration.between(Instant.ofEpochMilli(nowMillis), expireInstant).seconds
}

private fun formatTimer(seconds: Long): String {
    val safe = if (seconds < 0) 0 else seconds
    val minutes = safe / 60
    val remaining = safe % 60
    return "%02d:%02d".format(minutes, remaining)
}

private fun isTournamentStarted(status: String): Boolean {
    return status == "IN_PROGRESS" || status == "IN PROGRESS" || status == "COMPLETED"
}

private fun isPlaceholderParticipantId(participantId: String): Boolean {
    return participantId.startsWith("winner_of_")
        || participantId.startsWith("loser_of_")
        || participantId.startsWith("advance_")
        || participantId.startsWith("drop_")
}

private fun hasResolvedContenders(match: MatchSummary): Boolean {
    return match.participantIds.size >= 2
        && match.participantNames.size >= 2
        && match.participantIds.all { it.isNotBlank() && !isPlaceholderParticipantId(it) }
}

private fun matchMatchesPlayerQuery(match: MatchSummary, query: String): Boolean {
    val normalizedQuery = query.trim().lowercase()
    if (normalizedQuery.isBlank()) {
        return true
    }
    return match.participantNames.any { participantName ->
        participantName.lowercase().contains(normalizedQuery)
    } || match.poolAwareLabel.lowercase().contains(normalizedQuery)
}

private data class TournamentSetupStatus(
    val label: String,
    val occupyingMatchLabel: String? = null,
    val occupyingParticipants: String? = null
)

private fun buildTournamentSetups(detail: TournamentDetail): List<TournamentSetupStatus> {
    val setupCount = detail.setupCount.coerceAtLeast(1)
    val occupiedBySetup = detail.matches
        .filter { isSetupOccupyingMatch(it) }
        .mapNotNull { match ->
            normalizeSetupLabel(match.stationLabel)?.let { setupLabel ->
                setupLabel to TournamentSetupStatus(
                    label = setupLabel,
                    occupyingMatchLabel = match.poolAwareLabel,
                    occupyingParticipants = match.participantsLabel
                )
            }
        }
        .toMap()

    return tournamentStationLabels(setupCount, detail.streamCount).map { label ->
        occupiedBySetup[label] ?: TournamentSetupStatus(label = label)
    }
}

private fun availableSetupLabelsForMatch(detail: TournamentDetail, targetMatch: MatchSummary): List<String> {
    val setupCount = detail.setupCount.coerceAtLeast(1)
    val occupiedSetups = detail.matches
        .asSequence()
        .filter { it.id != targetMatch.id }
        .filter { isSetupOccupyingMatch(it) }
        .mapNotNull { normalizeSetupLabel(it.stationLabel) }
        .toSet()
    return tournamentStationLabels(setupCount, detail.streamCount)
        .filter { it !in occupiedSetups }
}

private fun normalizeSetupLabel(stationLabel: String?): String? {
    val normalized = stationLabel?.trim().orEmpty()
    if (normalized.isBlank()) {
        return null
    }
    if (normalized.startsWith("Stream", ignoreCase = true)) return "Stream ${normalized.filter(Char::isDigit).toIntOrNull() ?: return normalized}"
    val digits = normalized.filter(Char::isDigit)
    return if (digits.isNotBlank()) {
        "Setup ${digits.toIntOrNull() ?: digits}"
    } else {
        normalized
    }
}

private fun isSetupOccupyingMatch(match: MatchSummary): Boolean {
    return normalizeSetupLabel(match.stationLabel) != null && when (match.status) {
        "CALLED", "CHECKED_IN", "PLAYING", "RESULT_REPORTED", "UNDER_REVIEW" -> true
        else -> false
    }
}

@Composable
private fun LoadingCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f)
        )
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            CircularProgressIndicator(modifier = Modifier.height(24.dp))
            Text("Cargando...", color = MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onBackground
    )
}

@Composable
private fun InfoCard(title: String, body: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f)
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(4.dp))
        }
    }
}
