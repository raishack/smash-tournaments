package com.gestortorneos.player.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.gestortorneos.player.data.PlayerRepository
import com.gestortorneos.player.data.PlayerRepository.DetailedReportedGame
import com.gestortorneos.player.data.PlayerSession
import com.gestortorneos.player.data.PlayerSessionStore
import com.gestortorneos.player.data.remote.BackendConfig
import com.gestortorneos.player.data.remote.PlayerMatchDto
import com.gestortorneos.player.data.remote.PlayerTournamentDto
import com.gestortorneos.player.notifications.areMatchCallNotificationsEnabled
import com.gestortorneos.player.notifications.PlayerBackgroundSyncScheduler
import com.gestortorneos.player.notifications.PlayerRealtimeSyncService
import com.gestortorneos.player.notifications.clearMatchCallNotificationState
import com.gestortorneos.player.notifications.ensureNotificationsChannel
import com.gestortorneos.player.notifications.hasNotificationsPermission
import com.gestortorneos.player.notifications.isBatteryOptimizationIgnored
import com.gestortorneos.player.notifications.notifyCalledMatches
import com.gestortorneos.player.notifications.openAppNotificationSettings
import com.gestortorneos.player.notifications.openBatteryOptimizationSettings
import com.gestortorneos.player.notifications.openMatchCallChannelSettings
import com.gestortorneos.player.notifications.registerCurrentPushToken
import com.gestortorneos.player.notifications.unregisterCurrentPushToken
import com.gestortorneos.player.updates.AndroidAppUpdateGate
import com.gestortorneos.ui.*
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private const val PLAYER_REDIRECT_URI = "tournamentplayer://auth/callback"

private enum class PlayerSection(val label: String) {
    Dashboard("Inicio"),
    Tournaments("Torneos"),
    Bracket("Bracket"),
    Profile("Perfil")
}

private typealias PlayerThemeMode = MainThemeMode
private val LocalPlayerBusy = staticCompositionLocalOf { false }
private val LocalPlayerError = staticCompositionLocalOf<String?> { null }

data class AuthCallbackPayload(
    val sessionToken: String?,
    val displayName: String?,
    val gamerTag: String?,
    val error: String?
)

object PlayerAuthBridge {
    private val payloads = MutableStateFlow<AuthCallbackPayload?>(null)
    val stream = payloads.asStateFlow()

    fun publishFromUri(uri: Uri) {
        payloads.value = AuthCallbackPayload(
            sessionToken = uri.getQueryParameter("sessionToken"),
            displayName = uri.getQueryParameter("displayName"),
            gamerTag = uri.getQueryParameter("gamerTag"),
            error = uri.getQueryParameter("error")
        )
    }

    fun clear() {
        payloads.value = null
    }
}

private val smashUltimateCharacterNames = listOf(
    "Bayonetta", "Bowser Jr.", "Bowser", "Captain Falcon", "Cloud", "Corrin", "Daisy",
    "Dark Pit", "Diddy Kong", "Donkey Kong", "Dr. Mario", "Duck Hunt", "Falco", "Fox",
    "Ganondorf", "Greninja", "Ice Climbers", "Ike", "Inkling", "Jigglypuff", "King Dedede",
    "Kirby", "Link", "Little Mac", "Lucario", "Lucas", "Lucina", "Luigi", "Mario", "Marth",
    "Mega Man", "Meta Knight", "Mewtwo", "Mii Brawler", "Ness", "Olimar", "Pac-Man",
    "Palutena", "Peach", "Pichu", "Pikachu", "Pit", "Pokemon Trainer", "Ridley", "R.O.B.",
    "Robin", "Rosalina", "Roy", "Ryu", "Samus", "Sheik", "Shulk", "Snake", "Sonic",
    "Toon Link", "Villager", "Wario", "Wii Fit Trainer", "Wolf", "Yoshi", "Young Link",
    "Zelda", "Zero Suit Samus", "Mr. Game & Watch", "Incineroar", "King K. Rool", "Dark Samus",
    "Chrom", "Ken", "Simon Belmont", "Richter", "Isabelle", "Mii Swordfighter", "Mii Gunner",
    "Piranha Plant", "Joker", "Hero", "Banjo-Kazooie", "Terry", "Byleth", "Random Character",
    "Min Min", "Steve", "Sephiroth", "Pyra & Mythra", "Kazuya", "Sora",
)

