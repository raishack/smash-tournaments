package com.gestortorneos.desktop
import androidx.compose.material3.FilterChip

import com.gestortorneos.ui.*
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.awt.Desktop
import java.net.URI
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.prefs.Preferences

val LightColors = MainLightColors
val DarkColors = MainDarkColors

enum class DesktopSection(val label: String) {
    Home("Inicio"),
    Tournaments("Torneos"),
    Operations("Operativa"),
    Profile("Perfil")
}

@Composable
fun DesktopApp(onExitForUpdate: () -> Unit = {}) {
    val repository = remember { DesktopTournamentRepository() }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val appPreferences = remember { Preferences.userRoot().node("com.example.tournamentmanager.desktop") }

    var themeMode by remember {
        val legacy = appPreferences.get("dark_mode", null)?.let { if (it == "true") MainThemeMode.Dark else MainThemeMode.Light } ?: MainThemeMode.System
        mutableStateOf(runCatching { MainThemeMode.valueOf(appPreferences.get("theme_mode", legacy.name)) }.getOrDefault(legacy))
    }
    var adaptiveLayout by remember { mutableStateOf(appPreferences.getBoolean("adaptive_layout", true)) }
    var textSize by remember { mutableStateOf(runCatching { MainTextSize.valueOf(appPreferences.get("text_size", MainTextSize.Regular.name)) }.getOrDefault(MainTextSize.Regular)) }
    val darkMode = themeMode == MainThemeMode.Dark || (themeMode == MainThemeMode.System && isSystemInDarkTheme())
    var currentSection by rememberSaveable { mutableStateOf(DesktopSection.Home) }
    val managementSession by ManagementSession.state.collectAsState()
    val isAdmin = managementSession != null
    val adminSessionKey = managementSession?.token.orEmpty()
    var adminLoginError by rememberSaveable { mutableStateOf<String?>(null) }
    var adminLoginLoading by rememberSaveable { mutableStateOf(false) }
    var adminNotificationSettings by remember { mutableStateOf<DesktopAdminNotificationSettings?>(null) }
    var adminNotificationSettingsError by rememberSaveable { mutableStateOf<String?>(null) }
    var adminNotificationSettingsLoading by rememberSaveable { mutableStateOf(false) }
    var tournaments by remember { mutableStateOf<List<DesktopTournamentSummary>>(emptyList()) }
    var selectedTournamentId by remember { mutableStateOf<String?>(null) }
    var selectedTournament by remember { mutableStateOf<DesktopTournamentDetail?>(null) }
    var listLoading by remember { mutableStateOf(true) }
    var detailLoading by remember { mutableStateOf(false) }
    val mutationMutex = remember { Mutex() }
    var pendingMutations by remember { mutableStateOf(0) }
    var detailRevision by remember { mutableStateOf(0L) }
    var createDialogOpen by remember { mutableStateOf(false) }
    var createStartggDialogOpen by remember { mutableStateOf(false) }
    var showGenerateBracketResetDialog by remember { mutableStateOf(false) }
    var availableUpdate by remember { mutableStateOf<DesktopAppUpdateInfo?>(null) }
    var dismissedOptionalUpdate by remember { mutableStateOf(false) }
    var updateErrorMessage by remember { mutableStateOf<String?>(null) }
    var updateCheckInProgress by remember { mutableStateOf(false) }
    var updateStatusMessage by remember { mutableStateOf<String?>(null) }

    val updateDownloader = remember { com.gestortorneos.ui.AppUpdateDownloader(desktopUpdateDirectory(), DesktopConfig.baseUrl) }
    val updateTransfer = remember { com.gestortorneos.ui.AppUpdateTransfer(scope, updateDownloader) }
    val downloadState by updateTransfer.state.collectAsState()
    var updateInstalling by remember { mutableStateOf(false) }

    fun openDesktopUpdate(update: DesktopAppUpdateInfo) {
        dismissedOptionalUpdate = false
    }

    fun installDesktopUpdate(update: DesktopAppUpdateInfo) {
        val file = downloadState.file ?: return
        if (updateInstalling) return
        updateInstalling = true
        scope.launch {
            try {
                check(updateDownloader.verify(file, update.downloadPackage())) { "El archivo ya no es válido. Vuelve a descargarlo." }
                launchWindowsInstaller(file)
                onExitForUpdate()
            } catch (error: kotlinx.coroutines.CancellationException) { throw error }
            catch (error: Exception) {
                updateErrorMessage = error.message ?: "No se pudo abrir el instalador."
                updateTransfer.reset()
            } finally { updateInstalling = false }
        }
    }

    suspend fun refreshAvailableUpdate(
        showFailureMessage: Boolean = false,
        showStatusMessage: Boolean = false
    ) {
        if (!System.getProperty("os.name").contains("Windows", ignoreCase = true)) {
            return
        }
        if (updateCheckInProgress || downloadState.busy || updateInstalling) return
        updateCheckInProgress = true
        runCatching { repository.getAvailableDesktopUpdate() }
            .onSuccess { update ->
                if (update?.targetVersion != availableUpdate?.targetVersion || update?.sha256 != availableUpdate?.sha256) {
                    updateTransfer.reset()
                    dismissedOptionalUpdate = false
                }
                availableUpdate = update
                if (update == null) {
                    dismissedOptionalUpdate = false
                    if (showStatusMessage) {
                        updateStatusMessage = "No hay actualizaciones disponibles. Version actual ${DesktopConfig.desktopVersion}."
                    }
                } else if (showStatusMessage) {
                    updateStatusMessage = "Nueva version detectada: ${update.targetVersion}."
                }
            }
            .onFailure { error ->
                if (showFailureMessage) {
                    updateErrorMessage = error.message ?: "No se pudo comprobar si hay actualizaciones."
                }
                if (showStatusMessage) {
                    updateStatusMessage = "No se pudo comprobar si hay actualizaciones."
                }
            }
        updateCheckInProgress = false
    }

    suspend fun silentRefreshList() {
        runCatching { repository.getTournaments() }
            .onSuccess { loaded ->
                tournaments = loaded
                if (selectedTournamentId == null) {
                    selectedTournamentId = loaded.firstOrNull()?.id
                }
            }
    }

    suspend fun silentRefreshDetail() {
        if (pendingMutations > 0) return
        val tournamentId = selectedTournamentId ?: return
        val revision = detailRevision
        runCatching { repository.getTournament(tournamentId) }
            .onSuccess {
                if (tournamentId == selectedTournamentId && revision == detailRevision) selectedTournament = it
            }
    }

    fun refreshList(selectTournamentId: String? = selectedTournamentId) {
        scope.launch {
            listLoading = true
            runCatching { repository.getTournaments() }
                .onSuccess { loaded ->
                    tournaments = loaded
                    selectedTournamentId = selectTournamentId ?: loaded.firstOrNull()?.id
                }
                .onFailure { error ->
                    snackbarHostState.showSnackbar("No se pudieron cargar los torneos: ${error.message}")
                }
            listLoading = false
        }
    }

    fun refreshDetail(tournamentId: String? = selectedTournamentId) {
        val revision = ++detailRevision
        if (tournamentId == null) {
            selectedTournament = null
            detailLoading = false
            return
        }
        if (selectedTournament?.id != tournamentId) selectedTournament = null
        scope.launch {
            detailLoading = true
            runCatching { repository.getTournament(tournamentId) }
                .onSuccess {
                    if (tournamentId == selectedTournamentId && revision == detailRevision && pendingMutations == 0) selectedTournament = it
                }
                .onFailure { error ->
                    snackbarHostState.showSnackbar("No se pudo cargar el torneo: ${error.message}")
                }
            if (tournamentId == selectedTournamentId) detailLoading = false
        }
    }

    fun mutateTournament(message: String? = null, onComplete: (String?) -> Unit = {}, block: suspend () -> DesktopTournamentDetail) {
        val targetId = selectedTournamentId
        pendingMutations += 1
        detailRevision += 1
        scope.launch {
            val result = mutationMutex.withLock { runCatching { block() } }
            pendingMutations -= 1
            detailRevision += 1
            result
                .onSuccess {
                    onComplete(null)
                    if (targetId == selectedTournamentId) selectedTournament = it
                    silentRefreshList()
                    message?.let { text -> snackbarHostState.showSnackbar(text) }
                }
                .onFailure { error ->
                    val message = error.message ?: "Operacion no completada"
                    onComplete(message)
                    snackbarHostState.showSnackbar(message)
                }
        }
    }

    LaunchedEffect(adminSessionKey) {
        selectedTournamentId = null; selectedTournament = null; tournaments = emptyList()
        if (isAdmin) refreshList()
    }
    LaunchedEffect(Unit) { refreshAvailableUpdate() }
    LaunchedEffect(themeMode, textSize, adaptiveLayout) {
        appPreferences.put("theme_mode", themeMode.name)
        appPreferences.put("text_size", textSize.name)
        appPreferences.putBoolean("adaptive_layout", adaptiveLayout)
    }
    LaunchedEffect(selectedTournamentId, adminSessionKey) { if (isAdmin) refreshDetail(selectedTournamentId) }
    LaunchedEffect(currentSection, selectedTournamentId, adminSessionKey) {
        if (!isAdmin) return@LaunchedEffect
        while (true) {
            kotlinx.coroutines.delay(if (currentSection == DesktopSection.Operations) 2500 else 4000)
            silentRefreshList()
            if (currentSection == DesktopSection.Tournaments || currentSection == DesktopSection.Operations) {
                silentRefreshDetail()
            }
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(60_000)
            refreshAvailableUpdate()
        }
    }

    LaunchedEffect(adminSessionKey) {
        adminNotificationSettings = null
        if (adminSessionKey.isNotBlank()) {
            runCatching { repository.getAdminNotificationSettings(adminSessionKey) }
                .onSuccess { adminNotificationSettings = it }
                .onFailure { adminNotificationSettingsError = it.message }
        }
    }

    MainTheme(MainAppearance(themeMode, textSize, { themeMode = it }, { textSize = it }, adaptiveLayout, { adaptiveLayout = it })) {
        val update = availableUpdate
        if (update != null && (!dismissedOptionalUpdate || update.required)) {
            AppUpdateDialog(
                title = update.title, currentVersion = update.currentVersion, targetVersion = update.targetVersion,
                notes = update.notes, changelog = update.changelog, required = update.required,
                state = downloadState, installing = updateInstalling,
                installHint = "La descarga se guarda en la app. Al pulsar Instalar, Smash Tournaments se cerrará para que Windows pueda actualizarla. Confirma el asistente y vuelve a abrir Smash Tournaments al terminar.",
                onDownload = { updateTransfer.download(update.downloadPackage()) },
                onInstall = { installDesktopUpdate(update) },
                onCancel = updateTransfer::cancel, onDismiss = { dismissedOptionalUpdate = true },
            )
        }

        if (updateErrorMessage != null) {
            AlertDialog(
                onDismissRequest = { updateErrorMessage = null },
                title = { Text("No se pudo actualizar") },
                text = { Text(updateErrorMessage!!) },
                confirmButton = {
                    TextButton(onClick = { updateErrorMessage = null }) {
                        Text("Cerrar")
                    }
                }
            )
        }

        if (managementSession == null) {
            ManagementLoginScreen(DesktopConfig.baseUrl)
            return@MainTheme
        }

        Scaffold(snackbarHost = {
            if (LocalBracketFullscreen.current?.owner == null) SnackbarHost(snackbarHostState)
        }, containerColor = Color.Transparent) { innerPadding ->
            Box(
                modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(innerPadding)
            ) {
                Row(modifier = Modifier.fillMaxSize()) {
                    TournamentSidebar(
                        tournaments = tournaments,
                        loading = listLoading,
                        selectedTournamentId = selectedTournamentId,
                        onSelectTournament = {
                            selectedTournamentId = it
                            if (currentSection == DesktopSection.Home) currentSection = DesktopSection.Tournaments
                        },
                        onRefresh = { refreshList() },
                        onCreateTournament = { createDialogOpen = true },
                        onCreateStartggTournament = { createStartggDialogOpen = true },
                        darkMode = darkMode,
                        onToggleTheme = { themeMode = if (darkMode) MainThemeMode.Light else MainThemeMode.Dark }
                    )
                    HorizontalDivider(modifier = Modifier.fillMaxHeight().width(1.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f))
                    TournamentPane(
                        currentSection = currentSection,
                        onSectionSelected = { currentSection = it },
                        tournaments = tournaments,
                        tournament = selectedTournament,
                        loading = detailLoading || pendingMutations > 0,
                        darkMode = darkMode,
                        isAdmin = isAdmin,
                        adminLoginError = adminLoginError,
                        adminLoginLoading = adminLoginLoading,
                        adminNotificationSettings = adminNotificationSettings,
                        adminNotificationSettingsError = adminNotificationSettingsError,
                        adminNotificationSettingsLoading = adminNotificationSettingsLoading,
                        availableUpdate = availableUpdate,
                        updateCheckInProgress = updateCheckInProgress,
                        updateStatusMessage = updateStatusMessage,
                        onToggleTheme = { themeMode = if (darkMode) MainThemeMode.Light else MainThemeMode.Dark },
                        onOpenCreate = { createDialogOpen = true },
                        onOpenCreateStartgg = { createStartggDialogOpen = true },
                        onAdminLogin = {},
                        onAdminLogout = {
                            adminNotificationSettings = null
                            scope.launch { ManagementSession.logout() }
                        },
                        onUpdateNotificationSettings = { telegramEnabled, whatsappEnabled ->
                            if (adminSessionKey.isBlank()) {
                                adminNotificationSettingsError = "La sesion admin no esta disponible."
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
                                        adminNotificationSettingsError = error.message ?: "No se pudieron guardar las notificaciones."
                                    }
                                    adminNotificationSettingsLoading = false
                                }
                            }
                        },
                        onCheckForUpdates = {
                            scope.launch {
                                refreshAvailableUpdate(showFailureMessage = true, showStatusMessage = true)
                            }
                        },
                        onOpenUpdate = { update ->
                            openDesktopUpdate(update)
                        },
                        onRefresh = { refreshDetail() },
                        onGenerateBracket = {
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            val tournament = selectedTournament ?: return@TournamentPane
                            val alreadyStarted = tournament.status == "IN_PROGRESS"
                                || tournament.status == "IN PROGRESS"
                                || tournament.status == "COMPLETED"
                            if (alreadyStarted && !tournament.isStartggMirrored) {
                                showGenerateBracketResetDialog = true
                            } else {
                                mutateTournament("Bracket generada") { repository.generateBracket(tournamentId) }
                            }
                        },
                        onStartTournament = {
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament("Torneo iniciado") { repository.startTournament(tournamentId) }
                        },
                        onResetTournament = {
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament("Torneo reseteado") { repository.resetTournament(tournamentId) }
                        },
                        onArchiveTournament = { archived ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament(if (archived) "Torneo archivado" else "Torneo desarchivado") { repository.setArchived(tournamentId, archived) }
                        },
                        onDeleteTournament = {
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            scope.launch {
                                runCatching { repository.deleteTournament(tournamentId, adminSessionKey) }
                                    .onSuccess {
                                        selectedTournament = null
                                        selectedTournamentId = null
                                        refreshList()
                                        snackbarHostState.showSnackbar("Torneo eliminado")
                                    }
                                    .onFailure { error -> snackbarHostState.showSnackbar(error.message ?: "No se pudo eliminar") }
                            }
                        },
                        onSaveSetups = { count, streamCount ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament("Setups guardados") { repository.updateSetups(tournamentId, count, streamCount) }
                        },
                        adminKey = adminSessionKey,
                        onPublicOptions = { options ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament("Opciones públicas guardadas") { repository.updatePublicOptions(tournamentId, adminSessionKey, options) }
                        },
                        onSaveSettings = { input ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament("Ajustes guardados") { repository.updateTournament(tournamentId, input) }
                        },
                        onAddParticipant = { displayName ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.addParticipant(tournamentId, displayName) }
                        },
                        onImportStartgg = { eventUrl ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament("Participantes importados desde start.gg") {
                                repository.importStartggEvent(
                                    tournamentId = tournamentId,
                                    eventUrl = eventUrl,
                                    syncResults = true,
                                    preserveTournamentTitle = false
                                )
                            }
                        },
                        onPreviewStartgg = { eventUrl, onSuccess, onError ->
                            scope.launch {
                                runCatching { repository.previewStartggImport(eventUrl) }
                                    .onSuccess(onSuccess)
                                    .onFailure { error -> onError(error.message ?: "No se pudo leer el event de start.gg") }
                            }
                        },
                        onUpdateParticipant = { participantId, displayName, seed ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.updateParticipant(tournamentId, participantId, displayName, seed) }
                        },
                        onDeleteParticipant = { participantId ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.deleteParticipant(tournamentId, participantId) }
                        },
                        onStartLadder = {
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament("Ladder activada") { repository.startLadder(tournamentId) }
                        },
                        onFinalizeLadder = {
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament("Ladder finalizada") { repository.finalizeLadder(tournamentId) }
                        },
                        onCallMatch = { matchId, station ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.callMatch(tournamentId, matchId, station) }
                        },
                        onCancelCall = { matchId ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.cancelCall(tournamentId, matchId) }
                        },
                        onStartMatch = { matchId ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.startMatch(tournamentId, matchId) }
                        },
                        onSaveCharacters = { matchId, selections ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.updateMatchCharacters(tournamentId, matchId, selections) }
                        },
                        onSaveCharactersAndRecordGameWin = { matchId, participantId, selections ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.updateMatchCharactersAndRecordGameWin(tournamentId, matchId, participantId, selections) }
                        },
                        onSaveCharactersAndReportWinner = { matchId, participantId, selections ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.updateMatchCharactersAndReportWinner(tournamentId, matchId, participantId, selections) }
                        },
                        onReportDetailedResult = { matchId, bestOfOverride, games, onComplete ->
                            val tournamentId = selectedTournamentId
                            if (tournamentId == null) {
                                onComplete("Selecciona un torneo para continuar.")
                                return@TournamentPane
                            }
                            var saved = false
                            mutateTournament(onComplete = { error -> onComplete(if (saved) null else error) }) {
                                repository.reportDetailedResult(tournamentId, matchId, bestOfOverride, games) { saved = true }
                            }
                        },
                        onRecordGameWin = { matchId, participantId ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.recordGameWin(tournamentId, matchId, participantId) }
                        },
                        onReportWinner = { matchId, participantId ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.reportWinner(tournamentId, matchId, participantId) }
                        },
                        onSelectAdvancer = { matchId, participantId ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.selectMarioKartAdvancer(tournamentId, matchId, participantId) }
                        },
                        onResolveAbsence = { matchId, outcome ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.resolveAbsence(tournamentId, matchId, outcome) }
                        },
                        onResetMatch = { matchId ->
                            val tournamentId = selectedTournamentId ?: return@TournamentPane
                            mutateTournament { repository.resetMatch(tournamentId, matchId) }
                        }
                    )
                }
            }
        }

        DesktopBracketFullscreenOverlay(snackbarHostState)

        if (createDialogOpen) {
            CreateTournamentDialog(
                onDismiss = { createDialogOpen = false },
                onCreate = { input ->
                    scope.launch {
                        runCatching { repository.createTournament(input) }
                            .onSuccess { created ->
                                createDialogOpen = false
                                currentSection = DesktopSection.Tournaments
                                refreshList(created.id)
                            }
                            .onFailure { error -> snackbarHostState.showSnackbar(error.message ?: "No se pudo crear el torneo") }
                    }
                }
            )
        }

        if (createStartggDialogOpen) {
            CreateStartggTournamentDialog(
                onDismiss = { createStartggDialogOpen = false },
                onPreview = { eventUrl, onSuccess, onError ->
                    scope.launch {
                        runCatching { repository.previewStartggImport(eventUrl) }
                            .onSuccess(onSuccess)
                            .onFailure { error -> onError(error.message ?: "No se pudo leer el event de start.gg") }
                    }
                },
                onCreate = { eventUrl, callTimeout, setupCount, streamCount ->
                    scope.launch {
                        runCatching { repository.createStartggTournament(eventUrl, callTimeout, setupCount, streamCount) }
                            .onSuccess { created ->
                                createStartggDialogOpen = false
                                currentSection = DesktopSection.Tournaments
                                refreshList(created.id)
                            }
                            .onFailure { error -> snackbarHostState.showSnackbar(error.message ?: "No se pudo crear el torneo start.gg") }
                    }
                }
            )
        }

        if (showGenerateBracketResetDialog) {
            ConfirmActionDialog(
                title = "Regenerar bracket",
                message = "Si procedes se reiniciara el torneo y se volvera a generar la bracket. Esta accion borra el progreso actual.",
                confirmLabel = "Confirmar",
                onDismiss = { showGenerateBracketResetDialog = false },
                onConfirm = {
                    showGenerateBracketResetDialog = false
                    val tournamentId = selectedTournamentId ?: return@ConfirmActionDialog
                    mutateTournament("Bracket regenerada") { repository.resetAndGenerateBracket(tournamentId) }
                }
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TournamentSidebar(
    tournaments: List<DesktopTournamentSummary>,
    loading: Boolean,
    selectedTournamentId: String?,
    onSelectTournament: (String) -> Unit,
    onRefresh: () -> Unit,
    onCreateTournament: () -> Unit,
    onCreateStartggTournament: () -> Unit,
    darkMode: Boolean,
    onToggleTheme: () -> Unit
) {
    androidx.compose.foundation.layout.BoxWithConstraints {
    val sidebarWidth = (maxWidth * .24f).coerceIn(240.dp, 340.dp)
    var showArchived by remember { mutableStateOf(false) }
    Column(modifier = Modifier.fillMaxHeight().width(sidebarWidth).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Smash Tournaments", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("Centro de torneos y operativa rapida desde Windows.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = onCreateTournament) { Text("Nuevo torneo") }
            OutlinedButton(onClick = onCreateStartggTournament) { Text("Importar de start.gg") }
            OutlinedButton(onClick = onRefresh) { Text("Refrescar") }
            OutlinedButton(onClick = onToggleTheme) { Text(if (darkMode) "Claro" else "Oscuro") }
        }
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), modifier = Modifier.fillMaxSize(), shape = RoundedCornerShape(20.dp)) {
            if (loading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(selected = !showArchived, onClick = { showArchived = false }, label = { Text("Actuales") })
                            FilterChip(selected = showArchived, onClick = { showArchived = true }, label = { Text("Archivados") })
                        }
                    }
                    if (tournaments.none { (it.status == "ARCHIVED") == showArchived }) item { Text("No hay torneos en esta lista.") }
                    items(tournaments.filter { (it.status == "ARCHIVED") == showArchived }) { tournament ->
                        val selected = tournament.id == selectedTournamentId
                        Card(
                            modifier = Modifier.fillMaxWidth().clickable { onSelectTournament(tournament.id) },
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.38f)
                            )
                        ) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(tournament.title, fontWeight = FontWeight.Bold)
                                Text("${tournament.game} · ${tournament.format}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("Inscritos ${tournament.registeredParticipants}/${tournament.maxParticipants}", style = MaterialTheme.typography.bodySmall)
                                MainStatusBadge(mainStatusLabel(tournament.status), tournament.status)
                            }
                        }
                    }
                }
            }
        }
    }
}
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TournamentPane(
    currentSection: DesktopSection,
    onSectionSelected: (DesktopSection) -> Unit,
    tournaments: List<DesktopTournamentSummary>,
    tournament: DesktopTournamentDetail?,
    loading: Boolean,
    darkMode: Boolean,
    isAdmin: Boolean,
    adminKey: String,
    adminLoginError: String?,
    adminLoginLoading: Boolean,
    adminNotificationSettings: DesktopAdminNotificationSettings?,
    adminNotificationSettingsError: String?,
    adminNotificationSettingsLoading: Boolean,
    availableUpdate: DesktopAppUpdateInfo?,
    updateCheckInProgress: Boolean,
    updateStatusMessage: String?,
    onToggleTheme: () -> Unit,
    onOpenCreate: () -> Unit,
    onOpenCreateStartgg: () -> Unit,
    onAdminLogin: (String) -> Unit,
    onAdminLogout: () -> Unit,
    onUpdateNotificationSettings: (Boolean, Boolean) -> Unit,
    onCheckForUpdates: () -> Unit,
    onOpenUpdate: (DesktopAppUpdateInfo) -> Unit,
    onRefresh: () -> Unit,
    onGenerateBracket: () -> Unit,
    onStartTournament: () -> Unit,
    onArchiveTournament: (Boolean) -> Unit,
    onResetTournament: () -> Unit,
    onDeleteTournament: () -> Unit,
    onSaveSettings: (CreateTournamentInput) -> Unit,
    onSaveSetups: (Int, Int) -> Unit,
    onPublicOptions: (Map<String, Boolean>) -> Unit,
    onAddParticipant: (String) -> Unit,
    onImportStartgg: (String) -> Unit,
    onPreviewStartgg: (String, (DesktopStartggPreview) -> Unit, (String) -> Unit) -> Unit,
    onUpdateParticipant: (String, String, Int?) -> Unit,
    onDeleteParticipant: (String) -> Unit,
    onStartLadder: () -> Unit,
    onFinalizeLadder: () -> Unit,
    onCallMatch: (String, String?) -> Unit,
    onCancelCall: (String) -> Unit,
    onStartMatch: (String) -> Unit,
    onSaveCharacters: (String, List<Pair<String, String>>) -> Unit,
    onSaveCharactersAndRecordGameWin: (String, String, List<Pair<String, String>>) -> Unit,
    onSaveCharactersAndReportWinner: (String, String, List<Pair<String, String>>) -> Unit,
    onReportDetailedResult: (String, Int?, List<DesktopDetailedReportedGame>, (String?) -> Unit) -> Unit,
    onRecordGameWin: (String, String) -> Unit,
    onReportWinner: (String, String) -> Unit,
    onSelectAdvancer: (String, String) -> Unit,
    onResolveAbsence: (String, String) -> Unit,
    onResetMatch: (String) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize().padding(22.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            DesktopSection.entries.forEach { section ->
                val selected = currentSection == section
                if (selected) Button(onClick = { onSectionSelected(section) }) { Text(section.label) }
                else OutlinedButton(onClick = { onSectionSelected(section) }) { Text(section.label) }
            }
        }
        Box(modifier = Modifier.fillMaxSize()) {
            when {
                currentSection == DesktopSection.Home -> HomeSection(
                    tournaments = tournaments.filter { it.status != "ARCHIVED" },
                    onOpenTournament = { onSectionSelected(DesktopSection.Tournaments) },
                    onCreateTournament = onOpenCreate,
                    onCreateStartggTournament = onOpenCreateStartgg
                )
                currentSection == DesktopSection.Profile -> ProfileSection(
                    darkMode = darkMode,
                    isAdmin = isAdmin,
                    adminLoginError = adminLoginError,
                    adminLoginLoading = adminLoginLoading,
                    adminNotificationSettings = adminNotificationSettings,
                    adminNotificationSettingsError = adminNotificationSettingsError,
                    adminNotificationSettingsLoading = adminNotificationSettingsLoading,
                    desktopVersion = DesktopConfig.desktopVersion,
                    backendUrl = DesktopConfig.baseUrl,
                    availableUpdate = availableUpdate,
                    updateCheckInProgress = updateCheckInProgress,
                    updateStatusMessage = updateStatusMessage,
                    displayWebUrl = DesktopConfig.displayWebUrl,
                    onToggleTheme = onToggleTheme,
                    onAdminLogin = onAdminLogin,
                    onAdminLogout = onAdminLogout,
                    onUpdateNotificationSettings = onUpdateNotificationSettings,
                    onCheckForUpdates = onCheckForUpdates,
                    onOpenUpdate = onOpenUpdate
                )
                loading && tournament == null -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                tournament == null -> Text("Selecciona un torneo para continuar.", modifier = Modifier.align(Alignment.Center), color = MaterialTheme.colorScheme.onSurfaceVariant)
                tournament.status == "ARCHIVED" -> ArchivedTournamentSection(tournament, loading, { onArchiveTournament(false) })
                currentSection == DesktopSection.Tournaments -> TournamentManagementSection(
                    onOpenOperations = { onSectionSelected(DesktopSection.Operations) },
                                        adminKey = adminKey,
                    onArchiveTournament = { onArchiveTournament(true) },
                    tournament = tournament,
                    isAdmin = isAdmin,
                    onRefresh = onRefresh,
                    onGenerateBracket = onGenerateBracket,
                    onStartTournament = onStartTournament,
                    onResetTournament = onResetTournament,
                    onDeleteTournament = onDeleteTournament,
                    onSaveSettings = onSaveSettings,
                    onSaveSetups = onSaveSetups,
                    onPublicOptions = onPublicOptions,
                    onAddParticipant = onAddParticipant,
                    onImportStartgg = onImportStartgg,
                    onPreviewStartgg = onPreviewStartgg,
                    onUpdateParticipant = onUpdateParticipant,
                    onDeleteParticipant = onDeleteParticipant,
                    onStartLadder = onStartLadder,
                    onFinalizeLadder = onFinalizeLadder
                )
                else -> TournamentOperationsSection(
                    tournament = tournament,
                    isBusy = loading,
                    onRefresh = onRefresh,
                    onCallMatch = onCallMatch,
                    onCancelCall = onCancelCall,
                    onStartMatch = onStartMatch,
                    onSaveCharacters = onSaveCharacters,
                    onSaveCharactersAndRecordGameWin = onSaveCharactersAndRecordGameWin,
                    onSaveCharactersAndReportWinner = onSaveCharactersAndReportWinner,
                    onReportDetailedResult = onReportDetailedResult,
                    onRecordGameWin = onRecordGameWin,
                    onReportWinner = onReportWinner,
                    onSelectAdvancer = onSelectAdvancer,
                    onResolveAbsence = onResolveAbsence,
                    onResetMatch = onResetMatch
                )
            }
        }
    }
}