@Composable
fun PlayerApp() {
    val context = LocalContext.current
    val repository = remember { PlayerRepository() }
    val scope = rememberCoroutineScope()
    val preferences = remember(context) {
        context.getSharedPreferences("gestor_torneos_player_preferences", Context.MODE_PRIVATE)
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    var section by rememberSaveable { mutableStateOf(PlayerSection.Dashboard) }
    remember { BackendConfig.initialize() }
    var session by remember(context) { mutableStateOf(PlayerSessionStore.load(context)) }
    var backgroundSyncArmed by remember(context) { mutableStateOf(PlayerSessionStore.isBackgroundSyncArmed(context)) }
    var notificationsGranted by remember(context) { mutableStateOf(hasNotificationsPermission(context)) }
    var matchCallNotificationsEnabled by remember(context) { mutableStateOf(areMatchCallNotificationsEnabled(context)) }
    var batteryOptimizationIgnored by remember(context) { mutableStateOf(isBatteryOptimizationIgnored(context)) }
    var tournaments by remember { mutableStateOf<List<PlayerTournamentDto>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var latestTournamentRefreshRequestId by remember { mutableStateOf(0) }
    var pendingMutationCount by remember { mutableStateOf(0) }
    val mutationMutex = remember { Mutex() }
    var themeMode by remember {
        mutableStateOf(
            preferences.getString("theme_mode", PlayerThemeMode.System.name)
                ?.let { saved -> runCatching { PlayerThemeMode.valueOf(saved) }.getOrDefault(PlayerThemeMode.System) }
                ?: PlayerThemeMode.System
        )
    }
    var textSize by remember { mutableStateOf(runCatching {
        MainTextSize.valueOf(preferences.getString("text_size", MainTextSize.Regular.name)!!)
    }.getOrDefault(MainTextSize.Regular)) }
    val notificationsPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {
        notificationsGranted = hasNotificationsPermission(context)
        matchCallNotificationsEnabled = areMatchCallNotificationsEnabled(context)
    }

    fun refreshDeliverySettings() {
        notificationsGranted = hasNotificationsPermission(context)
        matchCallNotificationsEnabled = areMatchCallNotificationsEnabled(context)
        batteryOptimizationIgnored = isBatteryOptimizationIgnored(context)
    }

    fun armBackgroundSync() {
        if (session == null || backgroundSyncArmed) {
            return
        }
        PlayerSessionStore.setBackgroundSyncArmed(context, true)
        backgroundSyncArmed = true
        PlayerRealtimeSyncService.start(context)
        PlayerBackgroundSyncScheduler.ensureScheduled(context)
        PlayerBackgroundSyncScheduler.triggerImmediate(context)
    }

    fun disarmBackgroundSync() {
        PlayerSessionStore.setBackgroundSyncArmed(context, false)
        backgroundSyncArmed = false
        PlayerRealtimeSyncService.stop(context)
        PlayerBackgroundSyncScheduler.cancel(context)
        clearMatchCallNotificationState(context)
    }

    suspend fun reloadTournaments(activeSession: PlayerSession, allowBackgroundArm: Boolean) {
        if (session?.sessionToken != activeSession.sessionToken) return
        val requestId = latestTournamentRefreshRequestId + 1
        latestTournamentRefreshRequestId = requestId
        val loaded = repository.getMyTournaments(activeSession.sessionToken)
        if (requestId != latestTournamentRefreshRequestId || session?.sessionToken != activeSession.sessionToken) {
            return
        }
        tournaments = loaded
        error = null
        notifyCalledMatches(context, loaded)
        if (loaded.isEmpty()) {
            if (backgroundSyncArmed) {
                disarmBackgroundSync()
            }
        } else if (allowBackgroundArm) {
            armBackgroundSync()
        }
    }

    fun launchSerializedMutation(
        failureMessage: String,
        block: suspend (PlayerSession) -> Unit
    ) {
        val activeSession = session ?: return
        if (pendingMutationCount > 0) return
        pendingMutationCount += 1
        error = null
        scope.launch {
            mutationMutex.withLock {
                try {
                    if (session?.sessionToken != activeSession.sessionToken) return@withLock
                    runCatching {
                        block(activeSession)
                    }.onFailure { throwable ->
                        if (throwable is CancellationException) throw throwable
                        if (session?.sessionToken == activeSession.sessionToken) error = throwable.message ?: failureMessage
                    }
                } finally {
                    pendingMutationCount = (pendingMutationCount - 1).coerceAtLeast(0)
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        ensureNotificationsChannel(context)
        refreshDeliverySettings()
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                refreshDeliverySettings()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    LaunchedEffect(themeMode) {
        preferences.edit().putString("theme_mode", themeMode.name).apply()
    }

    val authPayload by PlayerAuthBridge.stream.collectAsState()

    LaunchedEffect(authPayload) {
        val payload = authPayload ?: return@LaunchedEffect
        PlayerAuthBridge.clear()
        if (!payload.sessionToken.isNullOrBlank()) {
            val resolved = PlayerSession(
                sessionToken = payload.sessionToken,
                displayName = payload.displayName.orEmpty(),
                gamerTag = payload.gamerTag.orEmpty()
            )
            PlayerSessionStore.save(context, resolved)
            PlayerSessionStore.setBackgroundSyncArmed(context, false)
            latestTournamentRefreshRequestId++
            tournaments = emptyList()
            session = resolved
            backgroundSyncArmed = false
            message = "Sesion start.gg guardada"
            error = null
        } else if (!payload.error.isNullOrBlank()) {
            error = payload.error
        }
    }

    LaunchedEffect(session?.sessionToken) {
        if (session == null) {
            disarmBackgroundSync()
            tournaments = emptyList()
            PlayerSessionStore.clearPushRegistration(context)
            return@LaunchedEffect
        }
        val activeSession = session ?: return@LaunchedEffect
        loading = true
        runCatching {
            refreshPlayerSession(
                { registerCurrentPushToken(context, repository, activeSession.sessionToken) },
                { reloadTournaments(activeSession, allowBackgroundArm = true) }
            )
        }.onFailure { throwable ->
            if (throwable is CancellationException) throw throwable
            if (session?.sessionToken == activeSession.sessionToken) error = throwable.message ?: "No se pudo actualizar el estado del jugador"
        }
        loading = false
    }

    LaunchedEffect(session?.sessionToken, backgroundSyncArmed) {
        val activeSession = session ?: return@LaunchedEffect
        if (!backgroundSyncArmed) {
            return@LaunchedEffect
        }
        while (true) {
            if (pendingMutationCount == 0) {
                runCatching {
                    reloadTournaments(activeSession, allowBackgroundArm = false)
                }.onFailure { throwable ->
                    if (throwable is CancellationException) throw throwable
                    if (session?.sessionToken == activeSession.sessionToken) error = throwable.message ?: "No se pudo actualizar el estado del jugador"
                }
            }
            if (!backgroundSyncArmed) {
                break
            }
            delay(3_000)
        }
    }

    CompositionLocalProvider(LocalPlayerBusy provides (pendingMutationCount > 0), LocalPlayerError provides error) {
    MainTheme(MainAppearance(themeMode, textSize, { themeMode = it }, {
        textSize = it
        preferences.edit().putString("text_size", it.name).apply()
    })) {
        AndroidAppUpdateGate()

        Scaffold(
            containerColor = Color.Transparent,
            bottomBar = {
                NavigationBar {
                    PlayerSection.entries.forEach { item ->
                        NavigationBarItem(
                            selected = section == item,
                            onClick = { section = item },
                            icon = {},
                            label = { Text(item.label) }
                        )
                    }
                }
            }
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        brush = Brush.verticalGradient(
                            colors = listOf(MaterialTheme.colorScheme.background, MaterialTheme.colorScheme.surface)
                        )
                    )
                    .padding(innerPadding)
            ) {
                when (section) {
                    PlayerSection.Dashboard -> DashboardSection(
                        session = session,
                        tournaments = tournaments,
                        loading = loading,
                        message = message,
                        error = error,
                        onSaveCharacters = { tournamentId, matchId, selections ->
                            launchSerializedMutation("No se pudieron guardar los personajes") { activeSession ->
                                repository.updateCharacters(activeSession.sessionToken, tournamentId, matchId, selections)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onRecordGameWin = { tournamentId, match, participantId, selections ->
                            launchSerializedMutation("No se pudo reportar el juego") { activeSession ->
                                if (match.canReportCharacters && selections.isNotEmpty()) {
                                    repository.updateCharacters(activeSession.sessionToken, tournamentId, match.id, selections)
                                }
                                repository.recordGameWin(activeSession.sessionToken, tournamentId, match.id, participantId)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onReportDetailedResult = { tournamentId, matchId, bestOfOverride, games ->
                            launchSerializedMutation("No se pudo anotar el set") { activeSession ->
                                repository.reportDetailedResult(activeSession.sessionToken, tournamentId, matchId, bestOfOverride, games)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onResetMatch = { tournamentId, matchId ->
                            launchSerializedMutation("No se pudo resetear el set") { activeSession ->
                                repository.resetMatch(activeSession.sessionToken, tournamentId, matchId)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onReadyLadderMatch = { tournamentId, matchId ->
                            launchSerializedMutation("No se pudo confirmar que estas listo") { activeSession ->
                                repository.readyLadderMatch(activeSession.sessionToken, tournamentId, matchId)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onReviewLadder = { tournamentId, matchId, revision, action, reason ->
                            launchSerializedMutation("No se pudo revisar el resultado") { activeSession ->
                                repository.reviewLadder(activeSession.sessionToken,tournamentId,matchId,revision,action,reason)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onCancelLadderMatch = { tournamentId, matchId ->
                            launchSerializedMutation("No se pudo cancelar el emparejamiento") { activeSession ->
                                repository.cancelLadderMatch(activeSession.sessionToken, tournamentId, matchId)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onReportLadderDetailedResult = { tournamentId, matchId, bestOfOverride, games ->
                            launchSerializedMutation("No se pudo anotar la ladder") { activeSession ->
                                repository.reportLadderDetailedResult(activeSession.sessionToken, tournamentId, matchId, bestOfOverride, games)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onLogin = {
                            scope.launch {
                                runCatching {
                                    repository.createStartggLogin(PLAYER_REDIRECT_URI)
                                }.onSuccess { authUrl ->
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(authUrl)))
                                    message = "Abriendo login de start.gg"
                                    error = null
                                }.onFailure { throwable ->
                                    error = throwable.message ?: "No se pudo iniciar el login"
                                }
                            }
                        }
                    )
                    PlayerSection.Tournaments -> TournamentSection(
                        tournaments = tournaments,
                        session = session,
                        onSaveCharacters = { tournamentId, matchId, selections ->
                            launchSerializedMutation("No se pudieron guardar los personajes") { activeSession ->
                                repository.updateCharacters(activeSession.sessionToken, tournamentId, matchId, selections)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onRecordGameWin = { tournamentId, match, participantId, selections ->
                            launchSerializedMutation("No se pudo reportar el juego") { activeSession ->
                                if (match.canReportCharacters && selections.isNotEmpty()) {
                                    repository.updateCharacters(activeSession.sessionToken, tournamentId, match.id, selections)
                                }
                                repository.recordGameWin(activeSession.sessionToken, tournamentId, match.id, participantId)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onReportDetailedResult = { tournamentId, matchId, bestOfOverride, games ->
                            launchSerializedMutation("No se pudo anotar el set") { activeSession ->
                                repository.reportDetailedResult(activeSession.sessionToken, tournamentId, matchId, bestOfOverride, games)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onResetMatch = { tournamentId, matchId ->
                            launchSerializedMutation("No se pudo resetear el set") { activeSession ->
                                repository.resetMatch(activeSession.sessionToken, tournamentId, matchId)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onJoinLadderQueue = { tournamentId ->
                            launchSerializedMutation("No se pudo entrar en cola") { activeSession ->
                                repository.joinLadderQueue(activeSession.sessionToken, tournamentId)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onLeaveLadderQueue = { tournamentId ->
                            launchSerializedMutation("No se pudo salir de la cola") { activeSession ->
                                repository.leaveLadderQueue(activeSession.sessionToken, tournamentId)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onReadyLadderMatch = { tournamentId, matchId ->
                            launchSerializedMutation("No se pudo confirmar que estas listo") { activeSession ->
                                repository.readyLadderMatch(activeSession.sessionToken, tournamentId, matchId)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onReviewLadder = { tournamentId, matchId, revision, action, reason ->
                            launchSerializedMutation("No se pudo revisar el resultado") { activeSession ->
                                repository.reviewLadder(activeSession.sessionToken,tournamentId,matchId,revision,action,reason)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onCancelLadderMatch = { tournamentId, matchId ->
                            launchSerializedMutation("No se pudo cancelar el emparejamiento") { activeSession ->
                                repository.cancelLadderMatch(activeSession.sessionToken, tournamentId, matchId)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        },
                        onReportLadderDetailedResult = { tournamentId, matchId, bestOfOverride, games ->
                            launchSerializedMutation("No se pudo anotar la ladder") { activeSession ->
                                repository.reportLadderDetailedResult(activeSession.sessionToken, tournamentId, matchId, bestOfOverride, games)
                                reloadTournaments(activeSession, allowBackgroundArm = false)
                            }
                        }
                    )
                    PlayerSection.Bracket -> BracketSection(
                        tournaments = tournaments,
                        session = session,
                        repository = repository,
                    )
                    PlayerSection.Profile -> ProfileSection(
                        session = session,
                        message = message,
                        error = error,
                        themeMode = themeMode,
                        backgroundSyncArmed = backgroundSyncArmed,
                        notificationsGranted = notificationsGranted,
                        matchCallNotificationsEnabled = matchCallNotificationsEnabled,
                        batteryOptimizationIgnored = batteryOptimizationIgnored,
                        onThemeSelected = { themeMode = it },
                        onEnableNotifications = {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notificationsGranted) {
                                notificationsPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                            } else {
                                openAppNotificationSettings(context)
                            }
                        },
                        onOpenNotificationSettings = {
                            openMatchCallChannelSettings(context)
                        },
                        onOpenBatterySettings = {
                            openBatteryOptimizationSettings(context)
                        },
                        onLogout = {
                            val activeSession = session
                            val pushToken = PlayerSessionStore.getRegisteredPushToken(context)
                            latestTournamentRefreshRequestId++
                            PlayerSessionStore.clear(context)
                            session = null
                            tournaments = emptyList()
                            loading = false
                            disarmBackgroundSync()
                            message = "Sesion cerrada"
                            error = null
                            scope.launch {
                                activeSession?.let {
                                    runCatching { unregisterCurrentPushToken(context, repository, it.sessionToken, pushToken) }
                                    runCatching { repository.logout(it.sessionToken) }
                                }
                            }
                        }
                    )
                }
            }
        }
    }
    }
}

@Composable
private fun DashboardSection(
    session: PlayerSession?,
    tournaments: List<PlayerTournamentDto>,
    loading: Boolean,
    message: String?,
    error: String?,
    onSaveCharacters: (String, String, List<Pair<String, String>>) -> Unit,
    onRecordGameWin: (String, PlayerMatchDto, String, List<Pair<String, String>>) -> Unit,
    onReportDetailedResult: (String, String, Int?, List<DetailedReportedGame>) -> Unit,
    onResetMatch: (String, String) -> Unit,
    onReadyLadderMatch: (String, String) -> Unit,
    onReviewLadder: (String, String, String, String, String?) -> Unit,
    onCancelLadderMatch: (String, String) -> Unit,
    onReportLadderDetailedResult: (String, String, Int?, List<DetailedReportedGame>) -> Unit,
    onLogin: () -> Unit
) {
    val activeMatches = tournaments.flatMap { tournament ->
        tournament.activeMatches.map { DashboardActiveMatchEntry(tournament.tournamentId, it, isLadder = false) } +
            listOfNotNull(
                tournament.ladder?.readyCheckMatch?.let {
                    DashboardActiveMatchEntry(tournament.tournamentId, it, isLadder = true)
                },
                tournament.ladder?.activeMatch?.let {
                    DashboardActiveMatchEntry(tournament.tournamentId, it, isLadder = true)
                },
            )
    }.sortedWith(compareBy<DashboardActiveMatchEntry>({ activePlayerMatchPriority(it.match) }, { activePlayerMatchTimelineAnchor(it.match) }, { it.match.roundLabel }, { it.match.id }))
    val pendingMatches = tournaments.flatMap { it.pendingMatches }
        .sortedWith(compareBy<PlayerMatchDto>({ it.roundLabel }, { it.id }))
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        CardSection {
            Text("Smash Players", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("Tus partidas, resultados y ladder, en un solo lugar.")
            Spacer(Modifier.height(8.dp))
            if (session == null) {
                Button(onClick = onLogin) { Text("Entrar con start.gg") }
            } else {
                MainStatusBadge("Conectado con start.gg", "COMPLETED")
                Text(cleanedPlayerSessionLabel(session), style = MaterialTheme.typography.titleMedium)
            }
            if (message != null) {
                Spacer(Modifier.height(8.dp))
                Text(message, color = MainPalette.success)
            }
            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(error, color = MaterialTheme.colorScheme.error)
            }
        }

        if (loading) {
            CircularProgressIndicator()
        } else {
            CardSection {
                Text("En juego o llamados", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                if (activeMatches.isEmpty()) {
                    Text(if (session == null) "Entra con start.gg para ver tus partidas y recibir los avisos de tus torneos." else "No tienes sets activos ahora mismo.")
                } else {
                    activeMatches.forEach { entry ->
                        when {
                            entry.isLadder && entry.match.status == "READY_CHECK" -> LadderReadyCheckCard(
                                match = entry.match,
                                onReady = { onReadyLadderMatch(entry.tournamentId, entry.match.id) },
                                onCancel = { onCancelLadderMatch(entry.tournamentId, entry.match.id) },
                            )
                            entry.isLadder -> LadderActiveMatchCard(
                                match = entry.match,
                                onReview = { action, reason -> onReviewLadder(entry.tournamentId,entry.match.id,entry.match.ladderRevision ?: "",action,reason) },
                                onReportDetailedResult = { matchId, bestOfOverride, games ->
                                    onReportLadderDetailedResult(entry.tournamentId, matchId, bestOfOverride, games)
                                },
                            )
                            else -> PlayerMatchCard(
                                tournamentId = entry.tournamentId,
                                match = entry.match,
                                onSaveCharacters = onSaveCharacters,
                                onRecordGameWin = onRecordGameWin,
                                onReportDetailedResult = onReportDetailedResult,
                                onResetMatch = onResetMatch,
                            )
                        }
                    }
                }
            }
            CardSection {
                Text("Pendientes", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                if (pendingMatches.isEmpty()) {
                    Text("No hay sets pendientes con rival asignado.")
                } else {
                    pendingMatches.forEach { match ->
                        MatchSummaryCard(match)
                    }
                }
            }
        }
    }
}

private data class DashboardActiveMatchEntry(
    val tournamentId: String,
    val match: PlayerMatchDto,
    val isLadder: Boolean,
)

private fun activePlayerMatchPriority(match: PlayerMatchDto): Int = when (match.status.uppercase()) {
    "PLAYING" -> 0
    "READY_CHECK" -> 1
    "CALLED" -> 2
    "CHECKED_IN" -> 3
    else -> 4
}

private fun parsePlayerIsoMillis(value: String?): Long? = runCatching {
    value?.takeIf { it.isNotBlank() }?.let { java.time.Instant.parse(it).toEpochMilli() }
}.getOrNull()

private fun activePlayerMatchTimelineAnchor(match: PlayerMatchDto): Long {
    return when (match.status.uppercase()) {
        "PLAYING" -> parsePlayerIsoMillis(match.startedAt)
        "CALLED" -> parsePlayerIsoMillis(match.calledAt)
        "READY_CHECK" -> parsePlayerIsoMillis(match.readyDeadlineAt)
        else -> null
    } ?: Long.MAX_VALUE
}

private fun cleanedPlayerSessionLabel(session: PlayerSession?): String {
    if (session == null) {
        return "Sin sesion start.gg"
    }

    fun clean(value: String): String {
        var text = value
            .replace("+¦+", " | ")
            .replace("+|+", " | ")
            .replace("¦", "|")
            .replace("Â¦", "|")
            .replace("Â|", "|")
            .replace("+", " ")
            .trim()
        while ("  " in text) {
            text = text.replace("  ", " ")
        }
        if ("|" in text) {
            text = text.split("|")
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .joinToString(" | ")
        }
        return text
    }

    val displayName = clean(session.displayName)
    val gamerTag = clean(session.gamerTag)
    return when {
        displayName.isBlank() -> gamerTag
        gamerTag.isBlank() -> displayName
        displayName.equals(gamerTag, ignoreCase = true) -> displayName
        displayName.lowercase().contains("| ${gamerTag.lowercase()}") -> displayName
        else -> "$displayName | $gamerTag"
    }
}

private fun playerMatchStageLabel(match: PlayerMatchDto): String? = when (match.bracketStage.trim().uppercase()) {
    "POOLS" -> "Pools"
    "WINNERS" -> "Bracket Winners"
    "LOSERS" -> "Bracket Losers"
    "FINALS" -> "Bracket Finals"
    "LADDER" -> "Ladder interna"
    else -> null
}

@Composable
private fun LadderTournamentSection(
    tournament: PlayerTournamentDto,
    ladder: com.gestortorneos.player.data.remote.PlayerLadderDto,
    onJoinQueue: () -> Unit,
    onLeaveQueue: () -> Unit,
    onReadyMatch: (String) -> Unit,
    onReview: (PlayerMatchDto, String, String?) -> Unit,
    onCancelReadyCheck: (String) -> Unit,
    onReportDetailedResult: (String, Int?, List<DetailedReportedGame>) -> Unit,
) {
    var showHistory by rememberSaveable(tournament.tournamentId) { mutableStateOf(false) }
    val cardColors = playerSurfaceCardColors()
    val mutedColor = MaterialTheme.colorScheme.onSurfaceVariant

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = cardColors,
        border = playerSurfaceCardBorder()
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text("Ladder interna · ${if(ladder.options?.settings?.mode == "COMPETITIVE") "Competitiva" else "Casual"}", fontWeight = FontWeight.Bold)
            if(ladder.options?.paused == true) Text("Pausada · puedes mantener tu lugar en cola")
            if(ladder.options?.closing == true) Text("Inscripciones cerradas · terminando sets abiertos")
            Text(
                when (ladder.status) {
                    "ACTIVE" -> "Activa"
                    "COMPLETED" -> "Finalizada"
                    else -> ladder.status
                },
                color = mutedColor
            )

            when {
                ladder.activeMatch != null -> {
                    LadderActiveMatchCard(
                        match = ladder.activeMatch,
                        onReview = { action,reason -> onReview(ladder.activeMatch,action,reason) },
                        onReportDetailedResult = onReportDetailedResult
                    )
                }

                ladder.readyCheckMatch != null -> {
                    LadderReadyCheckCard(
                        match = ladder.readyCheckMatch,
                        onReady = { onReadyMatch(ladder.readyCheckMatch.id) },
                        onCancel = { onCancelReadyCheck(ladder.readyCheckMatch.id) }
                    )
                }

                !ladder.queuedAt.isNullOrBlank() && ladder.status == "ACTIVE" -> {
                    Text("Posición ${ladder.queuePosition ?: "—"} · ${ladder.waitingReason ?: "Buscando rival"}", color = mutedColor)
                    Button(onClick = onLeaveQueue) {
                        Text("Salir de cola")
                    }
                }

                ladder.status == "ACTIVE" && ladder.canJoin != false -> {
                    Button(onClick = onJoinQueue) {
                        Text("Buscar partida")
                    }
                }
            }

            if (ladder.standings.isNotEmpty()) {
                Text("Clasificacion", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                ladder.standings.forEachIndexed { index, standing ->
                    Text(
                        "${index + 1}. ${standing.displayName} · ${standing.wins}-${standing.losses} · ${standing.winRate ?: 0}%" + if(ladder.options?.settings?.mode == "COMPETITIVE") " · ${standing.rating ?: 1000}${if(standing.eligible != true) " · provisional" else ""}" else "",
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }

            if (ladder.history.isNotEmpty()) {
                TextButton(onClick = { showHistory = !showHistory }) {
                    Text(if (showHistory) "Ocultar historico" else "Mostrar historico (${ladder.history.size})")
                }
                if (showHistory) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        ladder.history.forEach { match ->
                            LadderHistoryCard(match)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LadderReadyCheckCard(
    match: PlayerMatchDto,
    onReady: () -> Unit,
    onCancel: () -> Unit,
) {
    val cardColors = playerSurfaceCardColors()
    val mutedColor = MaterialTheme.colorScheme.onSurfaceVariant
    val amReady = when (match.mySlot) {
        1 -> match.participantOneReadyAt != null
        2 -> match.participantTwoReadyAt != null
        else -> false
    }
    val opponentReady = when (match.opponentSlot) {
        1 -> match.participantOneReadyAt != null
        2 -> match.participantTwoReadyAt != null
        else -> false
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = cardColors,
        border = playerSurfaceCardBorder()
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Match encontrado · Bo${match.effectiveBestOf}", fontWeight = FontWeight.Bold)
            match.stationLabel?.let { Text(it) }
            playerMatchStageLabel(match)?.let { Text(it, color = mutedColor) }
            Text("${match.myDisplayName} vs ${match.opponentDisplayName ?: "Rival"}")
            LadderReadyTimer(match)
            Text(
                "Tu estado: ${if (amReady) "Listo" else "Pendiente"} · Rival: ${if (opponentReady) "Listo" else "Pendiente"}",
                color = mutedColor,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onReady, enabled = !amReady) {
                    Text(if (amReady) "Ya estas listo" else "Estoy listo")
                }
                TextButton(onClick = onCancel) {
                    Text("Cancelar")
                }
            }
        }
    }
}

@Composable
private fun LadderActiveMatchCard(
    match: PlayerMatchDto,
    onReview: (String,String?) -> Unit,
    onReportDetailedResult: (String, Int?, List<DetailedReportedGame>) -> Unit,
) {
    val cardColors = playerSurfaceCardColors()
    val mutedColor = MaterialTheme.colorScheme.onSurfaceVariant
    var showQuickReportDialog by rememberSaveable(match.id) { mutableStateOf(false) }
    var showQuickReportModeDialog by rememberSaveable(match.id) { mutableStateOf(false) }
    var quickReportPresetMyCharacter by remember(match.id) { mutableStateOf(latestCharacterForParticipant(match, match.myParticipantId)) }
    var quickReportPresetOpponentCharacter by remember(match.id) { mutableStateOf(latestCharacterForParticipant(match, match.opponentParticipantId)) }
    var quickReportBestOfOverride by remember(match.id) { mutableStateOf<Int?>(null) }
    var quickReportSelectedScore by remember(match.id) { mutableStateOf<String?>(null) }
    var quickReportGames by remember(match.id) { mutableStateOf<List<PlayerQuickReportGameDraft>>(currentPlayerQuickReportGames(match)) }
    val requiresCharacters = match.canReportCharacters

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = cardColors,
        border = playerSurfaceCardBorder()
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(com.gestortorneos.ui.ladderStatus(match.status), fontWeight = FontWeight.Bold)
            match.stationLabel?.let { Text(it) }
            match.ladderMessage?.let { Text(it) }
            if(match.status != "PLAYING") Text("${match.myDisplayName} ${match.myScore} – ${match.opponentScore ?: 0} ${match.opponentDisplayName ?: "Rival"}")
            if(match.canReviewLadderResult) LadderReviewActions(onReview)
            playerMatchStageLabel(match)?.let { Text(it, color = mutedColor) }
            Text("${match.myDisplayName} vs ${match.opponentDisplayName ?: "Rival"} · Bo${match.effectiveBestOf}")
            Button(
                enabled = match.status == "PLAYING" && match.canPlayerReportMatch,
                onClick = {
                    quickReportPresetMyCharacter = latestCharacterForParticipant(match, match.myParticipantId)
                    quickReportPresetOpponentCharacter = latestCharacterForParticipant(match, match.opponentParticipantId)
                    quickReportBestOfOverride = match.reportedBestOf
                    quickReportSelectedScore = null
                    quickReportGames = currentPlayerQuickReportGames(match)
                    showQuickReportModeDialog = true
                }
            ) {
                Text("Anotacion rapida")
            }
        }
    }

    if (showQuickReportModeDialog) {
        PlayerQuickReportBestOfDialog(
            defaultBestOf = match.effectiveBestOf,
            selectedOverride = quickReportBestOfOverride,
            onDismiss = { showQuickReportModeDialog = false },
            onConfirm = { bestOfOverride ->
                quickReportBestOfOverride = bestOfOverride
                showQuickReportModeDialog = false
                showQuickReportDialog = true
            },
        )
    }

    if (showQuickReportDialog && match.opponentParticipantId != null && match.opponentDisplayName != null) {
        PlayerQuickReportDialog(
            match = match,
            effectiveBestOf = quickReportBestOfOverride ?: match.effectiveBestOf,
            initialCharacters = listOf(
                quickReportPresetMyCharacter,
                quickReportPresetOpponentCharacter,
            ),
            initialScoreKey = quickReportSelectedScore,
            initialGames = quickReportGames,
            onDismiss = { showQuickReportDialog = false },
            onSubmit = { scoreKey, myBaseCharacter, opponentBaseCharacter, games ->
                quickReportSelectedScore = scoreKey
                quickReportPresetMyCharacter = myBaseCharacter
                quickReportPresetOpponentCharacter = opponentBaseCharacter
                quickReportGames = games
                onReportDetailedResult(
                    match.id,
                    quickReportBestOfOverride,
                    games.map { game ->
                        DetailedReportedGame(
                            winnerParticipantId = game.winnerParticipantId,
                            selections = if (requiresCharacters) {
                                listOf(
                                    match.myParticipantId to game.myCharacter,
                                    match.opponentParticipantId to game.opponentCharacter,
                                )
                            } else {
                                emptyList()
                            },
                        )
                    },
                )
            },
        )
    }
}

@Composable
private fun LadderHistoryCard(match: PlayerMatchDto) {
    val cardColors = playerSurfaceCardColors()
    val mutedColor = MaterialTheme.colorScheme.onSurfaceVariant
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = cardColors,
        border = playerSurfaceCardBorder()
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Ladder Bo${match.effectiveBestOf}", fontWeight = FontWeight.SemiBold)
            playerMatchStageLabel(match)?.let { Text(it, color = mutedColor) }
            PlayerMatchParticipantRow(
                displayName = match.myDisplayName,
                scoreLabel = playerMatchScoreLabel(match, match.myParticipantId, match.myScore),
                characterName = latestCharacterForParticipant(match, match.myParticipantId),
                isWinner = match.winnerParticipantId == match.myParticipantId,
            )
            PlayerMatchParticipantRow(
                displayName = match.opponentDisplayName ?: "Rival",
                scoreLabel = playerMatchScoreLabel(match, match.opponentParticipantId, match.opponentScore ?: 0),
                characterName = latestCharacterForParticipant(match, match.opponentParticipantId),
                isWinner = match.winnerParticipantId != null && match.winnerParticipantId == match.opponentParticipantId,
            )
            Text("Estado: ${match.status}", color = mutedColor)
        }
    }
}

@Composable
private fun TournamentSection(
    tournaments: List<PlayerTournamentDto>,
    session: PlayerSession?,
    onSaveCharacters: (String, String, List<Pair<String, String>>) -> Unit,
    onRecordGameWin: (String, PlayerMatchDto, String, List<Pair<String, String>>) -> Unit,
    onReportDetailedResult: (String, String, Int?, List<DetailedReportedGame>) -> Unit,
    onResetMatch: (String, String) -> Unit,
    onJoinLadderQueue: (String) -> Unit,
    onLeaveLadderQueue: (String) -> Unit,
    onReadyLadderMatch: (String, String) -> Unit,
    onReviewLadder: (String, String, String, String, String?) -> Unit,
    onCancelLadderMatch: (String, String) -> Unit,
    onReportLadderDetailedResult: (String, String, Int?, List<DetailedReportedGame>) -> Unit,
) {
    if (session == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Inicia sesion con start.gg para ver tus torneos.")
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        items(tournaments, key = { it.tournamentId }) { tournament ->
            var showCompletedMatches by rememberSaveable(tournament.tournamentId) { mutableStateOf(false) }
            val sortedActiveMatches = remember(tournament.activeMatches) {
                tournament.activeMatches.sortedWith(
                    compareBy<PlayerMatchDto>(
                        { activePlayerMatchPriority(it) },
                        { activePlayerMatchTimelineAnchor(it) },
                        { it.roundLabel },
                        { it.id },
                    )
                )
            }
            val sortedPendingMatches = remember(tournament.pendingMatches) {
                tournament.pendingMatches.sortedWith(compareBy<PlayerMatchDto>({ it.roundLabel }, { it.id }))
            }
            val sortedCompletedMatches = remember(tournament.completedMatches) {
                tournament.completedMatches.sortedWith(compareBy<PlayerMatchDto>({ it.roundLabel }, { it.id }))
            }
            CardSection {
                Text(tournament.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("${tournament.gameTitle} · ${tournament.status}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                tournament.ladder?.let { ladder ->
                    LadderTournamentSection(
                        tournament = tournament,
                        ladder = ladder,
                        onJoinQueue = { onJoinLadderQueue(tournament.tournamentId) },
                        onLeaveQueue = { onLeaveLadderQueue(tournament.tournamentId) },
                        onReadyMatch = { matchId -> onReadyLadderMatch(tournament.tournamentId, matchId) },
                        onReview = { match, action, reason -> onReviewLadder(tournament.tournamentId,match.id,match.ladderRevision ?: "",action,reason) },
                        onCancelReadyCheck = { matchId -> onCancelLadderMatch(tournament.tournamentId, matchId) },
                        onReportDetailedResult = { matchId, bestOfOverride, games ->
                            onReportLadderDetailedResult(tournament.tournamentId, matchId, bestOfOverride, games)
                        }
                    )
                    Spacer(Modifier.height(12.dp))
                }
                if (sortedActiveMatches.isEmpty() && sortedPendingMatches.isEmpty() && sortedCompletedMatches.isEmpty()) {
                    Text("No hay sets disponibles para este torneo.")
                } else {
                    sortedActiveMatches.forEach { match ->
                        PlayerMatchCard(
                            tournamentId = tournament.tournamentId,
                            match = match,
                            onSaveCharacters = onSaveCharacters,
                            onRecordGameWin = onRecordGameWin,
                            onReportDetailedResult = onReportDetailedResult,
                            onResetMatch = onResetMatch
                        )
                    }
                    if (sortedPendingMatches.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text("Pendientes", fontWeight = FontWeight.SemiBold)
                        sortedPendingMatches.forEach { match -> MatchSummaryCard(match) }
                    }
                    if (sortedCompletedMatches.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("Completados", fontWeight = FontWeight.SemiBold)
                            TextButton(onClick = { showCompletedMatches = !showCompletedMatches }) {
                                Text(if (showCompletedMatches) "Ocultar" else "Mostrar")
                            }
                        }
                        if (showCompletedMatches) {
                            sortedCompletedMatches.forEach { match -> MatchSummaryCard(match) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun ProfileSection(
    session: PlayerSession?,
    message: String?,
    error: String?,
    themeMode: PlayerThemeMode,
    backgroundSyncArmed: Boolean,
    notificationsGranted: Boolean,
    matchCallNotificationsEnabled: Boolean,
    batteryOptimizationIgnored: Boolean,
    onThemeSelected: (PlayerThemeMode) -> Unit,
    onEnableNotifications: () -> Unit,
    onOpenNotificationSettings: () -> Unit,
    onOpenBatterySettings: () -> Unit,
    onLogout: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        CardSection {
            Text("Perfil", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(cleanedPlayerSessionLabel(session))
            if (session != null) {
                MainStatusBadge("Conectado con start.gg", "COMPLETED")
                Text("Tu acceso de jugador se mantiene al cerrar la app.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        CardSection {
            AppearanceControls()
        }
        CardSection {
            Text("Conexion", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("Conectado al servidor de tu organización.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (message != null) {
                Spacer(Modifier.height(8.dp))
                Text(message, color = MainPalette.success)
            }
            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(error, color = MaterialTheme.colorScheme.error)
            }
        }
        CardSection {
            Text("Avisos en segundo plano", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("Sincronizacion en segundo plano: ${if (backgroundSyncArmed) "Activa" else "Inactiva"}")
            Text("Permiso de notificaciones: ${if (notificationsGranted) "Concedido" else "No concedido"}")
            Text("Canal de llamadas: ${if (matchCallNotificationsEnabled) "Activo" else "Silenciado o bloqueado"}")
            Text("Bateria sin restricciones: ${if (batteryOptimizationIgnored) "Si" else "No"}")
            Spacer(Modifier.height(8.dp))
            Text(
                "En telefonos modernos como Pixel, si alguno de estos puntos falla, los avisos pueden no llegar con la app en segundo plano.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Button(onClick = onEnableNotifications, modifier = Modifier.fillMaxWidth()) {
                    Text(if (notificationsGranted) "Abrir notificaciones" else "Activar notificaciones")
                }
                OutlinedButton(onClick = onOpenNotificationSettings, modifier = Modifier.fillMaxWidth()) {
                    Text("Canal de llamadas")
                }
                OutlinedButton(onClick = onOpenBatterySettings, modifier = Modifier.fillMaxWidth()) {
                    Text("Bateria")
                }
            }
        }
        com.gestortorneos.player.updates.AndroidUpdateSettings()
        if (session != null) {
            CardSection {
                Text("Sesión de jugador", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth()) { Text("Cerrar sesión") }
            }
        }
    }
}

@Composable
private fun MatchSummaryCard(match: PlayerMatchDto) {
    val isDarkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val cardColor = if (isDarkTheme) {
        MaterialTheme.colorScheme.surface.copy(alpha = 0.92f)
    } else {
        Color(0xFFF8FAFC)
    }
    val mutedColor = if (isDarkTheme) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else {
        Color(0xFF475569)
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = cardColor,
            contentColor = MaterialTheme.colorScheme.onSurface,
        )
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(match.tournamentTitle, fontWeight = FontWeight.SemiBold)
            playerMatchStageLabel(match)?.let { Text(it, color = mutedColor) }
            Text(match.roundLabel)
            PlayerMatchParticipantRow(
                displayName = match.myDisplayName,
                scoreLabel = playerMatchScoreLabel(match, match.myParticipantId, match.myScore),
                characterName = latestCharacterForParticipant(match, match.myParticipantId),
                isWinner = match.winnerParticipantId == match.myParticipantId,
            )
            PlayerMatchParticipantRow(
                displayName = match.opponentDisplayName ?: "Por determinar",
                scoreLabel = playerMatchScoreLabel(match, match.opponentParticipantId, match.opponentScore ?: 0),
                characterName = latestCharacterForParticipant(match, match.opponentParticipantId),
                isWinner = match.winnerParticipantId != null && match.winnerParticipantId == match.opponentParticipantId,
            )
            if (!match.stationLabel.isNullOrBlank()) {
                Text("Estacion: ${match.stationLabel}", color = mutedColor)
            }
            MatchCallTimer(match)
            LadderReadyTimer(match)
        }
    }
}

@Composable
private fun PlayerMatchCard(
    tournamentId: String,
    match: PlayerMatchDto,
    onSaveCharacters: (String, String, List<Pair<String, String>>) -> Unit,
    onRecordGameWin: (String, PlayerMatchDto, String, List<Pair<String, String>>) -> Unit,
    onReportDetailedResult: (String, String, Int?, List<DetailedReportedGame>) -> Unit,
    onResetMatch: (String, String) -> Unit,
) {
    val isDarkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val cardColor = if (isDarkTheme) {
        MaterialTheme.colorScheme.surface.copy(alpha = 0.92f)
    } else {
        Color(0xFFF8FAFC)
    }
    val mutedColor = if (isDarkTheme) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else {
        Color(0xFF475569)
    }
    var myCharacter by rememberSaveable(match.id) { mutableStateOf(latestCharacterForParticipant(match, match.myParticipantId)) }
    var opponentCharacter by rememberSaveable(match.id) { mutableStateOf(latestCharacterForParticipant(match, match.opponentParticipantId)) }
    var showQuickReportDialog by rememberSaveable(match.id) { mutableStateOf(false) }
    var showQuickReportModeDialog by rememberSaveable(match.id) { mutableStateOf(false) }
    var quickReportPresetMyCharacter by remember(match.id) { mutableStateOf("") }
    var quickReportPresetOpponentCharacter by remember(match.id) { mutableStateOf("") }
    var quickReportBestOfOverride by remember(match.id) { mutableStateOf<Int?>(null) }
    var quickReportSelectedScore by remember(match.id) { mutableStateOf<String?>(null) }
    var quickReportGames by remember(match.id) { mutableStateOf<List<PlayerQuickReportGameDraft>>(emptyList()) }
    LaunchedEffect(match.status) {
        if (match.status == "COMPLETED" || match.status == "WALKOVER") showQuickReportDialog = false
    }
    val reportingEnabled = match.canPlayerReportMatch
    val requiresCharacters = match.canReportCharacters
    val hasRequiredCharacters = !requiresCharacters || (myCharacter.isNotBlank() && opponentCharacter.isNotBlank())
    val canResetSet = reportingEnabled
        && match.status != "COMPLETED"
        && match.status != "WALKOVER"
        && (match.myScore > 0 || (match.opponentScore ?: 0) > 0 || !match.gameResults.isNullOrEmpty())
    val canQuickReport = reportingEnabled
        && match.status != "COMPLETED"
        && match.status != "WALKOVER"
        && match.opponentParticipantId != null

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = cardColor,
            contentColor = MaterialTheme.colorScheme.onSurface,
        )
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            playerMatchStageLabel(match)?.let { Text(it, color = mutedColor) }
            Text(match.roundLabel, fontWeight = FontWeight.Bold)
            PlayerMatchParticipantRow(
                displayName = match.myDisplayName,
                scoreLabel = playerMatchScoreLabel(match, match.myParticipantId, match.myScore),
                characterName = latestCharacterForParticipant(match, match.myParticipantId),
                isWinner = match.winnerParticipantId == match.myParticipantId,
            )
            PlayerMatchParticipantRow(
                displayName = match.opponentDisplayName ?: "Por determinar",
                scoreLabel = playerMatchScoreLabel(match, match.opponentParticipantId, match.opponentScore ?: 0),
                characterName = latestCharacterForParticipant(match, match.opponentParticipantId),
                isWinner = match.winnerParticipantId != null && match.winnerParticipantId == match.opponentParticipantId,
            )
            MainStatusBadge(playerMatchStatusLabel(match.status), match.status)
            if (!match.stationLabel.isNullOrBlank()) {
                Text("Estacion: ${match.stationLabel}", color = mutedColor)
            }
            MatchCallTimer(match)
            if (!requiresCharacters) {
                Text("Este juego no requiere selección de personajes.", color = mutedColor)
            }
            if (!reportingEnabled) {
                Text(
                    "El organizador ha deshabilitado el reporte de jugadores para este torneo. Espera a que el staff anote el resultado.",
                    color = MainPalette.warning
                )
            }
            if (canQuickReport) {
                Button(
                    onClick = {
                        quickReportPresetMyCharacter = myCharacter
                        quickReportPresetOpponentCharacter = opponentCharacter
                        quickReportBestOfOverride = match.reportedBestOf
                        quickReportSelectedScore = null
                        quickReportGames = currentPlayerQuickReportGames(match)
                        showQuickReportModeDialog = true
                    }
                ) {
                    Text("Anotacion rapida")
                }
            }

            val selections = listOfNotNull(
                myCharacter.takeIf { it.isNotBlank() }?.let { match.myParticipantId to it },
                match.opponentParticipantId?.takeIf { opponentCharacter.isNotBlank() }?.let { it to opponentCharacter }
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                if (canResetSet) {
                    TextButton(onClick = {
                        onResetMatch(tournamentId, match.id)
                        if (requiresCharacters) {
                            myCharacter = ""
                            opponentCharacter = ""
                        }
                    }) {
                        Text("Resetear set")
                    }
                }
            }
        }
    }

    if (reportingEnabled && showQuickReportModeDialog) {
        PlayerQuickReportBestOfDialog(
            defaultBestOf = match.effectiveBestOf,
            selectedOverride = quickReportBestOfOverride,
            onDismiss = { showQuickReportModeDialog = false },
            onConfirm = { bestOfOverride ->
                quickReportBestOfOverride = bestOfOverride
                showQuickReportModeDialog = false
                showQuickReportDialog = true
            },
        )
    }

    if (reportingEnabled && showQuickReportDialog && match.opponentParticipantId != null && match.opponentDisplayName != null) {
        PlayerQuickReportDialog(
            match = match,
            effectiveBestOf = quickReportBestOfOverride ?: match.effectiveBestOf,
            initialCharacters = listOf(
                quickReportPresetMyCharacter,
                quickReportPresetOpponentCharacter,
            ),
            initialScoreKey = quickReportSelectedScore,
            initialGames = quickReportGames,
            onDismiss = { showQuickReportDialog = false },
            onSubmit = { scoreKey, myBaseCharacter, opponentBaseCharacter, games ->
                quickReportSelectedScore = scoreKey
                quickReportPresetMyCharacter = myBaseCharacter
                quickReportPresetOpponentCharacter = opponentBaseCharacter
                quickReportGames = games
                onReportDetailedResult(
                    tournamentId,
                    match.id,
                    quickReportBestOfOverride,
                    games.map { game ->
                        DetailedReportedGame(
                            winnerParticipantId = game.winnerParticipantId,
                            selections = if (requiresCharacters) {
                                listOf(
                                    match.myParticipantId to game.myCharacter,
                                    match.opponentParticipantId to game.opponentCharacter,
                                )
                            } else {
                                emptyList()
                            },
                        )
                    },
                )
                showQuickReportDialog = false
            },
        )
    }
}

private data class PlayerQuickReportScoreOption(
    val key: String,
    val winnerParticipantId: String,
    val winnerScore: Int,
    val loserScore: Int,
)

private data class PlayerQuickReportGameDraft(
    val winnerParticipantId: String,
    val myCharacter: String = "",
    val opponentCharacter: String = "",
)

@Composable
private fun PlayerQuickReportDialog(
    match: PlayerMatchDto,
    effectiveBestOf: Int,
    initialCharacters: List<String>,
    initialScoreKey: String?,
    initialGames: List<PlayerQuickReportGameDraft>,
    onDismiss: () -> Unit,
    onSubmit: (String, String, String, List<PlayerQuickReportGameDraft>) -> Unit,
) {
    val requiresCharacters = match.canReportCharacters
    val scoreOptions = remember(match.id, effectiveBestOf, match.myParticipantId, match.opponentParticipantId) {
        buildPlayerQuickReportScoreOptions(match, effectiveBestOf)
    }
    var myBaseCharacter by remember(match.id) { mutableStateOf(initialCharacters.getOrNull(0).orEmpty()) }
    var opponentBaseCharacter by remember(match.id) { mutableStateOf(initialCharacters.getOrNull(1).orEmpty()) }
    var selectedScoreKey by remember(match.id) { mutableStateOf(initialScoreKey) }
    var games by remember(match.id) { mutableStateOf(initialGames) }

    LaunchedEffect(match.id) {
        if (games.isEmpty() && !selectedScoreKey.isNullOrBlank()) {
            scoreOptions.firstOrNull { it.key == selectedScoreKey }?.let { option ->
                games = buildPlayerQuickReportGames(match, option, myBaseCharacter, opponentBaseCharacter)
            }
        }
    }

    val canSubmit = !LocalPlayerBusy.current && selectedScoreKey != null
        && games.isNotEmpty()
        && (!requiresCharacters || games.all { validTeamCharacters(it.myCharacter, match.entrantSize) && validTeamCharacters(it.opponentCharacter, match.entrantSize) })
    val isDarkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val summaryCardBackground = MaterialTheme.colorScheme.surfaceVariant
    val summaryCardTextColor = MaterialTheme.colorScheme.onSurface
    val summaryCardLabelColor = MaterialTheme.colorScheme.onSurfaceVariant
    val introTextColor = if (isDarkTheme) Color(0xFFE2E8F0) else Color(0xFF475569)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Column {
            Text(if (LocalPlayerBusy.current) "Enviando resultado…" else "Anotación rápida")
            LocalPlayerError.current?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
        } },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    "Prepara el resultado final, revisa cada juego y anotalo de una sola vez.",
                    color = introTextColor,
                )
                Text(
                    "Modalidad del set: Bo$effectiveBestOf",
                    color = introTextColor,
                )
                if (requiresCharacters) {
                    CharacterPickerField(
                                        teamSize = match.entrantSize, gameTitle = match.gameTitle,
                        label = "Mi personaje (base)",
                        selectedName = myBaseCharacter,
                        onSelected = {
                            myBaseCharacter = it
                            games = games.map { game -> game.copy(myCharacter = it) }
                        },
                    )
                    CharacterPickerField(
                                        teamSize = match.entrantSize, gameTitle = match.gameTitle,
                        label = "Personaje rival (base)",
                        selectedName = opponentBaseCharacter,
                        onSelected = {
                            opponentBaseCharacter = it
                            games = games.map { game -> game.copy(opponentCharacter = it) }
                        },
                    )
                }
                Text("Resultado final", fontWeight = FontWeight.SemiBold)
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    scoreOptions.forEach { option ->
                        val isSelected = option.key == selectedScoreKey
                        Button(
                            onClick = {
                                selectedScoreKey = option.key
                                games = buildPlayerQuickReportGames(match, option, myBaseCharacter, opponentBaseCharacter)
                            },
                            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                                containerColor = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                contentColor = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            ),
                        ) {
                            Text("${playerQuickReportWinnerName(match, option)} ${option.winnerScore}-${option.loserScore}")
                        }
                    }
                }
                if (games.isNotEmpty()) {
                    Text("Resumen de juegos", fontWeight = FontWeight.SemiBold)
                    games.forEachIndexed { index, game ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = summaryCardBackground),
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text("Juego ${index + 1}", fontWeight = FontWeight.SemiBold, color = summaryCardTextColor)
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(
                                        onClick = {
                                            games = games.mapIndexed { gameIndex, current ->
                                                if (gameIndex == index) current.copy(winnerParticipantId = match.myParticipantId) else current
                                            }
                                        },
                                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                                            containerColor = if (game.winnerParticipantId == match.myParticipantId) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                            contentColor = if (game.winnerParticipantId == match.myParticipantId) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                        ),
                                    ) {
                                        Text(match.myDisplayName)
                                    }
                                    Button(
                                        onClick = {
                                            games = games.mapIndexed { gameIndex, current ->
                                                if (gameIndex == index) current.copy(winnerParticipantId = match.opponentParticipantId ?: current.winnerParticipantId) else current
                                            }
                                        },
                                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                                            containerColor = if (game.winnerParticipantId == match.opponentParticipantId) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                            contentColor = if (game.winnerParticipantId == match.opponentParticipantId) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                        ),
                                    ) {
                                        Text(match.opponentDisplayName ?: "Rival")
                                    }
                                }
                                if (requiresCharacters) {
                                    CharacterPickerField(
                                        teamSize = match.entrantSize, gameTitle = match.gameTitle,
                                        label = match.myDisplayName,
                                        selectedName = game.myCharacter,
                                        labelColor = summaryCardLabelColor,
                                        onSelected = { character ->
                                            games = games.mapIndexed { gameIndex, current ->
                                                if (gameIndex == index) current.copy(myCharacter = character) else current
                                            }
                                        },
                                    )
                                    CharacterPickerField(
                                        teamSize = match.entrantSize, gameTitle = match.gameTitle,
                                        label = match.opponentDisplayName ?: "Rival",
                                        selectedName = game.opponentCharacter,
                                        labelColor = summaryCardLabelColor,
                                        onSelected = { character ->
                                            games = games.mapIndexed { gameIndex, current ->
                                                if (gameIndex == index) current.copy(opponentCharacter = character) else current
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
                onClick = { onSubmit(selectedScoreKey.orEmpty(), myBaseCharacter, opponentBaseCharacter, games) },
                enabled = canSubmit,
            ) {
                Text("Anotar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        },
    )
}

@Composable
private fun PlayerQuickReportBestOfDialog(
    defaultBestOf: Int,
    selectedOverride: Int?,
    onDismiss: () -> Unit,
    onConfirm: (Int?) -> Unit,
) {
    val options = listOf<Int?>(null, 1, 3, 5)
    var localSelection by remember(defaultBestOf, selectedOverride) { mutableStateOf(selectedOverride) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Modalidad del set") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Antes de anotar, indica si este set se jugo al formato por defecto del torneo o a otra modalidad.")
                options.forEach { option ->
                    val isSelected = localSelection == option
                    Button(
                        onClick = { localSelection = option },
                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                            containerColor = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                            contentColor = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            when (option) {
                                null -> "Formato del torneo (Bo$defaultBestOf)"
                                else -> "Bo$option"
                            },
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(localSelection) }) {
                Text("Continuar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        },
    )
}

private fun buildPlayerQuickReportScoreOptions(match: PlayerMatchDto, effectiveBestOf: Int): List<PlayerQuickReportScoreOption> {
    val opponentParticipantId = match.opponentParticipantId ?: return emptyList()
    val winsNeeded = (effectiveBestOf / 2) + 1
    return buildList {
        for (loserScore in 0 until winsNeeded) {
            add(
                PlayerQuickReportScoreOption(
                    key = "${match.myParticipantId}:$winsNeeded-$loserScore",
                    winnerParticipantId = match.myParticipantId,
                    winnerScore = winsNeeded,
                    loserScore = loserScore,
                ),
            )
        }
        for (loserScore in 0 until winsNeeded) {
            add(
                PlayerQuickReportScoreOption(
                    key = "$opponentParticipantId:$winsNeeded-$loserScore",
                    winnerParticipantId = opponentParticipantId,
                    winnerScore = winsNeeded,
                    loserScore = loserScore,
                ),
            )
        }
    }
}

private fun buildPlayerQuickReportGames(
    match: PlayerMatchDto,
    option: PlayerQuickReportScoreOption,
    myBaseCharacter: String,
    opponentBaseCharacter: String,
): List<PlayerQuickReportGameDraft> {
    val opponentParticipantId = match.opponentParticipantId ?: return emptyList()
    val loserParticipantId = if (option.winnerParticipantId == match.myParticipantId) opponentParticipantId else match.myParticipantId
    val games = mutableListOf<PlayerQuickReportGameDraft>()
    repeat(option.loserScore) {
        games += PlayerQuickReportGameDraft(option.winnerParticipantId, myBaseCharacter, opponentBaseCharacter)
        games += PlayerQuickReportGameDraft(loserParticipantId, myBaseCharacter, opponentBaseCharacter)
    }
    repeat((option.winnerScore - option.loserScore - 1).coerceAtLeast(0)) {
        games += PlayerQuickReportGameDraft(option.winnerParticipantId, myBaseCharacter, opponentBaseCharacter)
    }
    games += PlayerQuickReportGameDraft(option.winnerParticipantId, myBaseCharacter, opponentBaseCharacter)
    return games
}

private fun playerQuickReportWinnerName(match: PlayerMatchDto, option: PlayerQuickReportScoreOption): String {
    return if (option.winnerParticipantId == match.myParticipantId) match.myDisplayName else (match.opponentDisplayName ?: "Rival")
}

@Composable
private fun PlayerMatchParticipantRow(
    displayName: String,
    scoreLabel: String,
    characterName: String,
    isWinner: Boolean,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
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
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontWeight = if (isWinner) FontWeight.SemiBold else FontWeight.Normal,
                color = if (isWinner) MainPalette.success else MaterialTheme.colorScheme.onSurface,
            )
        }
        Text(
            text = scoreLabel,
            fontWeight = FontWeight.Bold,
            color = if (scoreLabel == "DQ") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        )
    }
}

private fun playerMatchScoreLabel(
    match: PlayerMatchDto,
    participantId: String?,
    score: Int,
): String {
    if (match.status == "WALKOVER" && participantId != null && match.winnerParticipantId != null && participantId != match.winnerParticipantId) {
        return "DQ"
    }
    return score.toString()
}

@Composable
private fun SingleCharacterPickerField(
    gameTitle: String,
    label: String,
    selectedName: String,
    labelColor: Color = MaterialTheme.colorScheme.onSurface,
    onSelected: (String) -> Unit,
) {
    var pickerOpen by remember { mutableStateOf(false) }
    val isDarkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val selectedTextColor = MaterialTheme.colorScheme.onPrimary

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, fontWeight = FontWeight.SemiBold, color = labelColor)
        Button(
            onClick = { pickerOpen = true },
            modifier = Modifier.fillMaxWidth(),
            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = selectedTextColor,
            )
        ) {
            if (selectedName.isBlank()) {
                Text("Seleccionar personaje")
            } else {
                SmashCharacterInlineLabel(selectedName, textColor = selectedTextColor)
            }
        }
    }

    if (pickerOpen) {
        CharacterPickerDialog(
            title = label,
            selectedName = selectedName,
            gameTitle = gameTitle,
            onDismiss = { pickerOpen = false },
            onSelected = { character ->
                onSelected(character)
                pickerOpen = false
            }
        )
    }
}

@Composable
private fun CharacterPickerDialog(
    gameTitle: String,
    title: String,
    selectedName: String,
    onDismiss: () -> Unit,
    onSelected: (String) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val filteredNames = remember(query, gameTitle) {
        val normalizedQuery = query.trim().lowercase()
        val names = if (Regex("rivals|roa", RegexOption.IGNORE_CASE).containsMatchIn(gameTitle)) listOf("Random", "Zetterburn", "Orcane", "Wrastor", "Kragg", "Forsburn", "Maypul", "Absa", "Etalus", "Ranno", "Clairen", "Olympia", "Fleet", "Loxodont", "Galvan", "La Reina", "Slade") else smashUltimateCharacterNames
        names.filter { name ->
            normalizedQuery.isBlank() || name.lowercase().contains(normalizedQuery)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Filtrar personaje") },
                    modifier = Modifier.fillMaxWidth()
                )
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 320.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    items(filteredNames, key = { it }) { name ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSelected(name) },
                            colors = CardDefaults.cardColors(
                                containerColor = if (name == selectedName) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Box(modifier = Modifier.padding(12.dp)) {
                                SmashCharacterInlineLabel(
                                    name = name,
                                    modifier = Modifier.fillMaxWidth(),
                                    textColor = MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Cerrar")
            }
        }
    )
}

@Composable
private fun MatchCallTimer(match: PlayerMatchDto) {
    if (match.callTimeoutSeconds == null || match.status != "CALLED") {
        return
    }

    var remainingSeconds by remember(match.id, match.calledAt, match.callTimeoutSeconds, match.status) {
        mutableStateOf(match.callTimeoutSeconds.coerceAtLeast(0))
    }

    LaunchedEffect(match.id, match.calledAt, match.callTimeoutSeconds, match.status) {
        remainingSeconds = match.callTimeoutSeconds.coerceAtLeast(0)
        while (match.status == "CALLED" && remainingSeconds > 0) {
            delay(1_000)
            remainingSeconds -= 1
        }
    }

    Text("Tiempo restante: ${formatSeconds(remainingSeconds)}", color = MainPalette.warning)
}

@Composable
private fun LadderReadyTimer(match: PlayerMatchDto) {
    if (match.readyDeadlineAt == null || match.status != "READY_CHECK") {
        return
    }

    var remainingSeconds by remember(match.id, match.readyDeadlineAt, match.status) {
        mutableStateOf(
            ((java.time.Instant.parse(match.readyDeadlineAt).toEpochMilli() - System.currentTimeMillis()) / 1000L)
                .toInt()
                .coerceAtLeast(0)
        )
    }

    LaunchedEffect(match.id, match.readyDeadlineAt, match.status) {
        remainingSeconds = ((java.time.Instant.parse(match.readyDeadlineAt).toEpochMilli() - System.currentTimeMillis()) / 1000L)
            .toInt()
            .coerceAtLeast(0)
        while (match.status == "READY_CHECK" && remainingSeconds > 0) {
            delay(1_000)
            remainingSeconds -= 1
        }
    }

    Text("Tiempo para confirmar: ${formatSeconds(remainingSeconds)}", color = MainPalette.warning)
}

@Composable
private fun CardSection(content: @Composable ColumnScope.() -> Unit) {
    val cardColors = playerSurfaceCardColors()
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = cardColors,
        border = playerSurfaceCardBorder()
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
            content = content
        )
    }
}

@Composable
private fun playerSurfaceCardColors() = CardDefaults.cardColors(
    containerColor = if (MaterialTheme.colorScheme.background.luminance() < 0.5f) {
        MaterialTheme.colorScheme.surface.copy(alpha = 0.96f)
    } else {
        MaterialTheme.colorScheme.surface
    },
    contentColor = MaterialTheme.colorScheme.onSurface,
)

@Composable
private fun playerSurfaceCardBorder(): BorderStroke {
    val borderColor = if (MaterialTheme.colorScheme.background.luminance() < 0.5f) {
        MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)
    } else {
        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.72f)
    }
    return BorderStroke(1.dp, borderColor)
}

private fun latestCharacterForParticipant(match: PlayerMatchDto, participantId: String?): String {
    val resolvedId = participantId ?: return ""
    val latestPerGameCharacter = match.gameCharacterSelections
        ?.sortedByDescending { it.gameNum }
        ?.firstNotNullOfOrNull { game ->
            game.selections.filter { it.participantId == resolvedId }.joinToString(" / ") { it.characterName }.takeIf { it.isNotBlank() }
        }
    if (!latestPerGameCharacter.isNullOrBlank()) {
        return latestPerGameCharacter
    }
    return match.characterSelections.orEmpty().filter { it.participantId == resolvedId }.joinToString(" / ") { it.characterName }
}

private fun currentPlayerQuickReportGames(match: PlayerMatchDto): List<PlayerQuickReportGameDraft> {
    val opponentParticipantId = match.opponentParticipantId ?: return emptyList()
    val perGameSelections = match.gameCharacterSelections
        ?.associateBy { it.gameNum }
        .orEmpty()
    return match.gameResults.orEmpty().mapIndexed { index, winnerParticipantId ->
        val selectionsByParticipant = perGameSelections[index + 1]
            ?.selections
            ?.groupBy { it.participantId }
            .orEmpty()
        PlayerQuickReportGameDraft(
            winnerParticipantId = winnerParticipantId,
            myCharacter = selectionsByParticipant[match.myParticipantId]?.joinToString(" / ") { it.characterName }
                ?: latestCharacterForParticipant(match, match.myParticipantId),
            opponentCharacter = selectionsByParticipant[opponentParticipantId]?.joinToString(" / ") { it.characterName }
                ?: latestCharacterForParticipant(match, opponentParticipantId),
        )
    }
}

private fun formatSeconds(totalSeconds: Int): String {
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%02d:%02d".format(minutes, seconds)
}

private fun validTeamCharacters(value: String, size: Int): Boolean = value.split("/").let { names -> names.size == size.coerceAtLeast(1) && names.all { it.isNotBlank() } }

@Composable
private fun CharacterPickerField(label: String, selectedName: String, teamSize: Int, gameTitle: String,
    labelColor: Color = MaterialTheme.colorScheme.onSurface, onSelected: (String) -> Unit) {
    val size = teamSize.coerceIn(1, 8)
    val names = selectedName.split("/").map { it.trim() }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(size) { index ->
            SingleCharacterPickerField(
                label = if (size == 1) label else "$label · Jugador ${index + 1}",
                selectedName = names.getOrElse(index) { "" }, gameTitle = gameTitle, labelColor = labelColor,
                onSelected = { character ->
                    onSelected(List(size) { if (it == index) character else names.getOrElse(it) { "" } }.joinToString(" / "))
                },
            )
        }
    }
}

@Composable
private fun LadderReviewActions(onReview: (String,String?)->Unit) {
    var reason by rememberSaveable { mutableStateOf("") }
    var showDispute by rememberSaveable { mutableStateOf(false) }
    Button(onClick={onReview("CONFIRM",null)}) { Text("Confirmar resultado") }
    TextButton(onClick={showDispute=!showDispute}) { Text("No estoy de acuerdo") }
    if(showDispute) {
        OutlinedTextField(reason,{reason=it},label={Text("Motivo de la disputa")},modifier=Modifier.fillMaxWidth())
        Button(enabled=reason.trim().length in 3..500,onClick={onReview("DISPUTE",reason.trim())}) { Text("Enviar a organización") }
    }
}

internal fun playerMatchStatusLabel(status: String): String = when (status) {
    "PENDING", "CREATED" -> "Pendiente"
    "CALLED" -> "Llamado a jugar"
    "PLAYING", "IN_PROGRESS" -> "En juego"
    "READY_CHECK" -> "Confirma que estás listo"
    "PENDING_REVIEW", "AWAITING_CONFIRMATION" -> "Resultado por confirmar"
    "DISPUTED" -> "En revisión"
    "COMPLETED" -> "Finalizado"
    "WALKOVER" -> "Victoria por ausencia"
    "CANCELLED" -> "Cancelado"
    else -> status
}
