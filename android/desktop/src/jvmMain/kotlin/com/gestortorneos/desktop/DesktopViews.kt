@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.gestortorneos.desktop

import com.gestortorneos.ui.*
import androidx.compose.runtime.key
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.HorizontalScrollbar
import androidx.compose.foundation.VerticalScrollbar
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollbarAdapter
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogWindow
import androidx.compose.ui.window.rememberDialogState
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

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
    "Min Min", "Steve", "Sephiroth", "Pyra & Mythra", "Kazuya", "Sora"
)

private val roa2CharacterNames = listOf(
    "Random",
    "Zetterburn",
    "Orcane",
    "Wrastor",
    "Kragg",
    "Forsburn",
    "Maypul",
    "Absa",
    "Etalus",
    "Ranno",
    "Clairen",
    "Olympia",
    "Fleet",
    "Loxodont",
    "Galvan",
    "La Reina",
    "Slade",
)

private fun isRoa2GameTitle(gameTitle: String): Boolean {
    val normalized = gameTitle.lowercase()
    return normalized.contains("roa 2")
        || normalized.contains("roa2")
        || normalized.contains("roa ii")
        || normalized.contains("rivals of aether 2")
        || normalized.contains("rivals of aether ii")
        || normalized.contains("rivals 2")
        || normalized.contains("rivals ii")
}

private fun characterNamesForGame(gameTitle: String): List<String> {
    return if (isRoa2GameTitle(gameTitle)) roa2CharacterNames else smashUltimateCharacterNames
}

private fun characterGameLabel(gameTitle: String): String {
    return if (isRoa2GameTitle(gameTitle)) "Rivals of Aether 2" else "Smash Ultimate"
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HomeSection(
    tournaments: List<DesktopTournamentSummary>,
    onOpenTournament: () -> Unit,
    onCreateTournament: () -> Unit,
    onCreateStartggTournament: () -> Unit
) {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        CardSection {
            Text("Centro de torneos", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("Controla torneos, participantes y enfrentamientos en tiempo real desde Windows.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onCreateTournament) { Text("Crear torneo") }
                OutlinedButton(onClick = onCreateStartggTournament) { Text("Importar de start.gg") }
                OutlinedButton(onClick = onOpenTournament) { Text("Abrir torneos") }
            }
        }
        CardSection {
            Text("Ultimos torneos", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            if (tournaments.isEmpty()) {
                Text("Todavia no hay torneos cargados.")
            } else {
                tournaments.take(5).forEach { tournament ->
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.34f)), border = surfaceCardBorder()) {
                        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(tournament.title, fontWeight = FontWeight.SemiBold)
                            Text("${tournament.game} · ${tournament.format}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("Inscritos ${tournament.registeredParticipants}/${tournament.maxParticipants} · ${mainStatusLabel(tournament.status)}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileSection(
    darkMode: Boolean,
    isAdmin: Boolean,
    adminLoginError: String?,
    adminLoginLoading: Boolean,
    adminNotificationSettings: DesktopAdminNotificationSettings?,
    adminNotificationSettingsError: String?,
    adminNotificationSettingsLoading: Boolean,
    desktopVersion: String,
    backendUrl: String,
    availableUpdate: DesktopAppUpdateInfo?,
    updateCheckInProgress: Boolean,
    updateStatusMessage: String?,
    displayWebUrl: String,
    onToggleTheme: () -> Unit,
    onAdminLogin: (String) -> Unit,
    onAdminLogout: () -> Unit,
    onUpdateNotificationSettings: (Boolean, Boolean) -> Unit,
    onCheckForUpdates: () -> Unit,
    onOpenUpdate: (DesktopAppUpdateInfo) -> Unit
) {
    var adminKey by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(isAdmin) {
        if (isAdmin) {
            adminKey = ""
        }
    }
    Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        CardSection {
            Text("Perfil", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("Ajustes del cliente y acceso administrativo.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        MainAdaptivePair(first = {
            CardSection {
                MainSectionHeading("Cuenta de gestión")
                ManagementAccountControls(onLogout = onAdminLogout, showLogout = false)
            }
        }, second = { CardSection { AppearanceControls() } })
        if (isAdmin) {
            CardSection {
                Text("Notificaciones de grupos", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("Activa o desactiva los avisos a Telegram y WhatsApp desde la app de gestion.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (adminNotificationSettings == null) {
                    Spacer(Modifier.height(8.dp))
                    MainBusyLabel(if (adminNotificationSettingsLoading) "Cargando estado…" else "Estado no disponible", adminNotificationSettingsLoading)
                } else {
                    val telegramEnabled = adminNotificationSettings.telegramEnabled
                    val whatsappEnabled = adminNotificationSettings.whatsappEnabled
                    MainSwitchRow("Telegram", if (telegramEnabled) "Avisos activados" else "Avisos desactivados", telegramEnabled, !adminNotificationSettingsLoading) { onUpdateNotificationSettings(it, whatsappEnabled) }
                    HorizontalDivider()
                    MainSwitchRow("WhatsApp", if (whatsappEnabled) "Avisos activados" else "Avisos desactivados", whatsappEnabled, !adminNotificationSettingsLoading) { onUpdateNotificationSettings(telegramEnabled, it) }
                }
                if (adminNotificationSettingsLoading && adminNotificationSettings != null) {
                    MainBusyLabel("Guardando…", true)
                }
                if (adminNotificationSettingsError != null) {
                    Text(adminNotificationSettingsError, color = MaterialTheme.colorScheme.error)
                }
            }
        }
        CardSection {
            Text("Actualizaciones", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("Version actual: $desktopVersion", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Backend: $backendUrl", color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (availableUpdate != null) {
                Spacer(Modifier.height(8.dp))
                Text("Nueva version disponible: ${availableUpdate.targetVersion}", color = MainPalette.success, fontWeight = FontWeight.SemiBold)
                availableUpdate.notes?.takeIf { it.isNotBlank() }?.let {
                    Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            updateStatusMessage?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onCheckForUpdates, enabled = !updateCheckInProgress) {
                    Text(if (updateCheckInProgress) "Comprobando..." else "Buscar actualizaciones")
                }
                if (availableUpdate != null) {
                    Button(onClick = { onOpenUpdate(availableUpdate) }) {
                        Text("Descargar e instalar")
                    }
                }
            }
        }
        CardSection {
            Text("Display web", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("URL del display: $displayWebUrl", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        MainDangerButton("Cerrar sesión", onClick = onAdminLogout)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TournamentManagementSection(
    tournament: DesktopTournamentDetail,
    onArchiveTournament: () -> Unit,
    onOpenOperations: () -> Unit,
    isAdmin: Boolean,
    adminKey: String,
    onRefresh: () -> Unit,
    onGenerateBracket: () -> Unit,
    onStartTournament: () -> Unit,
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
    onFinalizeLadder: () -> Unit
) {
    val reviewAnchors = remember { mutableMapOf<String, androidx.compose.foundation.relocation.BringIntoViewRequester>() }
    val reviewScope = rememberCoroutineScope()
    var showSettings by rememberSaveable(tournament.id) { mutableStateOf(false) }
    var showFortniteReset by rememberSaveable(tournament.id) { mutableStateOf(false) }
    if (showFortniteReset) AlertDialog(onDismissRequest = { showFortniteReset = false },
        title = { Text("Reiniciar Fortnite") }, text = { Text("Se borrarán grupos, actas y puntos. Se conservan los inscritos para sortear nuevos grupos.") },
        confirmButton = { TextButton(onClick = { showFortniteReset = false; onResetTournament() }) { Text("Reiniciar") } },
        dismissButton = { TextButton(onClick = { showFortniteReset = false }) { Text("Cancelar") } })
    var showParticipants by rememberSaveable(tournament.id) { mutableStateOf(false) }
    val canChangeEntrants = !tournament.isStartggMirrored && tournament.status in listOf("DRAFT", "PUBLISHED", "CHECK IN", "READY") && !(tournament.bracketMode == "FORTNITE" && tournament.status == "READY")
    var showBracket by rememberSaveable(tournament.id) { mutableStateOf(false) }
    var bracketRenderMode by rememberSaveable(tournament.id) { mutableStateOf("CLASSIC") }
    var showSetups by rememberSaveable(tournament.id) { mutableStateOf(false) }
    var showLadder by rememberSaveable(tournament.id) { mutableStateOf(false) }
    var title by remember(tournament.id, tournament.title) { mutableStateOf(tournament.title) }
    var gameTitle by remember(tournament.id, tournament.game) { mutableStateOf(tournament.game) }
    var description by remember(tournament.id, tournament.description) { mutableStateOf(tournament.description) }
    var platform by remember(tournament.id, tournament.platform) { mutableStateOf(tournament.platform) }
    var maxParticipantsText by remember(tournament.id, tournament.maxParticipants) { mutableStateOf(tournament.maxParticipants.toString()) }
    var fortniteLobbySize by remember(tournament.id, tournament.fortniteLobbySize) { mutableStateOf(tournament.fortniteLobbySize) }
    var fortniteGamesPerRound by remember(tournament.id, tournament.fortniteGamesPerRound) { mutableStateOf(tournament.fortniteGamesPerRound) }
    var bracketMode by remember(tournament.id, tournament.bracketMode) { mutableStateOf(tournament.bracketMode) }
    var format by remember(tournament.id, tournament.rawFormat) { mutableStateOf(tournament.rawFormat) }
    var mkartAdvanceMode by remember(tournament.id, tournament.mkartAdvanceCount) { mutableStateOf(tournament.mkartAdvanceCount.toString()) }
    var mkartLosersAdvanceMode by remember(tournament.id, tournament.mkartLosersAdvanceCount) { mutableStateOf(tournament.mkartLosersAdvanceCount.toString()) }
    var winnersBestOfText by remember(tournament.id, tournament.winnersBestOf) { mutableStateOf(tournament.winnersBestOf.toString()) }
    var losersBestOfText by remember(tournament.id, tournament.losersBestOf) { mutableStateOf(tournament.losersBestOf.toString()) }
    var seedingMethod by remember(tournament.id, tournament.seedingMethod) { mutableStateOf(tournament.seedingMethod) }
    var callTimeoutText by remember(tournament.id, tournament.callTimeoutMinutes) { mutableStateOf(tournament.callTimeoutMinutes.toString()) }
    var setupCountText by remember(tournament.id, tournament.setupCount) { mutableStateOf(tournament.setupCount.toString()) }
    var streamCountText by remember(tournament.id, tournament.streamCount) { mutableStateOf(tournament.streamCount.toString()) }
    var playAreaName by remember(tournament.id, tournament.playAreaName) { mutableStateOf(tournament.playAreaName.orEmpty()) }
    var newParticipantName by remember(tournament.id) { mutableStateOf("") }
    var showStartggDialog by rememberSaveable(tournament.id) { mutableStateOf(false) }

    LaunchedEffect(tournament.id, tournament.title, tournament.game, tournament.description, tournament.platform, tournament.maxParticipants, tournament.rawFormat, tournament.bracketMode, tournament.mkartAdvanceCount, tournament.winnersBestOf, tournament.losersBestOf, tournament.seedingMethod, tournament.callTimeoutMinutes, tournament.setupCount, tournament.playAreaName) {
        title = tournament.title
        gameTitle = tournament.game
        description = tournament.description
        platform = tournament.platform
        maxParticipantsText = tournament.maxParticipants.toString()
        bracketMode = tournament.bracketMode
        format = tournament.rawFormat
        mkartAdvanceMode = tournament.mkartAdvanceCount.toString()
        mkartLosersAdvanceMode = tournament.mkartLosersAdvanceCount.toString()
        winnersBestOfText = tournament.winnersBestOf.toString()
        losersBestOfText = tournament.losersBestOf.toString()
        seedingMethod = tournament.seedingMethod
        callTimeoutText = tournament.callTimeoutMinutes.toString()
        setupCountText = tournament.setupCount.toString()
        playAreaName = tournament.playAreaName.orEmpty()
    }

    Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TournamentReviewButton(tournament.id, load = { DesktopTournamentRepository().getReview(tournament.id) }, onAttendance = { participant, value -> DesktopTournamentRepository().updateAttendance(tournament.id, participant, value) }, onNavigate = { target ->
            when (target) {
                "PARTICIPANTS" -> showParticipants = true
                "BRACKET" -> showBracket = true
                "SETTINGS" -> showSettings = true
                "LADDER" -> showLadder = true
            }
            if (target == "SYNC") onOpenOperations() else reviewScope.launch {
                delay(100)
                reviewAnchors[target]?.bringIntoView(androidx.compose.ui.geometry.Rect(0f, 0f, 1f, 500f))
            }
        })
        MainTournamentSummary(tournament.title, "${tournament.game} · ${tournament.platform} · ${tournament.format}", tournament.status, mainStatusLabel(tournament.status),
            "${tournament.registeredParticipants}/${tournament.maxParticipants} ${if (tournament.teamSize > 1) "equipos" else "participantes"}", tournamentNextStep(tournament.status, tournament.bracketMode == "FORTNITE"))
        TournamentReviewAnchor("COMPETITION", reviewAnchors)
        CardSection {
            MainSectionHeading("Competición")
            tournament.importProgress?.let { Text(it) }
            TournamentActivityButton(tournament.id)
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onRefresh) { Text("Refrescar") }
                if (!tournament.isStartggMirrored && tournament.bracketMode != "FORTNITE") {
                    OutlinedButton(onClick = onGenerateBracket, enabled = tournament.registeredParticipants >= 2) {
                        Text(if (tournament.matches.isEmpty()) "Generar bracket" else "Regenerar bracket")
                    }
                }
                if (!tournament.isStartggMirrored && tournament.status == "READY" && tournament.bracketMode != "FORTNITE") {
                    Button(onClick = onStartTournament, enabled = tournament.matches.isNotEmpty()) { Text("Iniciar torneo") }
                }
            }
            MainOtherActions {
                Text("Estas acciones pueden borrar la bracket, los resultados o el torneo.", style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (!tournament.isStartggMirrored) MainDangerButton("Reiniciar torneo", onClick = { if (tournament.bracketMode == "FORTNITE") showFortniteReset = true else onResetTournament() })
                    if (isAdmin) MainDangerButton("Eliminar torneo", onClick = onDeleteTournament)
                }
            }
        }
        if (tournament.status == "COMPLETED") {
            TournamentReviewAnchor("ARCHIVE", reviewAnchors)
            com.gestortorneos.ui.TournamentArchiveButton(false, onConfirm = onArchiveTournament)
        TournamentReviewAnchor("TOP8", reviewAnchors)
            Top8EditorButton(tournament.id)
        }
        TournamentReviewAnchor("REGISTRATION", reviewAnchors)
        PublicTournamentOptions(tournament, isAdmin, adminKey, onPublicOptions)
        TournamentReviewAnchor("TEAMS", reviewAnchors)
        if (!tournament.isStartggMirrored && tournament.teamSize > 1) TeamRosterPanel(tournament.id, onRefresh)
        TournamentReviewAnchor("FORTNITE", reviewAnchors)
        if (tournament.bracketMode == "FORTNITE") FortnitePanelButton(tournament.id)
        CardSection {
            TournamentReviewAnchor("SETTINGS", reviewAnchors)
            CollapsibleHeader(if (tournament.isStartggMirrored) "Ajustes de start.gg" else "Ajustes del torneo", showSettings) { showSettings = !showSettings }
            if (showSettings) {
                if (tournament.isStartggMirrored) {
                    Spacer(Modifier.height(12.dp))
                    Text("Este torneo usa la bracket espejo de start.gg. Aqui solo puedes reimportar la bracket, ajustar el tiempo de llamada y definir cuantas setups estan disponibles.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    FormField(tournament.startggEventUrl.orEmpty(), { _ -> }, "Event importado", 3)
                    FormField(callTimeoutText, { callTimeoutText = it.filter(Char::isDigit) }, "Minutos para llamada")
                    FormField(setupCountText, { setupCountText = it.filter(Char::isDigit) }, "Numero de setups")
                    SegmentedChoiceRow("Stream", listOf("0" to "Sin stream", "1" to "1 stream", "2" to "2 streams"), streamCountText) { streamCountText = it }
                    Button(onClick = { onSaveSetups(setupCountText.toIntOrNull() ?: tournament.setupCount, streamCountText.toIntOrNull() ?: 0) }) { Text("Guardar setups y stream") }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(onClick = {
                            onSaveSettings(
                                CreateTournamentInput(
                                    title = tournament.title,
                                    gameTitle = tournament.game,
                                    description = tournament.description,
                                    platform = tournament.platform,
                                    maxParticipants = tournament.maxParticipants,
                                    format = tournament.rawFormat,
                                    bracketMode = tournament.bracketMode,
                                    mkartAdvanceCount = tournament.mkartAdvanceCount,
                                    mkartLosersAdvanceCount = tournament.mkartLosersAdvanceCount,
                                    bestOf = tournament.bestOf,
                                    winnersBestOf = tournament.winnersBestOf,
                                    losersBestOf = tournament.losersBestOf,
                                    seedingMethod = tournament.seedingMethod,
                                    callTimeoutMinutes = callTimeoutText.toIntOrNull() ?: tournament.callTimeoutMinutes,
                                    setupCount = setupCountText.toIntOrNull() ?: tournament.setupCount,
                                    streamCount = streamCountText.toIntOrNull() ?: 0
                                )
                            )
                        }) { Text("Guardar ajustes") }
                        Button(
                            onClick = { tournament.startggEventUrl?.let(onImportStartgg) },
                            enabled = !tournament.startggEventUrl.isNullOrBlank()
                        ) { Text("Reimportar bracket") }
                    }
                } else {
                    Spacer(Modifier.height(12.dp))
                    FormField(title, { title = it }, "Nombre del torneo")
                    FormField(gameTitle, { gameTitle = it }, "Videojuego")
                    FormField(description, { description = it }, "Descripcion", 3)
                    FormField(platform, { platform = it }, "Plataforma")
                    FormField(maxParticipantsText, { maxParticipantsText = it.filter(Char::isDigit) }, if (tournament.teamSize > 1) "Máximo de equipos" else "Maximo de participantes")
                    SegmentedChoiceRow("Modo de bracket", if (tournament.teamSize > 1) listOf("STANDARD" to "Estándar por equipos") else listOf("STANDARD" to "Estandar", "MKART" to "MKART", "FORTNITE" to "Fortnite"), bracketMode) { bracketMode = it }
                    if (bracketMode == "FORTNITE") {
                        FortniteConfiguration(fortniteLobbySize, fortniteGamesPerRound) { size, games -> fortniteLobbySize = size; fortniteGamesPerRound = games }
                        Text("Los puestos y las partidas se pueden cambiar antes de sortear los grupos.")
                    }
                    if (bracketMode != "FORTNITE") {
                    SegmentedChoiceRow("Formato", listOf("SINGLE_ELIMINATION" to "Elim. simple", "DOUBLE_ELIMINATION" to "Doble elim."), format) { format = it }
                    if (bracketMode == "MKART") {
                        SegmentedChoiceRow("Bracket principal", listOf("1" to "MKART pasa 1", "2" to "MKART pasa 2"), mkartAdvanceMode) { mkartAdvanceMode = it }
                        if (format == "DOUBLE_ELIMINATION") {
                            SegmentedChoiceRow("Bracket de repesca", listOf("1" to "MKART pasa 1", "2" to "MKART pasa 2"), mkartLosersAdvanceMode) { mkartLosersAdvanceMode = it }
                        }
                    } else if (format == "DOUBLE_ELIMINATION") {
                        SegmentedChoiceRow("Serie winners", listOf("1" to "Bo1", "3" to "Bo3", "5" to "Bo5"), winnersBestOfText) { winnersBestOfText = it }
                        SegmentedChoiceRow("Serie losers", listOf("1" to "Bo1", "3" to "Bo3", "5" to "Bo5"), losersBestOfText) { losersBestOfText = it }
                    } else {
                        SegmentedChoiceRow("Serie", listOf("1" to "Bo1", "3" to "Bo3", "5" to "Bo5"), winnersBestOfText) { winnersBestOfText = it }
                    }
                    SegmentedChoiceRow("Seeding", listOf("MANUAL" to "Manual", "RANDOM" to "Aleatorio"), seedingMethod) { seedingMethod = it }
                    }
                    FormField(callTimeoutText, { callTimeoutText = it.filter(Char::isDigit) }, "Minutos para llamada")
                    FormField(setupCountText, { setupCountText = it.filter(Char::isDigit) }, "Numero de setups")
                    SegmentedChoiceRow("Stream", listOf("0" to "Sin stream", "1" to "1 stream", "2" to "2 streams"), streamCountText) { streamCountText = it }
                    Button(onClick = { onSaveSetups(setupCountText.toIntOrNull() ?: tournament.setupCount, streamCountText.toIntOrNull() ?: 0) }) { Text("Guardar setups y stream") }
                    FormField(playAreaName, { playAreaName = it.take(80) }, "Zona de juego (opcional)")
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = {
                        val winners = winnersBestOfText.toIntOrNull() ?: tournament.winnersBestOf
                        onSaveSettings(
                            CreateTournamentInput(
                                title = title,
                                gameTitle = gameTitle,
                                description = description,
                                platform = platform,
                                maxParticipants = maxParticipantsText.toIntOrNull() ?: tournament.maxParticipants,
                                format = format,
                                bracketMode = bracketMode,
                                fortniteLobbySize = fortniteLobbySize, fortniteGamesPerRound = fortniteGamesPerRound,
                                mkartAdvanceCount = mkartAdvanceMode.toIntOrNull() ?: tournament.mkartAdvanceCount,
                                mkartLosersAdvanceCount = if (format == "DOUBLE_ELIMINATION") {
                                    mkartLosersAdvanceMode.toIntOrNull() ?: tournament.mkartLosersAdvanceCount
                                } else {
                                    mkartAdvanceMode.toIntOrNull() ?: tournament.mkartAdvanceCount
                                },
                                bestOf = winners,
                                winnersBestOf = winners,
                                losersBestOf = losersBestOfText.toIntOrNull() ?: winners,
                                seedingMethod = seedingMethod,
                                callTimeoutMinutes = callTimeoutText.toIntOrNull() ?: tournament.callTimeoutMinutes,
                                setupCount = setupCountText.toIntOrNull() ?: tournament.setupCount,
                                streamCount = streamCountText.toIntOrNull() ?: 0,
                                playAreaName = playAreaName.trim().takeIf { it.isNotEmpty() }
                            )
                        )
                    }) { Text("Guardar ajustes") }
                }
            }
        }
        if (!tournament.isStartggMirrored) {
            CardSection {
            TournamentReviewAnchor("PARTICIPANTS", reviewAnchors)
                CollapsibleHeader(if (tournament.teamSize > 1) "Equipos y seeds" else "Jugadores inscritos", showParticipants) { showParticipants = !showParticipants }
                if (showParticipants) {
                    Text(if (canChangeEntrants) "Cambiar inscritos o seeds requiere generar de nuevo la bracket preparada." else "Los inscritos y seeds están cerrados. Reinicia el torneo para cambiarlos.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val addParticipant: () -> Unit = {
                        val name = newParticipantName.trim()
                        if (canChangeEntrants && name.isNotEmpty() && (tournament.teamSize == 1 || tournament.matches.isEmpty())) {
                            onAddParticipant(name)
                            newParticipantName = ""
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = newParticipantName,
                            onValueChange = { newParticipantName = it },
                            label = { Text(if (tournament.teamSize > 1) "Nuevo equipo" else "Nuevo jugador") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { addParticipant() }),
                            modifier = Modifier.weight(1f)
                        )
                        Button(onClick = addParticipant, enabled = canChangeEntrants && newParticipantName.isNotBlank() && (tournament.teamSize == 1 || tournament.matches.isEmpty())) { Text("Anadir") }
                    }
                    Spacer(Modifier.height(12.dp))
                    if (tournament.participants.isEmpty()) Text("Todavía no hay inscripciones.") else tournament.participants.forEach { participant ->
                        EditableParticipantRow(
                            participant = participant,
                            canChangeSeed = canChangeEntrants,
                            canRename = tournament.bracketMode != "FORTNITE" || canChangeEntrants,
                            onSave = { displayName, seed -> onUpdateParticipant(participant.id, displayName, seed) },
                            onDelete = { onDeleteParticipant(participant.id) }
                        )
                    }
                }
            }
        }
        CardSection {
            TournamentReviewAnchor("BRACKET", reviewAnchors)
            CollapsibleHeader(if (tournament.bracketMode == "FORTNITE") "Fortnite: consulta los grupos en su panel" else "Bracket del torneo", showBracket) { showBracket = !showBracket }
            if (showBracket && tournament.bracketMode != "FORTNITE") {
                Spacer(Modifier.height(12.dp))
                if (tournament.matches.isEmpty()) {
                    Text(
                        if (tournament.isStartggMirrored) {
                            "Todavia no hay bracket importada. Usa Reimportar bracket para volver a cargarla."
                        } else {
                            "Genera la bracket para ver la relacion entre enfrentamientos."
                        }
                    )
                } else {
                    SegmentedChoiceRow(
                        title = "Render de bracket",
                        options = listOf("CLASSIC" to "Clasica", "MODERN" to "Moderna"),
                        selected = bracketRenderMode,
                        onSelect = { bracketRenderMode = it }
                    )
                    Spacer(Modifier.height(10.dp))
                    if (bracketRenderMode == "MODERN") {
                        ModernBracketBoard(
                            matches = tournament.matches,
                            hideAutomaticAdvances = !tournament.isStartggMirrored,
                            timeoutMinutes = tournament.callTimeoutMinutes
                        )
                    } else {
                        BracketBoard(
                            tournament.matches,
                            hideAutomaticAdvances = !tournament.isStartggMirrored
                        )
                    }
                }
            }
        }
        CardSection {
            CollapsibleHeader("Setups del torneo", showSetups) { showSetups = !showSetups }
            if (showSetups) {
                Spacer(Modifier.height(12.dp))
                val setups = buildTournamentSetups(tournament)
                val occupiedSetups = setups.filter { it.occupyingMatchLabel != null }
                val freeSetups = setups.filter { it.occupyingMatchLabel == null }
                Text("Setups en uso", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                if (occupiedSetups.isEmpty()) {
                    Text("Ahora mismo no hay ninguna setup ocupada.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    occupiedSetups.forEach { setup ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.24f)),
                            border = surfaceCardBorder()
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(setup.label, fontWeight = FontWeight.SemiBold)
                                Text(
                                    "Estado: En uso\nMatch: ${setup.occupyingMatchLabel}\nSet: ${setup.occupyingParticipants}",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text("Setups libres", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                if (freeSetups.isEmpty()) {
                    Text("Todos los setups y streams están ocupados en este momento.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    freeSetups.forEach { setup ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.24f)),
                            border = surfaceCardBorder()
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(setup.label, fontWeight = FontWeight.SemiBold)
                                Text("Estado: Libre", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
        if (tournament.isStartggMirrored) {
            CardSection {
            TournamentReviewAnchor("LADDER", reviewAnchors)
                CollapsibleHeader("Ladder interna", showLadder) { showLadder = !showLadder }
                if (showLadder) {
                    Spacer(Modifier.height(12.dp))
                    DesktopLadderManagementPanel(
                        tournament = tournament,
                        onStart = onStartLadder,
                        onFinalize = onFinalizeLadder
                    )
                }
            }
        }
    }

    if (showStartggDialog) {
        StartggImportDialog(
            onDismiss = { showStartggDialog = false },
            onPreview = onPreviewStartgg,
            onImport = { eventUrl ->
                onImportStartgg(eventUrl)
                showStartggDialog = false
            }
        )
    }
}

@Composable
fun ArchivedTournamentSection(tournament: DesktopTournamentDetail, busy: Boolean, onRestore: () -> Unit) {
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(tournament.title, style = MaterialTheme.typography.headlineMedium)
        Text("Archivado · solo lectura. Está fuera del display. Desarchívalo para hacer cambios.")
        com.gestortorneos.ui.TournamentArchiveButton(true, busy, onRestore)
        TournamentActivityButton(tournament.id)
        if (tournament.bracketMode == "FORTNITE") FortnitePanelButton(tournament.id)
        else ModernBracketBoard(tournament.matches, hideAutomaticAdvances = !tournament.isStartggMirrored)
        if (tournament.teamSize > 1 && !tournament.isStartggMirrored) TeamRosterPanel(tournament.id) {}
        Text("Participantes", style = MaterialTheme.typography.titleMedium)
        tournament.participants.forEach { Text(it.displayName) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DesktopLadderManagementPanel(
    tournament: DesktopTournamentDetail,
    onStart: () -> Unit,
    onFinalize: () -> Unit
) {
    var showConsole by remember { mutableStateOf(false) }
    val ladderRepository = remember { DesktopTournamentRepository() }
    if(showConsole) com.gestortorneos.ui.LadderConsole(load={ladderRepository.ladderBoard(tournament.id)},control={ladderRepository.ladderControl(tournament.id,it)},participants=tournament.participants.map { it.id to it.displayName },onClose={showConsole=false})
    val ladder = tournament.ladder
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick={showConsole=true}) { Text("Control, ajustes y resultados") }
            Button(enabled=ladder?.session?.status != "ACTIVE",onClick = onStart) { Text("Iniciar ladder") }
            OutlinedButton(enabled=ladder?.session?.status == "ACTIVE",onClick = onFinalize) { Text("Cerrar inscripciones") }
        }

        if (ladder?.session != null) {
            Text(if(ladder.session.options?.closing == true) "Inscripciones cerradas · terminando sets" else if(ladder.session.options?.paused == true) "Ladder pausada" else "Estado: ${ladder.session.status}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            Text("La ladder no esta activa en este torneo.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        if (!ladder?.queue.isNullOrEmpty()) {
            Text("Cola", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            ladder!!.queue.forEach { entry ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.24f)),
                    border = surfaceCardBorder()
                ) {
                    Text(entry.displayName, modifier = Modifier.fillMaxWidth().padding(12.dp))
                }
            }
        }

        if (!ladder?.activeMatches.isNullOrEmpty()) {
            Text("Matches activos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            ladder!!.activeMatches.forEach { match ->
                DesktopLadderManagementMatchCard(match)
            }
        }

        if (!ladder?.standings.isNullOrEmpty()) {
            Text("Clasificacion", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            ladder!!.standings.forEachIndexed { index, standing ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.24f)),
                    border = surfaceCardBorder()
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("${index + 1}. ${standing.displayName}", fontWeight = FontWeight.SemiBold)
                        Text("${standing.wins}-${standing.losses}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun DesktopLadderManagementMatchCard(match: DesktopLadderMatchSummary) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.24f)),
        border = surfaceCardBorder()
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(match.participantsLabel, fontWeight = FontWeight.SemiBold)
            Text("Estado: ${com.gestortorneos.ui.ladderStatus(match.status)} · Bo${match.bestOf}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TournamentOperationsSection(
    tournament: DesktopTournamentDetail,
    isBusy: Boolean,
    onRefresh: () -> Unit,
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
    if (tournament.bracketMode == "FORTNITE") {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Fortnite · ${tournament.title}", style = MaterialTheme.typography.headlineSmall)
            FortnitePanelButton(tournament.id)
            OutlinedButton(onClick = onRefresh) { Text("Actualizar") }
        }
        return
    }
    var renderMode by rememberSaveable(tournament.id) { mutableStateOf("CLASSIC") }
    var selectedModernMatchId by rememberSaveable(tournament.id) { mutableStateOf<String?>(null) }
    val completedMatches = tournament.matches.filterNot { isDormantGrandFinalReset(tournament.matches, it) }.filter {
        it.status.contains("COMPLETED", true) || it.status.contains("WALKOVER", true)
    }.sortedWith(compareBy<DesktopMatchSummary>({ it.bracketStage }, { it.roundNumber }, { it.matchNumber }))
    val activeMatches = tournament.matches
        .filterNot { isDormantGrandFinalReset(tournament.matches, it) }
        .filterNot { it in completedMatches }
        .filter { hasResolvedContenders(it) }
    var operationsSearchQuery by rememberSaveable(tournament.id) { mutableStateOf("") }
    var completedSearchQuery by rememberSaveable(tournament.id) { mutableStateOf("") }
    val filteredActiveMatches = activeMatches.filter { matchMatchesPlayerQuery(it, operationsSearchQuery) }
    val activeSections = buildDesktopMatchSections(filteredActiveMatches, forCompleted = false)
    val hasConcurrentPools = activeSections.size > 1
    val tournamentStarted = (tournament.isStartggMirrored || isTournamentStarted(tournament.status)) && tournament.status != "IMPORTANDO"
    var completedExpanded by rememberSaveable(tournament.id) { mutableStateOf(false) }
    val expandedPools = remember(tournament.id) { mutableStateMapOf<String, Boolean>() }
    val expandedCompletedSections = remember(tournament.id) { mutableStateMapOf<String, Boolean>() }
    val stationInputs = remember(tournament.id) { mutableStateMapOf<String, String>() }
    val filteredCompletedMatches = completedMatches.filter { matchMatchesPlayerQuery(it, completedSearchQuery) }
    val completedSections = buildDesktopMatchSections(filteredCompletedMatches, forCompleted = true)
    val selectableModernMatchIds = remember(tournament.id, tournament.matches, tournamentStarted) {
        tournament.matches
            .filterNot { isDormantGrandFinalReset(tournament.matches, it) }
            .filter { isDesktopOperationalMatch(it, tournamentStarted) }
            .mapTo(linkedSetOf()) { it.id }
    }
    val selectedModernMatch = selectedModernMatchId?.let { selectedId ->
        tournament.matches.firstOrNull { it.id == selectedId }
            ?.takeIf { it.id in selectableModernMatchIds }
    }

    LaunchedEffect(selectedModernMatchId, selectableModernMatchIds) {
        if (selectedModernMatchId != null && selectedModernMatch == null) {
            selectedModernMatchId = null
        }
    }

    val operationsContent: @Composable () -> Unit = {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        CardSection {
            Text("Operativa de ${tournament.title}", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            TournamentActivityButton(tournament.id)
            tournament.importProgress?.let { Text(it) }
            Text("Llama matches, marca inicio y resuelve resultados sin mezclar torneos.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (!tournamentStarted) {
                Text("Primero inicia el torneo desde la seccion Torneos para habilitar la operativa.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onRefresh) { Text("Refrescar") }
            Spacer(Modifier.height(8.dp))
            SegmentedChoiceRow(
                title = "Render de operativa",
                options = listOf("CLASSIC" to "Clasica", "MODERN" to "Moderna"),
                selected = renderMode,
                onSelect = { renderMode = it }
            )
            if (renderMode == "CLASSIC") {
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = operationsSearchQuery,
                    onValueChange = { operationsSearchQuery = it },
                    label = { Text("Buscar jugador en operativa") },
                    modifier = Modifier.fillMaxWidth()
                )
            } else {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Toca solo los matches operables para abrir acciones. Los estados CALLED y PLAYING se resaltan con temporizador.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        if (adaptiveManagementPresentation && renderMode == "CLASSIC") {
            CardSection {
                CollapsibleHeader("Completadas (${completedMatches.size})", completedExpanded) { completedExpanded = !completedExpanded }
                val rows = if (completedExpanded) completedMatches.filter { matchMatchesPlayerQuery(it, operationsSearchQuery) } else filteredActiveMatches
                if (rows.isEmpty()) Text("No hay matches que coincidan con esta búsqueda.")
                rows.forEach { match -> key(match.id) {
                    CompactMatchRow(match.poolAwareLabel, match.participantNames, match.scores, match.status, match.stationLabel,
                        selectedModernMatchId == match.id) { selectedModernMatchId = match.id }
                } }
            }
        } else if (renderMode == "CLASSIC") {
            CardSection {
                Text("Matches pendientes", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                if (filteredActiveMatches.isEmpty()) {
                    Text("No hay matches pendientes que coincidan con esa busqueda.")
                } else if (hasConcurrentPools) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        activeSections.forEach { section ->
                            val expanded = expandedPools[section.key] ?: false
                            CollapsibleHeader("${section.label} (${section.matches.size})", expanded) { expandedPools[section.key] = !expanded }
                            if (expanded) {
                                section.matches.forEach { match ->
                                    MatchRow(
                                        match = match,
                                        gameTitle = tournament.game,
                                        timeoutMinutes = tournament.callTimeoutMinutes,
                                        stationValue = stationInputs[match.id].orEmpty(),
                                        availableSetups = availableSetupLabelsForMatch(tournament, match),
                                        enabled = tournamentStarted && !isBusy,
                                        isStartggMirrored = tournament.isStartggMirrored,
                                        onStationChange = { stationInputs[match.id] = it },
                                        onCall = { onCallMatch(match.id, stationInputs[match.id].orEmpty().ifBlank { null }) },
                                        onCancelCall = { onCancelCall(match.id) },
                                        onStart = { onStartMatch(match.id) },
                                        supportsCharacterReporting = tournament.supportsSmashCharacterReporting,
                                        onSaveCharacters = { selections -> onSaveCharacters(match.id, selections) },
                                        onSaveCharactersAndRecordGameWin = { participantId, selections -> onSaveCharactersAndRecordGameWin(match.id, participantId, selections) },
                                        onSaveCharactersAndReportWinner = { participantId, selections -> onSaveCharactersAndReportWinner(match.id, participantId, selections) },
                                        onReportDetailedResult = { bestOfOverride, games, onComplete -> onReportDetailedResult(match.id, bestOfOverride, games, onComplete) },
                                        onRecordGameWin = { participantId -> onRecordGameWin(match.id, participantId) },
                                        onReportWinner = { participantId -> onReportWinner(match.id, participantId) },
                                        onSelectAdvancer = { participantId -> onSelectAdvancer(match.id, participantId) },
                                        onResolveAbsence = { outcome -> onResolveAbsence(match.id, outcome) },
                                        onResetMatch = { onResetMatch(match.id) }
                                    )
                                }
                            }
                        }
                    }
                } else activeSections.firstOrNull()?.matches?.forEach { match ->
                    MatchRow(
                        match = match,
                        gameTitle = tournament.game,
                        timeoutMinutes = tournament.callTimeoutMinutes,
                        stationValue = stationInputs[match.id].orEmpty(),
                        availableSetups = availableSetupLabelsForMatch(tournament, match),
                        enabled = tournamentStarted && !isBusy,
                        isStartggMirrored = tournament.isStartggMirrored,
                        onStationChange = { stationInputs[match.id] = it },
                        onCall = { onCallMatch(match.id, stationInputs[match.id].orEmpty().ifBlank { null }) },
                        onCancelCall = { onCancelCall(match.id) },
                        onStart = { onStartMatch(match.id) },
                        supportsCharacterReporting = tournament.supportsSmashCharacterReporting,
                        onSaveCharacters = { selections -> onSaveCharacters(match.id, selections) },
                        onSaveCharactersAndRecordGameWin = { participantId, selections -> onSaveCharactersAndRecordGameWin(match.id, participantId, selections) },
                        onSaveCharactersAndReportWinner = { participantId, selections -> onSaveCharactersAndReportWinner(match.id, participantId, selections) },
                        onReportDetailedResult = { bestOfOverride, games, onComplete -> onReportDetailedResult(match.id, bestOfOverride, games, onComplete) },
                        onRecordGameWin = { participantId -> onRecordGameWin(match.id, participantId) },
                        onReportWinner = { participantId -> onReportWinner(match.id, participantId) },
                        onSelectAdvancer = { participantId -> onSelectAdvancer(match.id, participantId) },
                        onResolveAbsence = { outcome -> onResolveAbsence(match.id, outcome) },
                        onResetMatch = { onResetMatch(match.id) }
                    )
                }
            }
            if (completedMatches.isNotEmpty()) {
                CardSection {
                    CollapsibleHeader("Partidas completadas (${completedMatches.size})", completedExpanded) { completedExpanded = !completedExpanded }
                    if (completedExpanded) {
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = completedSearchQuery,
                            onValueChange = { completedSearchQuery = it },
                            label = { Text("Buscar partida completada") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(8.dp))
                        if (completedSections.isEmpty()) {
                            Text("No hay partidas completadas que coincidan con esa busqueda.")
                        } else {
                            completedSections.forEach { section ->
                                val expanded = expandedCompletedSections[section.key] ?: false
                                CollapsibleHeader("${section.label} (${section.matches.size})", expanded) {
                                    expandedCompletedSections[section.key] = !expanded
                                }
                                if (expanded) {
                                    section.matches.forEach { match ->
                                        MatchRow(
                                            match = match,
                                            gameTitle = tournament.game,
                                            timeoutMinutes = tournament.callTimeoutMinutes,
                                            stationValue = "",
                                            availableSetups = availableSetupLabelsForMatch(tournament, match),
                                            enabled = tournamentStarted && !isBusy,
                                            isStartggMirrored = tournament.isStartggMirrored,
                                            onStationChange = {},
                                            onCall = {},
                                            onCancelCall = {},
                                            onStart = {},
                                            supportsCharacterReporting = tournament.supportsSmashCharacterReporting,
                                            onSaveCharacters = { selections -> onSaveCharacters(match.id, selections) },
                                            onSaveCharactersAndRecordGameWin = { participantId, selections -> onSaveCharactersAndRecordGameWin(match.id, participantId, selections) },
                                            onSaveCharactersAndReportWinner = { participantId, selections -> onSaveCharactersAndReportWinner(match.id, participantId, selections) },
                                            onReportDetailedResult = { bestOfOverride, games, onComplete -> onReportDetailedResult(match.id, bestOfOverride, games, onComplete) },
                                            onRecordGameWin = {},
                                            onReportWinner = { participantId -> onReportWinner(match.id, participantId) },
                                            onSelectAdvancer = {},
                                            onResolveAbsence = { outcome -> onResolveAbsence(match.id, outcome) },
                                            onResetMatch = { onResetMatch(match.id) }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else {
            CardSection {
                Text("Bracket operativa", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                if (tournament.matches.isEmpty()) {
                    Text("Todavia no hay bracket para este torneo.")
                } else {
                    ModernBracketBoard(
                        matches = tournament.matches,
                        hideAutomaticAdvances = !tournament.isStartggMirrored,
                        selectableMatchIds = selectableModernMatchIds,
                        showOperationalState = true,
                        timeoutMinutes = tournament.callTimeoutMinutes,
                        onMatchSelected = { selectedModernMatchId = it.id }
                    )
                }
            }
        }
    }

    }
    AdaptiveMatchLayout(selectedModernMatch != null, forceDialog = LocalBracketFullscreen.current?.owner != null, content = operationsContent, actions = { inline ->
    if (selectedModernMatch != null) {
        DesktopModernMatchActionsDialog(
            inline = inline,
            tournament = tournament,
            match = selectedModernMatch,
            stationValue = stationInputs[selectedModernMatch.id].orEmpty(),
            availableSetups = availableSetupLabelsForMatch(tournament, selectedModernMatch),
            enabled = tournamentStarted && !isBusy,
            onStationChange = { stationInputs[selectedModernMatch.id] = it },
            onDismiss = { selectedModernMatchId = null },
            onCall = { onCallMatch(selectedModernMatch.id, stationInputs[selectedModernMatch.id].orEmpty().ifBlank { null }) },
            onCancelCall = { onCancelCall(selectedModernMatch.id) },
            onStart = { onStartMatch(selectedModernMatch.id) },
            onSaveCharacters = { selections -> onSaveCharacters(selectedModernMatch.id, selections) },
            onSaveCharactersAndRecordGameWin = { participantId, selections -> onSaveCharactersAndRecordGameWin(selectedModernMatch.id, participantId, selections) },
            onSaveCharactersAndReportWinner = { participantId, selections -> onSaveCharactersAndReportWinner(selectedModernMatch.id, participantId, selections) },
            onReportDetailedResult = { bestOfOverride, games, onComplete -> onReportDetailedResult(selectedModernMatch.id, bestOfOverride, games, onComplete) },
            onRecordGameWin = { participantId -> onRecordGameWin(selectedModernMatch.id, participantId) },
            onReportWinner = { participantId -> onReportWinner(selectedModernMatch.id, participantId) },
            onSelectAdvancer = { participantId -> onSelectAdvancer(selectedModernMatch.id, participantId) },
            onResolveAbsence = { outcome -> onResolveAbsence(selectedModernMatch.id, outcome) },
            onResetMatch = { onResetMatch(selectedModernMatch.id) }
        )
    }
    })
}

@Composable
private fun EditableParticipantRow(participant: DesktopParticipantSummary, canChangeSeed: Boolean, canRename: Boolean, onSave: (String, Int?) -> Unit, onDelete: () -> Unit) {
    var displayName by remember(participant.id, participant.displayName) { mutableStateOf(participant.displayName) }
    var seedText by remember(participant.id, participant.seed) { mutableStateOf(participant.seed?.toString().orEmpty()) }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)), border = surfaceCardBorder()) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FormField(displayName, { displayName = it }, "Jugador")
            if (canChangeSeed) FormField(seedText, { seedText = it }, "Seed") else Text("Seed: ${participant.seed ?: "Sin asignar"}")
            Text(participant.status, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onDelete, enabled = canChangeSeed) { Text("Borrar") }
                Button(onClick = { onSave(displayName.trim(), if (canChangeSeed) seedText.trim().toIntOrNull() else participant.seed) }, enabled = canRename && displayName.isNotBlank() && (!canChangeSeed || com.gestortorneos.ui.isValidParticipantSeed(seedText))) { Text("Guardar") }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MatchRow(
    match: DesktopMatchSummary,
    gameTitle: String,
    timeoutMinutes: Int,
    stationValue: String,
    availableSetups: List<String>,
    enabled: Boolean,
    isStartggMirrored: Boolean,
    onStationChange: (String) -> Unit,
    onCall: () -> Unit,
    onCancelCall: () -> Unit,
    onStart: () -> Unit,
    supportsCharacterReporting: Boolean,
    onSaveCharacters: (List<Pair<String, String>>) -> Unit,
    onSaveCharactersAndRecordGameWin: (String, List<Pair<String, String>>) -> Unit,
    onSaveCharactersAndReportWinner: (String, List<Pair<String, String>>) -> Unit,
    onReportDetailedResult: (Int?, List<DesktopDetailedReportedGame>, (String?) -> Unit) -> Unit,
    onRecordGameWin: (String) -> Unit,
    onReportWinner: (String) -> Unit,
    onSelectAdvancer: (String) -> Unit,
    onResolveAbsence: (String) -> Unit,
    onResetMatch: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val isMarioKart = match.bracketMode == "MKART" || match.participantNames.size > 2 || match.advancersRequired > 1
    val isWalkover = match.status == "WALKOVER"
    val called = !match.calledAt.isNullOrBlank()
    val started = !match.startedAt.isNullOrBlank() || match.status == "PLAYING"
    val completed = match.status == "COMPLETED" || match.status == "WALKOVER"
    var showCharactersDialog by rememberSaveable(match.id) { mutableStateOf(false) }
    var showQuickReportDialog by rememberSaveable(match.id) { mutableStateOf(false) }
    var quickReportRevision by remember(match.id) { mutableStateOf<String?>(null) }
    var quickReportSaving by remember(match.id) { mutableStateOf(false) }
    var quickReportError by remember(match.id) { mutableStateOf<String?>(null) }
    var showQuickReportModeDialog by rememberSaveable(match.id) { mutableStateOf(false) }
    var pendingCharacterAction by remember(match.id) { mutableStateOf<(() -> Unit)?>(null) }
    var characterOne by remember(match.id) { mutableStateOf("") }
    var characterTwo by remember(match.id) { mutableStateOf("") }
    var quickReportPresetCharacterOne by remember(match.id) { mutableStateOf("") }
    var quickReportPresetCharacterTwo by remember(match.id) { mutableStateOf("") }
    var quickReportSelectedScore by remember(match.id) { mutableStateOf<String?>(null) }
    var quickReportGames by remember(match.id) { mutableStateOf<List<DesktopQuickReportGameDraft>>(emptyList()) }
    var quickReportBestOfOverride by rememberSaveable(match.id) { mutableStateOf<Int?>(null) }
    var setupMenuExpanded by rememberSaveable(match.id) { mutableStateOf(false) }
    LaunchedEffect(match.id, match.characterSelections, match.participantIds) {
        characterOne = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(0) }?.characterName ?: ""
        characterTwo = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(1) }?.characterName ?: ""
    }
    val contendersReady = match.participantIds.size >= 2
        && match.participantNames.size >= 2
        && match.participantIds.all { it.isNotBlank() && !isPlaceholderParticipantId(it) }
    val nowMillis by produceState(initialValue = System.currentTimeMillis()) {
        while (true) {
            delay(1000)
            value = System.currentTimeMillis()
        }
    }
    val remainingSeconds = computeRemainingSeconds(match.calledAt, timeoutMinutes, nowMillis)
    val timerExpired = called && !started && remainingSeconds <= 0
    val hasReportedGames = match.scores.any { it > 0 }
    val canResetMirroredPartialSet = isStartggMirrored
        && contendersReady
        && enabled
        && (hasReportedGames || completed)
    val canQuickReport = contendersReady
        && match.status != "CANCELLED"
        && enabled
        && !isMarioKart
    val isReportedMirroredSet = isStartggMirrored && (match.status == "COMPLETED" || match.status == "WALKOVER")
    val canResolveAbsence = match.participantIds.size == 2
        && match.status != "CANCELLED" && contendersReady
        && enabled

    val canPinnedReport = enabled && contendersReady && !isMarioKart && match.status != "CANCELLED"
    PublishMatchPrimaryAction(if (completed) "Corregir resultado" else "Anotar resultado", canPinnedReport) {
        if (canPinnedReport) {
                        quickReportPresetCharacterOne = desktopLatestCharacterForParticipant(match, match.participantIds.getOrNull(0).orEmpty()) ?: ""
                        quickReportPresetCharacterTwo = desktopLatestCharacterForParticipant(match, match.participantIds.getOrNull(1).orEmpty()) ?: ""
                        quickReportGames = currentDesktopQuickReportGames(match)
                        quickReportSelectedScore = null
                        quickReportBestOfOverride = match.reportedBestOf
                        showQuickReportModeDialog = true
        }
    }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.24f)), border = surfaceCardBorder()) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(match.poolAwareLabel, fontWeight = FontWeight.Bold)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { MainStatusBadge(mainStatusLabel(match.status), match.status); Text("Bo${match.effectiveBestOf}", Modifier.padding(vertical = 6.dp)) }
            if (match.stationLabel != null) Text("Estacion ${match.stationLabel}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (called && !started && !completed) {
                Text("Timer de llamada: ${formatTimer(remainingSeconds)}", color = if (timerExpired) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }
            MatchSyncFeedback(match.tournamentId, match.id, match.syncStatus, enabled)
            if (supportsCharacterReporting && contendersReady && match.participantIds.size >= 2) {
                val firstCharacter = desktopLatestCharacterForParticipant(match, match.participantIds[0])
                val secondCharacter = desktopLatestCharacterForParticipant(match, match.participantIds[1])
                Text(
                    "Personajes: ${match.participantNames[0]} ${firstCharacter ?: "sin elegir"} · ${match.participantNames[1]} ${secondCharacter ?: "sin elegir"}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedButton(
                    onClick = {
                        characterOne = firstCharacter ?: ""
                        characterTwo = secondCharacter ?: ""
                        showCharactersDialog = true
                    },
                    enabled = enabled && contendersReady
                ) {
                    Text("Elegir personajes")
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Box {
                    OutlinedButton(
                        onClick = { setupMenuExpanded = true },
                        enabled = enabled && contendersReady && !called && !completed && availableSetups.isNotEmpty(),
                        modifier = Modifier.widthIn(min = 180.dp)
                    ) {
                        Text(stationValue.ifBlank { "Seleccionar destino" })
                    }
                    DropdownMenu(
                        expanded = setupMenuExpanded,
                        onDismissRequest = { setupMenuExpanded = false }
                    ) {
                        availableSetups.forEach { setupLabel ->
                            DropdownMenuItem(
                                text = { Text(setupLabel) },
                                onClick = {
                                    onStationChange(setupLabel)
                                    setupMenuExpanded = false
                                }
                            )
                        }
                    }
                }
                Button(onClick = onCall, enabled = enabled && contendersReady && !called && !completed && stationValue.isNotBlank()) { Text("Llamar") }
                Button(onClick = onStart, enabled = enabled && contendersReady && called && !started && !completed) { Text("Iniciar partida") }
                OutlinedButton(onClick = onCancelCall, enabled = enabled && contendersReady && called && !started && !completed) { Text("Cancelar") }
                if (canResetMirroredPartialSet || (!isStartggMirrored && (match.status == "COMPLETED" || match.status == "WALKOVER" || match.status == "PLAYING"))) {
                    MainDangerButton("Reiniciar set", enabled = enabled && contendersReady, onClick = onResetMatch)
                }
            }
            if (enabled && contendersReady && !called && !completed && availableSetups.isEmpty()) {
                Text(
                    "No hay destinos libres. Espera a que termine otro match o añade setups o streams en las opciones del torneo.",
                    color = MainPalette.warning
                )
            }
            match.participants.forEachIndexed { index, participant ->
                val participantId = match.participantIds.getOrElse(index) { "" }
                val advanced = if (isMarioKart) match.advancingParticipantIds.contains(participantId) else participantId == match.winnerParticipantId
                val eliminated = completed && participantId.isNotBlank() && !advanced
                val score = match.scores.getOrElse(index) { 0 }
                val lastCharacter = desktopLatestCharacterForParticipant(match, participantId)
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = when {
                            advanced -> MainPalette.successContainer
                            eliminated -> MaterialTheme.colorScheme.errorContainer
                            else -> MaterialTheme.colorScheme.surface
                        }
                    ),
                    border = surfaceCardBorder()
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(participant.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            if (!isWalkover && !lastCharacter.isNullOrBlank()) {
                                SmashCharacterInlineLabel(
                                    name = lastCharacter,
                                    gameTitle = gameTitle,
                                    iconSize = 20.dp,
                                    textColor = MaterialTheme.colorScheme.onSurface
                                )
                            }
                            Text(
                                if (isMarioKart) {
                                    when {
                                        advanced -> "Clasificado"
                                        eliminated -> "Eliminado"
                                        else -> "Pendiente"
                                    }
                                } else {
                                    desktopPlayerMatchScoreLabel(isWalkover, eliminated, score)
                                },
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        if (!isMarioKart) Text(desktopPlayerMatchScoreLabel(isWalkover, eliminated, score), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.width(8.dp))
                        if (isMarioKart) {
                            OutlinedButton(onClick = { onSelectAdvancer(participant.id) }, enabled = enabled && contendersReady && started && !completed) {
                                Text(if (advanced) "Pasa" else "Clasificar")
                            }
                        } else {
                            Button(
                                onClick = {
                                    if (supportsCharacterReporting && match.participantIds.size >= 2) {
                                        characterOne = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(0) }?.characterName ?: ""
                                        characterTwo = match.characterSelections.firstOrNull { it.participantId == match.participantIds.getOrNull(1) }?.characterName ?: ""
                                        pendingCharacterAction = {
                                            onSaveCharactersAndRecordGameWin(
                                                participant.id,
                                                listOf(
                                                    match.participantIds[0] to characterOne.trim(),
                                                    match.participantIds[1] to characterTwo.trim()
                                                )
                                            )
                                        }
                                        showCharactersDialog = true
                                    } else {
                                        onRecordGameWin(participant.id)
                                    }
                                },
                                enabled = enabled && contendersReady && started && !completed && match.status != "CANCELLED"
                            ) { Text("Suma juego") }
                        }
                    }
                }
            }
            if (!contendersReady) {
                Text(
                    "Pendiente de resolver enfrentamientos anteriores para definir contendientes.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (called && !started && !completed) {
                Text(
                    if (timerExpired) {
                        if (isStartggMirrored) {
                            "El tiempo se agoto. Puedes hacer DQ desde aqui o seguir con el match."
                        } else {
                            "El tiempo se agoto. Resuelve la ausencia o confirma que el match empezo."
                        }
                    } else {
                        "Primero marca que el match ha comenzado para habilitar el conteo."
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (canQuickReport && !completed) {
                Button(
                    onClick = {
                        quickReportPresetCharacterOne = desktopLatestCharacterForParticipant(match, match.participantIds.getOrNull(0).orEmpty()) ?: ""
                        quickReportPresetCharacterTwo = desktopLatestCharacterForParticipant(match, match.participantIds.getOrNull(1).orEmpty()) ?: ""
                        quickReportGames = currentDesktopQuickReportGames(match)
                        quickReportSelectedScore = null
                        quickReportBestOfOverride = match.reportedBestOf
                        showQuickReportModeDialog = true
                    }
                ) {
                    Text("Anotacion rapida")
                }
            }
            if (completed && canQuickReport) {
                Button(
                    onClick = {
                        quickReportPresetCharacterOne = desktopLatestCharacterForParticipant(match, match.participantIds.getOrNull(0).orEmpty()) ?: ""
                        quickReportPresetCharacterTwo = desktopLatestCharacterForParticipant(match, match.participantIds.getOrNull(1).orEmpty()) ?: ""
                        quickReportGames = currentDesktopQuickReportGames(match)
                        quickReportSelectedScore = null
                        quickReportBestOfOverride = match.reportedBestOf
                        showQuickReportModeDialog = true
                    }
                ) {
                    Text("Corregir resultado")
                }
            }
            if (enabled && contendersReady && called && !started && !completed && !isStartggMirrored && timerExpired && match.participantIds.size == 2) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onResolveAbsence("NONE_PRESENT") }) { Text("Ninguno") }
                    OutlinedButton(onClick = { onResolveAbsence("SLOT_1_ABSENT") }) { Text("Falta ${match.participantNames[0]}") }
                    OutlinedButton(onClick = { onResolveAbsence("SLOT_2_ABSENT") }) { Text("Falta ${match.participantNames[1]}") }
                }
            }
            if (canResolveAbsence) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Text("Incidencias", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    MainDangerButton("DQ ${match.participantNames.getOrElse(0) { "slot 1" }}", onClick = { onResolveAbsence("SLOT_1_ABSENT") })
                    MainDangerButton("DQ ${match.participantNames.getOrElse(1) { "slot 2" }}", onClick = { onResolveAbsence("SLOT_2_ABSENT") })
                }
            }
            if (enabled && contendersReady && !isMarioKart && completed && match.participantIds.size >= 2 && match.participantNames.size >= 2 && !isStartggMirrored) {
                Text("Corregir resultado completo", color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                        }
                    ) { Text("Gana ${match.participantNames[0]}") }
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
                        }
                    ) { Text("Gana ${match.participantNames[1]}") }
                }
            }
            if (isReportedMirroredSet) {
                Text(
                    "Puedes corregir este set desde la app. Si cambias ganador, DQ o resultado, los sets dependientes se reajustaran.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (match.winnerName != null) {
                Text("Ganador del match: ${match.winnerName}", color = MainPalette.success, fontWeight = FontWeight.Bold)
            } else if (match.advancingParticipantIds.isNotEmpty()) {
                val advancers = match.participants.filter { match.advancingParticipantIds.contains(it.id) }.joinToString { it.name }
                Text("Clasificados: $advancers", color = MainPalette.success, fontWeight = FontWeight.Bold)
            }
        }
    }

    if (showCharactersDialog && supportsCharacterReporting && match.participantIds.size >= 2 && match.participantNames.size >= 2) {
        CharacterSelectionDialog(
            characterCount = match.entrantSize,
            gameTitle = gameTitle,
            firstPlayerName = match.participantNames[0],
            secondPlayerName = match.participantNames[1],
            firstCharacter = characterOne,
            secondCharacter = characterTwo,
            onFirstCharacterChange = { characterOne = it },
            onSecondCharacterChange = { characterTwo = it },
            onDismiss = { showCharactersDialog = false },
            onConfirm = {
                val selections = listOf(
                    match.participantIds[0] to characterOne.trim(),
                    match.participantIds[1] to characterTwo.trim()
                )
                val pending = pendingCharacterAction
                pendingCharacterAction = null
                showCharactersDialog = false
                if (pending != null) {
                    pending()
                } else {
                    scope.launch {
                        onSaveCharacters(selections)
                    }
                }
            }
        )
    }

    if (showQuickReportModeDialog) {
        DesktopQuickReportBestOfDialog(
            defaultBestOf = match.effectiveBestOf,
            selectedOverride = quickReportBestOfOverride,
            onDismiss = { showQuickReportModeDialog = false },
            onConfirm = { bestOfOverride ->
                quickReportBestOfOverride = bestOfOverride
                showQuickReportModeDialog = false
                quickReportRevision = match.operationRevision; showQuickReportDialog = true
            }
        )
    }

    if (showQuickReportDialog && match.participantIds.size >= 2 && match.participantNames.size >= 2) {
        DesktopQuickReportResultDialog(
            match = match,
            isSaving = quickReportSaving,
            errorMessage = quickReportError,
            gameTitle = gameTitle,
            effectiveBestOf = quickReportBestOfOverride ?: match.effectiveBestOf,
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
                        DesktopDetailedReportedGame(
                            expectedRevision = quickReportRevision,
                            winnerParticipantId = game.winnerParticipantId,
                            selections = if (supportsCharacterReporting) {
                                listOf(
                                    match.participantIds[0] to game.firstCharacter,
                                    match.participantIds[1] to game.secondCharacter,
                                )
                            } else {
                                emptyList()
                            }
                        )
                    }
                ) { error ->
                    quickReportSaving = false
                    quickReportError = error
                    if (error == null) showQuickReportDialog = false
                }
            }
        )
    }
}

@Composable
private fun CharacterSelectionDialog(
    characterCount: Int = 1,
    gameTitle: String,
    firstPlayerName: String,
    secondPlayerName: String,
    firstCharacter: String,
    secondCharacter: String,
    onFirstCharacterChange: (String) -> Unit,
    onSecondCharacterChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    DialogWindow(
        onCloseRequest = onDismiss,
        title = "Personajes del set",
        resizable = true,
        state = rememberDialogState(size = DpSize(720.dp, 680.dp))
    ) {
        Surface(color = MaterialTheme.colorScheme.surface) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp)
                    .widthIn(max = 720.dp).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("Personajes del set", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(
                    "Selecciona el personaje de ${characterGameLabel(gameTitle)} para cada jugador. Puedes filtrar escribiendo.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = true)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    FilterableCharacterSelector(
                        characterCount = characterCount,
                        gameTitle = gameTitle,
                        label = firstPlayerName,
                        selectedCharacter = firstCharacter,
                        onCharacterSelected = onFirstCharacterChange
                    )
                    FilterableCharacterSelector(
                        characterCount = characterCount,
                        gameTitle = gameTitle,
                        label = secondPlayerName,
                        selectedCharacter = secondCharacter,
                        onCharacterSelected = onSecondCharacterChange
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    OutlinedButton(onClick = onDismiss) { Text("Cancelar") }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = onConfirm,
                        enabled = listOf(firstCharacter, secondCharacter).all { value -> value.split("/").size == characterCount && value.split("/").all { it.isNotBlank() } }
                    ) {
                        Text("Guardar")
                    }
                }
            }
        }
    }
}

@Composable
private fun FilterableCharacterSelector(
    characterCount: Int = 1,
    gameTitle: String,
    label: String,
    selectedCharacter: String,
    onCharacterSelected: (String) -> Unit
) {
    if (characterCount > 1) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(characterCount) { index ->
                val picks = selectedCharacter.split(" / ").toMutableList()
                while (picks.size < characterCount) picks.add("")
                FilterableCharacterSelector(gameTitle = gameTitle, label = label + " · Jugador " + (index + 1), selectedCharacter = picks[index], onCharacterSelected = { chosen ->
                    picks[index] = chosen
                    onCharacterSelected(picks.joinToString(" / "))
                })
            }
        }
        return
    }
    var filterText by remember(selectedCharacter) { mutableStateOf(selectedCharacter) }
    val filteredCharacters = remember(filterText) {
        val availableCharacters = characterNamesForGame(gameTitle)
        if (filterText.isBlank()) {
            availableCharacters
        } else {
            availableCharacters.filter { it.contains(filterText, ignoreCase = true) }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        OutlinedTextField(
            value = filterText,
            onValueChange = { filterText = it },
            label = { Text("Filtrar personaje") },
            modifier = Modifier.fillMaxWidth()
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 160.dp, max = 220.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState())
                    .padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (filteredCharacters.isEmpty()) {
                    Text("No hay resultados", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    filteredCharacters.forEach { characterName ->
                        val selected = selectedCharacter == characterName
                        Button(
                            onClick = {
                                onCharacterSelected(characterName)
                                filterText = characterName
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = if (selected) {
                                ButtonDefaults.buttonColors()
                            } else {
                                ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.surface,
                                    contentColor = MaterialTheme.colorScheme.onSurface
                                )
                            }
                        ) {
                            SmashCharacterInlineLabel(
                                  name = characterName,
                                  gameTitle = gameTitle,
                                  textColor = if (selected) {
                                      MaterialTheme.colorScheme.onPrimary
                                  } else {
                                    MaterialTheme.colorScheme.onSurface
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

private data class DesktopQuickReportScoreOption(
    val key: String,
    val winnerParticipantId: String,
    val winnerScore: Int,
    val loserScore: Int,
)

private data class DesktopQuickReportGameDraft(
    val winnerParticipantId: String,
    val firstCharacter: String = "",
    val secondCharacter: String = "",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DesktopQuickReportResultDialog(
    match: DesktopMatchSummary,
    isSaving: Boolean,
    errorMessage: String?,
    gameTitle: String,
    effectiveBestOf: Int,
    requiresCharacters: Boolean,
    initialCharacters: List<String>,
    initialScoreKey: String?,
    initialGames: List<DesktopQuickReportGameDraft>,
    onDismiss: () -> Unit,
    onSubmit: (String, String, String, List<DesktopQuickReportGameDraft>) -> Unit,
) {
    val scoreOptions = remember(match.id, effectiveBestOf, match.participantIds) {
        buildDesktopQuickReportScoreOptions(match, effectiveBestOf)
    }
    var firstCharacter by remember(match.id) { mutableStateOf(initialCharacters.getOrNull(0).orEmpty()) }
    var secondCharacter by remember(match.id) { mutableStateOf(initialCharacters.getOrNull(1).orEmpty()) }
    var selectedScoreKey by remember(match.id) { mutableStateOf(initialScoreKey) }
    var games by remember(match.id) { mutableStateOf(initialGames) }

    LaunchedEffect(match.id) {
        if (games.isEmpty() && !selectedScoreKey.isNullOrBlank()) {
            scoreOptions.firstOrNull { it.key == selectedScoreKey }?.let { option ->
                games = buildDesktopQuickReportGames(match, option, firstCharacter, secondCharacter)
            }
        }
    }

    val canSubmit = selectedScoreKey != null && scoreOptions.any { it.key == selectedScoreKey } && games.size <= effectiveBestOf
        && games.isNotEmpty()
        && (!requiresCharacters || games.all { game -> listOf(game.firstCharacter, game.secondCharacter).all { value -> value.split("/").size == match.entrantSize && value.split("/").all { it.isNotBlank() } } })

    DialogWindow(
        onCloseRequest = { if (!isSaving) onDismiss() },
        title = "Anotacion rapida",
        resizable = true,
        state = rememberDialogState(size = DpSize(860.dp, 760.dp))
    ) {
        Surface(color = MaterialTheme.colorScheme.surface) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Text("Anotacion rapida", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(
                    "Selecciona el resultado final y revisa los juegos antes de anotarlos de una sola vez.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "Modalidad del set: Bo$effectiveBestOf",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold,
                )
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = true)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (requiresCharacters) {
                        FilterableCharacterSelector(
                            characterCount = match.entrantSize,
                            gameTitle = gameTitle,
                            label = "${match.participantNames[0]} (base)",
                            selectedCharacter = firstCharacter,
                            onCharacterSelected = {
                                firstCharacter = it
                                games = games.map { game -> game.copy(firstCharacter = it) }
                            }
                        )
                        FilterableCharacterSelector(
                            characterCount = match.entrantSize,
                            gameTitle = gameTitle,
                            label = "${match.participantNames[1]} (base)",
                            selectedCharacter = secondCharacter,
                            onCharacterSelected = {
                                secondCharacter = it
                                games = games.map { game -> game.copy(secondCharacter = it) }
                            }
                        )
                    }
                    Text("Resultado final", fontWeight = FontWeight.SemiBold)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        scoreOptions.forEach { option ->
                            val isSelected = option.key == selectedScoreKey
                            Button(
                                onClick = {
                                    selectedScoreKey = option.key
                                    games = buildDesktopQuickReportGames(match, option, firstCharacter, secondCharacter)
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                    contentColor = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                ),
                            ) {
                                Text("${desktopWinnerNameForOption(match, option)} ${option.winnerScore}-${option.loserScore}")
                            }
                        }
                    }
                    if (games.isNotEmpty()) {
                        Text("Resumen de juegos", fontWeight = FontWeight.SemiBold)
                        games.forEachIndexed { index, game ->
                            Card(
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                                ),
                                border = surfaceCardBorder()
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text("Juego ${index + 1}", fontWeight = FontWeight.SemiBold)
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
                                        FilterableCharacterSelector(
                            characterCount = match.entrantSize,
                                            gameTitle = gameTitle,
                                            label = match.participantNames[0],
                                            selectedCharacter = game.firstCharacter,
                                            onCharacterSelected = { selected ->
                                                games = games.mapIndexed { gameIndex, current ->
                                                    if (gameIndex == index) current.copy(firstCharacter = selected) else current
                                                }
                                            }
                                        )
                                        FilterableCharacterSelector(
                            characterCount = match.entrantSize,
                                            gameTitle = gameTitle,
                                            label = match.participantNames[1],
                                            selectedCharacter = game.secondCharacter,
                                            onCharacterSelected = { selected ->
                                                games = games.mapIndexed { gameIndex, current ->
                                                    if (gameIndex == index) current.copy(secondCharacter = selected) else current
                                                }
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    OutlinedButton(onClick = onDismiss, enabled = !isSaving) { Text("Cancelar") }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = {
                            val scoreKey = selectedScoreKey ?: return@Button
                            onSubmit(scoreKey, firstCharacter, secondCharacter, games)
                        },
                        enabled = canSubmit && !isSaving,
                    ) {
                        Text(if (isSaving) "Guardando..." else "Anotar")
                    }
                }
            }
        }
    }
}

@Composable
private fun DesktopQuickReportBestOfDialog(
    defaultBestOf: Int,
    selectedOverride: Int?,
    onDismiss: () -> Unit,
    onConfirm: (Int?) -> Unit,
) {
    val options = listOf(
        null to "Por defecto del torneo (Bo$defaultBestOf)",
        1 to "Bo1",
        3 to "Bo3",
        5 to "Bo5",
    )
    var selectedOption by remember(defaultBestOf, selectedOverride) { mutableStateOf(selectedOverride) }

    DialogWindow(
        onCloseRequest = onDismiss,
        title = "Modalidad del set",
        resizable = false,
        state = rememberDialogState(size = DpSize(560.dp, 420.dp))
    ) {
        Surface(color = MaterialTheme.colorScheme.surface) {
            Column(
                modifier = Modifier.fillMaxSize().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("Modalidad del set", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(
                    "Antes de anotar, indica si este set se jugo con el formato por defecto del torneo o con una modalidad distinta.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    options.forEach { (value, label) ->
                        val selected = selectedOption == value
                        OutlinedButton(
                            onClick = { selectedOption = value },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(
                                containerColor = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                                contentColor = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary,
                            ),
                            border = BorderStroke(1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline),
                        ) {
                            Text(label, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                Spacer(Modifier.weight(1f))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    OutlinedButton(onClick = onDismiss) { Text("Cancelar") }
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = { onConfirm(selectedOption) }) { Text("Continuar") }
                }
            }
        }
    }
}

private fun buildDesktopQuickReportScoreOptions(
    match: DesktopMatchSummary,
    effectiveBestOf: Int,
): List<DesktopQuickReportScoreOption> {
    if (match.participantIds.size < 2) {
        return emptyList()
    }
    val winsNeeded = (effectiveBestOf / 2) + 1
    val firstParticipantId = match.participantIds[0]
    val secondParticipantId = match.participantIds[1]
    return buildList {
        for (loserScore in 0 until winsNeeded) {
            add(
                DesktopQuickReportScoreOption(
                    key = "$firstParticipantId:$winsNeeded-$loserScore",
                    winnerParticipantId = firstParticipantId,
                    winnerScore = winsNeeded,
                    loserScore = loserScore,
                ),
            )
        }
        for (loserScore in 0 until winsNeeded) {
            add(
                DesktopQuickReportScoreOption(
                    key = "$secondParticipantId:$winsNeeded-$loserScore",
                    winnerParticipantId = secondParticipantId,
                    winnerScore = winsNeeded,
                    loserScore = loserScore,
                ),
            )
        }
    }
}

private fun buildDesktopQuickReportGames(
    match: DesktopMatchSummary,
    option: DesktopQuickReportScoreOption,
    firstCharacter: String,
    secondCharacter: String,
): List<DesktopQuickReportGameDraft> {
    if (match.participantIds.size < 2) {
        return emptyList()
    }
    val actualLoserId = match.participantIds.firstOrNull { it != option.winnerParticipantId } ?: return emptyList()
    val games = mutableListOf<DesktopQuickReportGameDraft>()
    repeat(option.loserScore) {
        games += DesktopQuickReportGameDraft(option.winnerParticipantId, firstCharacter, secondCharacter)
        games += DesktopQuickReportGameDraft(actualLoserId, firstCharacter, secondCharacter)
    }
    repeat((option.winnerScore - option.loserScore - 1).coerceAtLeast(0)) {
        games += DesktopQuickReportGameDraft(option.winnerParticipantId, firstCharacter, secondCharacter)
    }
    games += DesktopQuickReportGameDraft(option.winnerParticipantId, firstCharacter, secondCharacter)
    return games
}

private fun desktopWinnerNameForOption(match: DesktopMatchSummary, option: DesktopQuickReportScoreOption): String {
    val winnerIndex = match.participantIds.indexOf(option.winnerParticipantId)
    return match.participantNames.getOrElse(winnerIndex) { "Ganador" }
}

private fun currentDesktopQuickReportGames(match: DesktopMatchSummary): List<DesktopQuickReportGameDraft> {
    if (match.participantIds.size < 2 || match.gameResults.isEmpty()) {
        return emptyList()
    }
    val firstParticipantId = match.participantIds[0]
    val secondParticipantId = match.participantIds[1]
    val latestSelections = match.characterSelections.associateBy { it.participantId }
    val selectionsByGame = match.gameCharacterSelections.associateBy { it.gameNum }

    return match.gameResults.mapIndexed { index, winnerParticipantId ->
        val gameSelections = selectionsByGame[index + 1]?.selections?.associateBy { it.participantId }.orEmpty()
        DesktopQuickReportGameDraft(
            winnerParticipantId = winnerParticipantId,
            firstCharacter = gameSelections[firstParticipantId]?.characterName
                ?: latestSelections[firstParticipantId]?.characterName
                ?: "",
            secondCharacter = gameSelections[secondParticipantId]?.characterName
                ?: latestSelections[secondParticipantId]?.characterName
                ?: "",
        )
    }
}

private fun desktopLatestCharacterForParticipant(match: DesktopMatchSummary, participantId: String): String? {
    if (participantId.isBlank()) {
        return null
    }
    return match.gameCharacterSelections
        .sortedByDescending { it.gameNum }
        .firstNotNullOfOrNull { game ->
            game.selections.firstOrNull { it.participantId == participantId }?.characterName
        }
        ?: match.characterSelections.firstOrNull { it.participantId == participantId }?.characterName
}

private fun desktopPlayerMatchScoreLabel(isWalkover: Boolean, isEliminated: Boolean, score: Int): String {
    return if (isWalkover && isEliminated) "DQ" else score.toString()
}

private data class DesktopMatchSection(
    val key: String,
    val label: String,
    val matches: List<DesktopMatchSummary>
)

private fun buildDesktopMatchSections(
    matches: List<DesktopMatchSummary>,
    forCompleted: Boolean
): List<DesktopMatchSection> {
    return matches
        .groupBy { desktopSectionKey(it, forCompleted) }
        .map { (key, sectionMatches) ->
            DesktopMatchSection(
                key = key,
                label = desktopSectionLabel(sectionMatches.first(), forCompleted),
                matches = sectionMatches.sortedWith(
                    compareBy<DesktopMatchSummary>(
                        { if (forCompleted) 0 else activeMatchPriority(it) },
                        { if (forCompleted) Long.MIN_VALUE else activeMatchTimelineAnchor(it) ?: Long.MAX_VALUE },
                        { it.bracketStage },
                        { it.roundNumber },
                        { it.matchNumber }
                    )
                )
            )
        }
        .sortedWith { left, right ->
            val leftOrder = desktopSectionSortOrder(left.label)
            val rightOrder = desktopSectionSortOrder(right.label)
            if (leftOrder != rightOrder) {
                leftOrder - rightOrder
            } else if (naturalLabelLessThan(left.label, right.label)) {
                -1
            } else if (naturalLabelLessThan(right.label, left.label)) {
                1
            } else {
                0
            }
        }
}

private fun desktopSectionKey(match: DesktopMatchSummary, forCompleted: Boolean): String {
    val pool = match.poolLabel?.trim().orEmpty()
    if (pool.isNotEmpty()) {
        return "pool:$pool"
    }
    if (forCompleted) {
        return when (match.bracketStage.uppercase()) {
            "WINNERS", "LOSERS", "FINALS" -> "bracket:final"
            else -> "stage:${match.bracketStage.uppercase()}"
        }
    }
    return "stage:${match.bracketStage.uppercase()}"
}

private fun desktopSectionLabel(match: DesktopMatchSummary, forCompleted: Boolean): String {
    val pool = match.poolLabel?.trim().orEmpty()
    if (pool.isNotEmpty()) {
        return pool
    }
    return when (match.bracketStage.uppercase()) {
        "WINNERS", "LOSERS", "FINALS" -> if (forCompleted) "Bracket final" else "Bracket final"
        else -> match.bracketStage.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
    }
}

private fun desktopSectionSortOrder(label: String): Int {
    return when {
        label.startsWith("Pool", ignoreCase = true) -> 0
        label.equals("Bracket final", ignoreCase = true) -> 1
        else -> 2
    }
}

@Composable
private fun FormField(value: String, onValueChange: (String) -> Unit, label: String, minLines: Int = 1) {
    OutlinedTextField(value = value, onValueChange = onValueChange, label = { Text(label) }, modifier = Modifier.fillMaxWidth(), minLines = minLines)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SegmentedChoiceRow(title: String, options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { (value, label) ->
                val selectedChip = value == selected
                Button(
                    onClick = { onSelect(value) },
                    colors = if (selectedChip) ButtonDefaults.buttonColors() else ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                        contentColor = MaterialTheme.colorScheme.onSurface
                    )
                ) {
                    Text(label)
                }
            }
        }
    }
}

@Composable
private fun CollapsibleHeader(title: String, expanded: Boolean, onToggle: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onToggle), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), border = surfaceCardBorder()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(title, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text(if (expanded) "Ocultar" else "Mostrar", color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f))
        }
    }
}

@Composable
private fun DesktopBracketViewport(
    modifier: Modifier = Modifier,
    fullscreen: Boolean = false,
    horizontalState: ScrollState = rememberScrollState(),
    verticalState: ScrollState = rememberScrollState(),
    content: @Composable () -> Unit
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .then(if (fullscreen) Modifier.fillMaxSize() else Modifier.heightIn(min = 320.dp, max = 760.dp))
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(end = 14.dp, bottom = 14.dp)
                .horizontalScroll(horizontalState)
                .verticalScroll(verticalState)
        ) {
            content()
        }
        VerticalScrollbar(
            adapter = rememberScrollbarAdapter(verticalState),
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .fillMaxHeight()
                .padding(top = 4.dp, bottom = 14.dp)
        )
        HorizontalScrollbar(
            adapter = rememberScrollbarAdapter(horizontalState),
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(start = 4.dp, end = 14.dp)
        )
    }
}

@Composable
private fun BracketBoard(
    matches: List<DesktopMatchSummary>,
    hideAutomaticAdvances: Boolean = false,
    selectableMatchIds: Set<String> = emptySet(),
    showOperationalState: Boolean = false,
    timeoutMinutes: Int = 10,
    onMatchSelected: ((DesktopMatchSummary) -> Unit)? = null
) {
    val visibleMatches = if (hideAutomaticAdvances) {
        matches
            .filterNot { isDormantGrandFinalReset(matches, it) }
            .filterNot(::isAutomaticAdvanceDisplayMatch)
    } else {
        matches.filterNot { isDormantGrandFinalReset(matches, it) }
    }
    val stageOrder = listOf("POOLS", "WINNERS", "LOSERS", "FINALS")
    DesktopBracketViewport {
        Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            stageOrder.forEach { stage ->
                val stageMatches = visibleMatches.filter { it.bracketStage == stage }
                if (stageMatches.isNotEmpty()) {
                    val concurrentPoolGroups = groupedConcurrentPools(stageMatches)
                    if (concurrentPoolGroups != null) {
                        val groups = concurrentPoolGroups
                        groups.forEach { (groupName, groupMatches) ->
                            PoolBracketCluster(
                                groupName = groupName,
                                matches = groupMatches,
                                selectableMatchIds = selectableMatchIds,
                                showOperationalState = showOperationalState,
                                timeoutMinutes = timeoutMinutes,
                                onMatchSelected = onMatchSelected
                            )
                        }
                    } else {
                        val rounds = stageMatches.groupBy { it.roundNumber }.toSortedMap()
                        rounds.forEach { (round, roundMatches) ->
                            Column(modifier = Modifier.width(if (roundMatches.any { it.participantNames.size > 2 }) 320.dp else 280.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                                Text(roundTitle(stage, round, rounds.size), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                roundMatches.sortedBy { it.matchNumber }.forEach { match ->
                                    RelationalMatchNode(
                                        match = match,
                                        selectable = match.id in selectableMatchIds,
                                        showOperationalState = showOperationalState,
                                        timeoutMinutes = timeoutMinutes,
                                        onClick = onMatchSelected
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

private fun groupedConcurrentPools(matches: List<DesktopMatchSummary>): Map<String, List<DesktopMatchSummary>>? {
    val groups = matches
        .filter { !it.phaseGroupName.isNullOrBlank() }
        .groupBy { it.phaseGroupName!!.trim() }
        .toSortedMap()
    return groups.takeIf { it.size > 1 }
}

@Composable
private fun PoolBracketCluster(
    groupName: String,
    matches: List<DesktopMatchSummary>,
    selectableMatchIds: Set<String> = emptySet(),
    showOperationalState: Boolean = false,
    timeoutMinutes: Int = 10,
    onMatchSelected: ((DesktopMatchSummary) -> Unit)? = null
) {
    val rounds = matches.groupBy { it.roundNumber }.toSortedMap()
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)), border = surfaceCardBorder()) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(groupName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                rounds.forEach { (round, roundMatches) ->
                    Column(modifier = Modifier.width(if (roundMatches.any { it.participantNames.size > 2 }) 320.dp else 280.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                        Text("Ronda $round", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        roundMatches.sortedBy { it.matchNumber }.forEach { match ->
                            RelationalMatchNode(
                                match = match,
                                selectable = match.id in selectableMatchIds,
                                showOperationalState = showOperationalState,
                                timeoutMinutes = timeoutMinutes,
                                onClick = onMatchSelected
                            )
                        }
                    }
                }
            }
        }
    }
}

private data class DesktopModernSection(
    val id: String,
    val label: String,
    val clusters: List<DesktopModernCluster>,
)

private data class DesktopModernCluster(
    val id: String,
    val label: String,
    val rounds: List<DesktopModernRound>,
)

private data class DesktopModernRound(
    val title: String,
    val matches: List<DesktopMatchSummary>,
)

private data class DesktopModernNodeLayout(
    val match: DesktopMatchSummary,
    val roundIndex: Int,
    val sourceMatchIds: List<String>,
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
)

private fun desktopModernNodeHeight(
    match: DesktopMatchSummary,
    showOperationalState: Boolean
): Float {
    val isMarioKart = match.participantNames.size > 2 || match.advancersRequired > 1 || match.bracketMode == "MKART"
    val called = !match.calledAt.isNullOrBlank()
    val started = !match.startedAt.isNullOrBlank()
    val completed = match.status == "COMPLETED" || match.status == "WALKOVER"
    val participantCount = maxOf(match.participantNames.size, 2)
    var height = 24f // outer vertical padding
    height += 28f // header row
    if (showOperationalState && called && !started && !completed) {
        height += 30f
    } else if (showOperationalState && started && !completed) {
        height += 30f
    }
    if (isMarioKart) {
        height += 24f
    }
    height += participantCount * if (isMarioKart) 58f else 54f
    height += (participantCount - 1) * 10f
    val hasFooter = !match.stationLabel.isNullOrBlank()
    if (hasFooter) {
        height += 22f
    }
    return height.coerceAtLeast(if (isMarioKart) 260f else 210f)
}

private fun isDesktopPoolMatch(match: DesktopMatchSummary): Boolean {
    if (!match.phaseGroupName.isNullOrBlank()) return true
    val phaseName = match.phaseName?.trim().orEmpty()
    if (phaseName.isBlank()) return false
    return phaseName.startsWith("Pool", ignoreCase = true) || phaseName.startsWith("Grupo", ignoreCase = true)
}

private fun desktopHasExplicitPhaseStructure(match: DesktopMatchSummary): Boolean {
    val phaseName = match.phaseName?.trim().orEmpty()
    if (phaseName.isBlank()) return false
    if (isDesktopPoolMatch(match)) return false
    if (phaseName.equals(match.bracketStage, ignoreCase = true)) return false
    if (phaseName.equals("bracket", ignoreCase = true)) return false
    return true
}

private fun buildDesktopModernSections(matches: List<DesktopMatchSummary>): List<DesktopModernSection> {
    val stageOrder = mapOf("POOLS" to 0, "WINNERS" to 1, "LOSERS" to 2, "FINALS" to 3)
    val sortedMatches = matches.sortedWith(
        compareBy<DesktopMatchSummary>(
            { stageOrder[it.bracketStage] ?: 99 },
            { it.phaseName ?: "" },
            { it.phaseGroupName ?: "" },
            { it.roundNumber },
            { it.matchNumber },
        )
    )

    val sections = buildList {
        addAll(buildDesktopModernPoolSections(sortedMatches.filter(::isDesktopPoolMatch)))
        val bracketGrouped = sortedMatches
            .filterNot(::isDesktopPoolMatch)
            .groupBy { match ->
                if (desktopHasExplicitPhaseStructure(match)) {
                    match.phaseName?.trim().orEmpty().ifBlank { "__main_bracket__" }
                } else {
                    "__main_bracket__"
                }
            }
        bracketGrouped.entries.forEach { (key, sectionMatches) ->
            val first = sectionMatches.firstOrNull() ?: return@forEach
            add(
                desktopTournamentBracketSectionFromMatches(
                    id = "bracket:$key",
                    label = desktopTournamentBracketLabel(first),
                    matches = sectionMatches
                )
            )
        }
    }

    return sections.sortedBy { section ->
        when {
            section.label.startsWith("Pool ", ignoreCase = true) || section.label.startsWith("Grupo ", ignoreCase = true) -> 0
            section.label.equals("Pools", ignoreCase = true) -> 1
            section.label.equals("Winners bracket", ignoreCase = true) -> 2
            section.label.equals("Losers bracket", ignoreCase = true) -> 3
            section.label.equals("Bracket final", ignoreCase = true) -> 4
            else -> 5
        }.toString() + ":" + section.label
    }
}

private fun buildDesktopModernPoolSections(poolMatches: List<DesktopMatchSummary>): List<DesktopModernSection> {
    if (poolMatches.isEmpty()) return emptyList()
    val explicitGroups = poolMatches
        .filter { !it.phaseGroupName.isNullOrBlank() }
        .groupBy { it.phaseGroupName!!.trim() }
        .map { (key, groupedMatches) ->
            desktopPoolSectionFromMatches(
                id = "pool:$key",
                label = key,
                matches = groupedMatches
            )
        }

    val fallbackMatches = poolMatches.filter { it.phaseGroupName.isNullOrBlank() }
    val fallbackGroups = desktopConnectedPoolGroups(fallbackMatches)
        .sortedWith(compareBy<List<DesktopMatchSummary>>(
            { it.minOfOrNull(DesktopMatchSummary::roundNumber) ?: Int.MAX_VALUE },
            { it.minOfOrNull(DesktopMatchSummary::matchNumber) ?: Int.MAX_VALUE },
        ))
        .mapIndexed { index, groupedMatches ->
            desktopPoolSectionFromMatches(
                id = "pool:local:$index",
                label = "Pool ${index + 1}",
                matches = groupedMatches
            )
        }

    return (explicitGroups + fallbackGroups).sortedBy { it.label }
}

private fun desktopConnectedPoolGroups(matches: List<DesktopMatchSummary>): List<List<DesktopMatchSummary>> {
    if (matches.isEmpty()) return emptyList()
    val byId = matches.associateBy { it.id }
    val adjacency = matches.associate { it.id to linkedSetOf<String>() }.toMutableMap()
    matches.forEach { match ->
        desktopModernSourceMatchIds(match).forEach { sourceId ->
            if (sourceId in byId) {
                adjacency.getValue(match.id).add(sourceId)
                adjacency.getValue(sourceId).add(match.id)
            }
        }
    }
    val visited = linkedSetOf<String>()
    val groups = mutableListOf<List<DesktopMatchSummary>>()
    matches.forEach { start ->
        if (!visited.add(start.id)) return@forEach
        val stack = ArrayDeque<String>()
        val groupIds = mutableListOf<String>()
        stack.add(start.id)
        while (stack.isNotEmpty()) {
            val current = stack.removeLast()
            groupIds += current
            adjacency[current].orEmpty().forEach { neighbor ->
                if (visited.add(neighbor)) stack.add(neighbor)
            }
        }
        groups += groupIds.mapNotNull(byId::get)
    }
    return groups
}

private fun desktopPoolSectionFromMatches(id: String, label: String, matches: List<DesktopMatchSummary>): DesktopModernSection {
    val winnersLike = matches.filter { it.bracketStage == "POOLS" || it.bracketStage == "WINNERS" || it.bracketStage == "FINALS" }
    val losers = matches.filter { it.bracketStage == "LOSERS" }
    val clusters = buildList {
        if (winnersLike.isNotEmpty()) {
            add(
                desktopClusterFromStageGroups(
                    id = "$id:winners",
                    label = "Winners bracket",
                    stageGroups = listOf(
                        "WINNERS" to winnersLike.filter { it.bracketStage == "POOLS" || it.bracketStage == "WINNERS" },
                        "FINALS" to winnersLike.filter { it.bracketStage == "FINALS" }
                    )
                )
            )
        }
        if (losers.isNotEmpty()) {
            add(desktopClusterFromMatches("$id:losers", "Losers bracket", losers))
        }
    }
    return DesktopModernSection(id = id, label = label, clusters = clusters)
}

private fun desktopTournamentBracketSectionFromMatches(id: String, label: String, matches: List<DesktopMatchSummary>): DesktopModernSection {
    val winners = matches.filter { it.bracketStage == "POOLS" || it.bracketStage == "WINNERS" }
    val losers = matches.filter { it.bracketStage == "LOSERS" }
    val finals = matches.filter { it.bracketStage == "FINALS" }
    val clusters = buildList {
        if (winners.isNotEmpty() || finals.isNotEmpty()) {
            add(
                desktopClusterFromStageGroups(
                    id = "$id:winners",
                    label = "Winners bracket",
                    stageGroups = listOf(
                        "WINNERS" to winners,
                        "FINALS" to finals
                    )
                )
            )
        }
        if (losers.isNotEmpty()) {
            add(desktopClusterFromMatches("$id:losers", "Losers bracket", losers))
        }
    }
    return DesktopModernSection(id = id, label = label, clusters = clusters)
}

private fun desktopClusterFromStageGroups(
    id: String,
    label: String,
    stageGroups: List<Pair<String, List<DesktopMatchSummary>>>,
): DesktopModernCluster {
    val rounds = stageGroups.flatMap { (stage, stageMatches) ->
        val groupedRounds = stageMatches.groupBy { it.roundNumber }.toSortedMap()
        groupedRounds.map { (round, roundMatches) ->
            DesktopModernRound(
                title = roundMatches.firstOrNull()?.fullRoundText ?: roundTitle(stage, round, groupedRounds.size),
                matches = roundMatches.sortedBy { it.matchNumber }
            )
        }
    }
    return DesktopModernCluster(id = id, label = label, rounds = rounds)
}

private fun desktopClusterFromMatches(
    id: String,
    label: String,
    matches: List<DesktopMatchSummary>,
): DesktopModernCluster {
    val groupedRounds = matches.groupBy { it.roundNumber }.toSortedMap()
    val rounds = groupedRounds.map { (round, roundMatches) ->
        DesktopModernRound(
            title = roundMatches.firstOrNull()?.fullRoundText ?: roundTitle(roundMatches.firstOrNull()?.bracketStage ?: "WINNERS", round, groupedRounds.size),
            matches = roundMatches.sortedBy { it.matchNumber }
        )
    }
    return DesktopModernCluster(id = id, label = label, rounds = rounds)
}

private fun desktopTournamentBracketLabel(match: DesktopMatchSummary): String {
    val phaseName = match.phaseName?.trim().orEmpty()
    return if (phaseName.isNotBlank() && !phaseName.equals(match.bracketStage, ignoreCase = true) && !phaseName.equals("bracket", ignoreCase = true)) {
        phaseName
    } else {
        "Bracket final"
    }
}

private fun desktopModernSourceMatchIds(
    match: DesktopMatchSummary,
    candidateMatches: List<DesktopMatchSummary> = emptyList(),
): List<String> {
    val sourceIds = linkedSetOf<String>()
    match.participantIds
        .mapNotNull(::desktopModernSourceMatchIdFromPlaceholder)
        .forEach(sourceIds::add)

    val targetIndex = candidateMatches.indexOfFirst { it.id == match.id }
    val earlierMatches = if (targetIndex >= 0) candidateMatches.take(targetIndex) else candidateMatches.filter { it.id != match.id }
    match.participantIds.forEach { participantId ->
        if (participantId.isBlank() || desktopModernSourceMatchIdFromPlaceholder(participantId) != null) return@forEach
        val sourceMatch = earlierMatches
            .asReversed()
            .firstOrNull { candidate -> desktopModernFeedsParticipant(candidate, participantId) }
        sourceMatch?.id?.let(sourceIds::add)
    }
    return sourceIds.toList()
}

private fun desktopModernFeedsParticipant(match: DesktopMatchSummary, participantId: String): Boolean {
    if (participantId.isBlank()) return false
    if (match.advancingParticipantIds.contains(participantId)) return true
    if (match.winnerParticipantId == participantId) return true
    return match.participantIds.contains(participantId)
}

private fun desktopModernSourceMatchIdFromPlaceholder(participantId: String): String? {
    return when {
        participantId.startsWith("winner_of_") -> participantId.removePrefix("winner_of_")
        participantId.startsWith("loser_of_") -> participantId.removePrefix("loser_of_")
        participantId.startsWith("advance_") -> Regex("^advance_\\d+_of_(.+)$").find(participantId)?.groupValues?.getOrNull(1)
        participantId.startsWith("drop_") -> Regex("^drop_\\d+_of_(.+)$").find(participantId)?.groupValues?.getOrNull(1)
        else -> null
    }?.takeIf { it.isNotBlank() }
}

@Composable
internal fun ModernBracketBoard(
    matches: List<DesktopMatchSummary>,
    hideAutomaticAdvances: Boolean = false,
    selectableMatchIds: Set<String> = emptySet(),
    showOperationalState: Boolean = false,
    timeoutMinutes: Int = 10,
    onMatchSelected: ((DesktopMatchSummary) -> Unit)? = null,
) {
    val visibleMatches = if (hideAutomaticAdvances) {
        matches
            .filterNot { isDormantGrandFinalReset(matches, it) }
            .filterNot(::isAutomaticAdvanceDisplayMatch)
    } else {
        matches.filterNot { isDormantGrandFinalReset(matches, it) }
    }
    val sections = buildDesktopModernSections(visibleMatches)
    val search = remember { ModernBracketSearch() }
    val hits = sections.flatMap { it.clusters }.flatMap { it.rounds }.flatMap { it.matches }.filter { match ->
        bracketSearchMatches(match.participantNames.filterIndexed { index, _ ->
            match.participantIds.getOrNull(index)?.let { it.isNotBlank() && desktopModernSourceMatchIdFromPlaceholder(it) == null } == true
        }, search.query)
    }
    LaunchedEffect(search.query) { search.select(hits.firstOrNull()?.id) }
    LaunchedEffect(hits.map { it.id }) {
        if (search.selectedId !in hits.map { it.id }) search.select(hits.firstOrNull()?.id)
    }
    val horizontalState = rememberScrollState()
    val verticalState = rememberScrollState()
    val fullscreen = LocalBracketFullscreen.current
    val owner = remember { Any() }
    val expanded = fullscreen?.owner === owner
    val expandedContent = rememberUpdatedState<@Composable () -> Unit>({
        ModernBracketCanvas(sections, horizontalState, verticalState, true, selectableMatchIds, showOperationalState, timeoutMinutes, onMatchSelected, search, hits)
    })
    DisposableEffect(fullscreen, owner) {
        onDispose { fullscreen?.close(owner) }
    }
    Column {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(enabled = fullscreen != null && !expanded, onClick = { fullscreen?.open(owner) { expandedContent.value() } }) {
                Text("Pantalla completa")
            }
        }
        if (expanded) {
            Spacer(Modifier.fillMaxWidth().height(760.dp))
        } else {
            ModernBracketCanvas(sections, horizontalState, verticalState, false, selectableMatchIds, showOperationalState, timeoutMinutes, onMatchSelected, search, hits)
        }
    }
}

@Composable
private fun ModernBracketCanvas(
    sections: List<DesktopModernSection>, horizontalState: ScrollState, verticalState: ScrollState,
    fullscreen: Boolean, selectableMatchIds: Set<String>, showOperationalState: Boolean,
    timeoutMinutes: Int, onMatchSelected: ((DesktopMatchSummary) -> Unit)?,
    search: ModernBracketSearch, hits: List<DesktopMatchSummary>,
) {
    LaunchedEffect(search.focusRequest, fullscreen) {
        if (search.selectedId == null || search.appliedFocusRequest == search.focusRequest) return@LaunchedEffect
        delay(100) // Wait for the new phase/window layout before centering.
        val viewport = search.viewport?.takeIf { it.isAttached } ?: return@LaunchedEffect
        val node = search.nodes[search.selectedId]?.takeIf { it.isAttached } ?: return@LaunchedEffect
        val bounds = viewport.localBoundingBoxOf(node, clipBounds = false)
        val left = (horizontalState.value + bounds.center.x - viewport.size.width / 2f).toInt()
        val top = (verticalState.value + bounds.center.y - viewport.size.height / 2f).toInt()
        kotlinx.coroutines.coroutineScope {
            launch { horizontalState.animateScrollTo(left.coerceAtLeast(0)) }
            launch { verticalState.animateScrollTo(top.coerceAtLeast(0)) }
        }
        search.appliedFocusRequest = search.focusRequest
    }
    Column(Modifier.fillMaxWidth().then(if (fullscreen) Modifier.fillMaxHeight() else Modifier)) {
    ModernBracketSearchControls(search, hits)
    DesktopBracketViewport(modifier = Modifier.onGloballyPositioned { search.viewport = it }
        .then(if (fullscreen) Modifier.weight(1f) else Modifier), fullscreen = fullscreen, horizontalState = horizontalState, verticalState = verticalState) {
        Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            sections.forEach { section ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.34f)),
                    border = surfaceCardBorder()
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text(section.label, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        section.clusters.forEach { cluster ->
                            ModernBracketCluster(
                                cluster = cluster,
                                selectableMatchIds = selectableMatchIds,
                                showOperationalState = showOperationalState,
                                timeoutMinutes = timeoutMinutes,
                                onMatchSelected = onMatchSelected,
                                search = search, hitIds = hits.map { it.id }.toSet()
                            )
                        }
                    }
                }
            }
        }
    }
    }
}

@Composable
private fun ModernBracketCluster(
    cluster: DesktopModernCluster,
    selectableMatchIds: Set<String>,
    showOperationalState: Boolean,
    timeoutMinutes: Int,
    onMatchSelected: ((DesktopMatchSummary) -> Unit)? = null,
    search: ModernBracketSearch, hitIds: Set<String>,
) {
    if (cluster.rounds.isEmpty()) return
    val clusterMatches = cluster.rounds.flatMap { it.matches }
    val anyMarioKart = clusterMatches.any { it.participantNames.size > 2 || it.advancersRequired > 1 || it.bracketMode == "MKART" }
    val density = LocalDensity.current
    val readingScale = density.fontScale.coerceAtLeast(1f)
    val measuredHeights = remember(cluster.id, readingScale) { mutableStateMapOf<String, Float>() }
    val connectorColor = MaterialTheme.colorScheme.outline
    val columnWidth = (if (anyMarioKart) 360f else 320f) * readingScale
    val columnGap = 78f
    val rowGap = 24f
    val padding = 18f
    val titleTop = 6f
    val titleHeight = 34f * readingScale
    val firstNodeTop = padding + titleHeight
    val layouts = mutableListOf<DesktopModernNodeLayout>()
    val byMatchId = linkedMapOf<String, DesktopModernNodeLayout>()
    cluster.rounds.forEachIndexed { roundIndex, round ->
        var previousInRound: DesktopModernNodeLayout? = null
        val currentRoundLayouts = round.matches.mapIndexed { index, match ->
            val nodeHeight = measuredHeights[match.id] ?: (desktopModernNodeHeight(match, showOperationalState) * readingScale)
            val sourceMatchIds = desktopModernSourceMatchIds(match, clusterMatches)
            val y = if (roundIndex == 0 || sourceMatchIds.isEmpty()) {
                val fallbackTop = firstNodeTop + index * (nodeHeight + rowGap)
                maxOf(previousInRound?.let { it.y + it.height + rowGap } ?: firstNodeTop, fallbackTop)
            } else {
                val sources = sourceMatchIds.mapNotNull(byMatchId::get)
                val sourceTop = when {
                    sources.size >= 2 -> sources.map { it.y + (it.height / 2f) }.average().toFloat() - nodeHeight / 2f
                    sources.size == 1 -> sources.first().y + (sources.first().height / 2f) - nodeHeight / 2f
                    else -> firstNodeTop + index * (nodeHeight + rowGap)
                }
                maxOf(previousInRound?.let { it.y + it.height + rowGap } ?: firstNodeTop, sourceTop)
            }
            DesktopModernNodeLayout(
                match = match,
                roundIndex = roundIndex,
                sourceMatchIds = sourceMatchIds,
                x = padding + roundIndex * (columnWidth + columnGap),
                y = y,
                width = columnWidth,
                height = nodeHeight
            ).also { previousInRound = it }
        }
        layouts += currentRoundLayouts
        currentRoundLayouts.forEach { byMatchId[it.match.id] = it }
    }
    val contentWidth = (layouts.maxOfOrNull { it.x + it.width } ?: columnWidth) + padding
    val contentHeight = (layouts.maxOfOrNull { it.y + it.height } ?: 220f) + padding

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(cluster.label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Box(
            modifier = Modifier
                .width(contentWidth.dp)
                .height(contentHeight.dp)
        ) {
            cluster.rounds.forEachIndexed { roundIndex, round ->
                Text(
                    round.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.offset(
                        x = (padding + roundIndex * (columnWidth + columnGap)).dp,
                        y = titleTop.dp
                    )
                )
            }
            Canvas(modifier = Modifier.matchParentSize()) {
                layouts.forEach { child ->
                    child.sourceMatchIds.forEach { sourceId ->
                        val parent = byMatchId[sourceId] ?: return@forEach
                        val startX = (parent.x + parent.width).dp.toPx()
                        val startY = (parent.y + parent.height / 2f).dp.toPx()
                        val endX = child.x.dp.toPx()
                        val endY = (child.y + child.height / 2f).dp.toPx()
                        val midX = startX + (endX - startX) * 0.5f
                        drawLine(connectorColor, start = androidx.compose.ui.geometry.Offset(startX, startY), end = androidx.compose.ui.geometry.Offset(midX, startY), strokeWidth = 2.dp.toPx())
                        drawLine(connectorColor, start = androidx.compose.ui.geometry.Offset(midX, startY), end = androidx.compose.ui.geometry.Offset(midX, endY), strokeWidth = 2.dp.toPx())
                        drawLine(connectorColor, start = androidx.compose.ui.geometry.Offset(midX, endY), end = androidx.compose.ui.geometry.Offset(endX, endY), strokeWidth = 2.dp.toPx())
                    }
                }
            }
            layouts.forEach { layout ->
                Column(
                    modifier = Modifier
                        .width(layout.width.dp)
                        .heightIn(min = layout.height.dp)
                        .offset(x = layout.x.dp, y = layout.y.dp)
                        .onGloballyPositioned { search.nodes[layout.match.id] = it }
                        .then(if (layout.match.id in hitIds) Modifier.border(
                            if (layout.match.id == search.selectedId) 4.dp else 2.dp,
                            MaterialTheme.colorScheme.onSurface, RoundedCornerShape(8.dp)) else Modifier),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    RelationalMatchNode(
                        match = layout.match,
                        selectable = layout.match.id in selectableMatchIds,
                        showOperationalState = showOperationalState,
                        timeoutMinutes = timeoutMinutes,
                        onClick = onMatchSelected,
                        onHeight = { pixels -> measuredHeights[layout.match.id] = pixels / density.density },
                    )
                }
            }
        }
    }
}

private fun isAutomaticAdvanceDisplayMatch(match: DesktopMatchSummary): Boolean {
    if (match.status != "COMPLETED") return false
    if (match.calledAt != null || match.startedAt != null) return false
    if (match.characterSelections.isNotEmpty()) return false
    if (match.participantIds.isEmpty() || match.participantIds.size > match.advancersRequired) return false

    val advancedIds = buildSet {
        addAll(match.advancingParticipantIds)
        match.winnerParticipantId?.let(::add)
    }
    if (advancedIds.isEmpty()) return false

    return match.participantIds.indices.all { index ->
        val participantId = match.participantIds[index]
        val score = match.scores.getOrElse(index) { 0 }
        score == if (advancedIds.contains(participantId)) 1 else 0
    }
}

@Composable
internal fun RelationalMatchNode(
    match: DesktopMatchSummary,
    selectable: Boolean = false,
    showOperationalState: Boolean = false,
    timeoutMinutes: Int = 10,
    onClick: ((DesktopMatchSummary) -> Unit)? = null,
    onHeight: ((Int) -> Unit)? = null,
) {
    val isMarioKart = match.participantNames.size > 2 || match.advancersRequired > 1 || match.bracketMode == "MKART"
    val called = match.status == "CALLED" || !match.calledAt.isNullOrBlank()
    val started = match.status == "PLAYING" || !match.startedAt.isNullOrBlank()
    val completed = match.status == "COMPLETED" || match.status == "WALKOVER"
    val nowMillis by produceState(initialValue = System.currentTimeMillis(), key1 = match.id, key2 = showOperationalState) {
        if (!showOperationalState) return@produceState
        while (true) {
            delay(1000)
            value = System.currentTimeMillis()
        }
    }
    val remainingSeconds = if (showOperationalState) computeRemainingSeconds(match.calledAt, timeoutMinutes, nowMillis) else 0L
    val elapsedSeconds = if (showOperationalState) computeElapsedSeconds(match.startedAt, nowMillis) else 0L
    val isCalledState = showOperationalState && called && !started && !completed
    val isPlayingState = showOperationalState && started && !completed
    val cardContainerColor = when {
        isCalledState -> MainPalette.warningContainer
        isPlayingState -> MainPalette.successContainer
        else -> MaterialTheme.colorScheme.surface.copy(alpha = 0.96f)
    }
    val cardBorderColor = when {
        selectable && isCalledState -> MainPalette.warning
        selectable && isPlayingState -> MainPalette.success
        selectable -> MaterialTheme.colorScheme.primary.copy(alpha = 0.8f)
        else -> MaterialTheme.colorScheme.outline.copy(alpha = 0.34f)
    }
    Card(
        colors = CardDefaults.cardColors(containerColor = cardContainerColor),
        border = BorderStroke(1.dp, cardBorderColor),
        modifier = Modifier
            .fillMaxWidth()
            .onSizeChanged { onHeight?.invoke(it.height) }
            .then(
            if (selectable && onClick != null) Modifier.clickable { onClick(match) } else Modifier
            )
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text((match.displayIdentifier ?: "M${match.matchNumber}") + if (match.startggStreamLabel != null) " · Stream gg" else "", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                Text(
                    match.status,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = when {
                        isCalledState -> MainPalette.warning
                        isPlayingState -> MainPalette.success
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    }
                )
            }
            if (isCalledState) {
                Text("Tiempo restante: ${formatTimer(remainingSeconds)}", color = MainPalette.warning, fontWeight = FontWeight.SemiBold)
            } else if (isPlayingState) {
                Text("Jugando: ${formatElapsedTimer(elapsedSeconds)}", color = MainPalette.success, fontWeight = FontWeight.SemiBold)
            }
            if (isMarioKart) Text("Heat de ${match.participantNames.size} jugadores · pasan ${match.advancersRequired}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            match.participantNames.forEachIndexed { index, name ->
                val participantId = match.participantIds.getOrElse(index) { "" }
                val advanced = if (isMarioKart) match.advancingParticipantIds.contains(participantId) else participantId == match.winnerParticipantId
                val eliminated = completed && participantId.isNotBlank() && !advanced
                val score = match.scores.getOrElse(index) { 0 }
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = when {
                            advanced -> MainPalette.successContainer
                            eliminated -> MaterialTheme.colorScheme.errorContainer
                            else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)
                        }
                    ),
                    border = surfaceCardBorder()
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            name,
                            modifier = Modifier.weight(1f),
                            fontWeight = FontWeight.SemiBold,
                            color = when {
                                advanced -> MainPalette.success
                                eliminated -> MaterialTheme.colorScheme.error
                                else -> MaterialTheme.colorScheme.onSurface
                            }
                        )
                        if (!isMarioKart) {
                            Text(
                                if (match.status == "WALKOVER" && match.winnerParticipantId != null && participantId.isNotBlank() && participantId != match.winnerParticipantId) "DQ" else score.toString(),
                                color = when {
                                    advanced -> MainPalette.success
                                    eliminated -> MaterialTheme.colorScheme.error
                                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                                },
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(start = 10.dp),
                                maxLines = 1
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DesktopModernMatchActionsDialog(
    inline: Boolean = false,
    tournament: DesktopTournamentDetail,
    match: DesktopMatchSummary,
    stationValue: String,
    availableSetups: List<String>,
    enabled: Boolean,
    onStationChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onCall: () -> Unit,
    onCancelCall: () -> Unit,
    onStart: () -> Unit,
    onSaveCharacters: (List<Pair<String, String>>) -> Unit,
    onSaveCharactersAndRecordGameWin: (String, List<Pair<String, String>>) -> Unit,
    onSaveCharactersAndReportWinner: (String, List<Pair<String, String>>) -> Unit,
    onReportDetailedResult: (Int?, List<DesktopDetailedReportedGame>, (String?) -> Unit) -> Unit,
    onRecordGameWin: (String) -> Unit,
    onReportWinner: (String) -> Unit,
    onSelectAdvancer: (String) -> Unit,
    onResolveAbsence: (String) -> Unit,
    onResetMatch: () -> Unit
) {
    if (adaptiveManagementPresentation) {
        val body: @Composable () -> Unit = {
            MainMatchActionPanel(match.id, match.poolAwareLabel, onDismiss) {
                    MatchRow(
                        match = match,
                        gameTitle = tournament.game,
                        timeoutMinutes = tournament.callTimeoutMinutes,
                        stationValue = stationValue,
                        availableSetups = availableSetups,
                        enabled = enabled,
                        isStartggMirrored = tournament.isStartggMirrored,
                        onStationChange = onStationChange,
                        onCall = onCall,
                        onCancelCall = onCancelCall,
                        onStart = onStart,
                        supportsCharacterReporting = tournament.supportsSmashCharacterReporting,
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
        if (inline) body() else DialogWindow(onCloseRequest = onDismiss, title = match.poolAwareLabel,
            state = rememberDialogState(size = DpSize(640.dp, 800.dp))) {
            MainTheme(LocalMainAppearance.current) { body() }
        }
        return
    }
    DialogWindow(
        onCloseRequest = onDismiss,
        title = "Operativa moderna · ${match.poolAwareLabel}",
        resizable = true,
        state = rememberDialogState(size = DpSize(760.dp, 900.dp))
    ) {
        MainTheme(LocalMainAppearance.current) {
            Surface {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(18.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text("Acciones del match", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("Usa la misma operativa clasica, pero abierta desde la bracket moderna.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    MatchRow(
                        match = match,
                        gameTitle = tournament.game,
                        timeoutMinutes = tournament.callTimeoutMinutes,
                        stationValue = stationValue,
                        availableSetups = availableSetups,
                        enabled = enabled,
                        isStartggMirrored = tournament.isStartggMirrored,
                        onStationChange = onStationChange,
                        onCall = onCall,
                        onCancelCall = onCancelCall,
                        onStart = onStart,
                        supportsCharacterReporting = tournament.supportsSmashCharacterReporting,
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
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        Button(onClick = onDismiss) { Text("Cerrar") }
                    }
                }
            }
        }
    }
}

private fun roundTitle(stage: String, round: Int, totalRounds: Int): String {
    val prefix = when (stage) {
        "POOLS" -> "Pools"
        "WINNERS" -> "Winners"
        "LOSERS" -> "Losers"
        "FINALS" -> "Grand Final"
        else -> "Ronda"
    }
    if (stage == "FINALS") return if (round > 1) "Grand Final Reset" else prefix
    return when {
        round == totalRounds && totalRounds > 1 && stage == "WINNERS" -> "$prefix Final"
        round == totalRounds - 1 && totalRounds > 2 && stage == "WINNERS" -> "$prefix Semifinal"
        else -> "$prefix Round $round"
    }
}

private fun stageTitle(stage: String): String = when (stage.uppercase()) {
    "POOLS" -> "Pools"
    "WINNERS" -> "Winners bracket"
    "LOSERS" -> "Losers bracket"
    "FINALS" -> "Bracket final"
    else -> stage.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
}

private fun isDormantGrandFinalReset(
    allMatches: List<DesktopMatchSummary>,
    match: DesktopMatchSummary,
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
        match.scores.any { it > 0 }
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

private fun computeRemainingSeconds(calledAt: String?, timeoutMinutes: Int, nowMillis: Long): Long {
    if (calledAt == null) return 0L
    val calledInstant = runCatching { Instant.parse(calledAt) }.getOrNull() ?: return 0L
    val expireInstant = calledInstant.plus(Duration.ofMinutes(timeoutMinutes.toLong()))
    return Duration.between(Instant.ofEpochMilli(nowMillis), expireInstant).seconds
}

private fun computeElapsedSeconds(startedAt: String?, nowMillis: Long): Long {
    if (startedAt == null) return 0L
    val startedInstant = runCatching { Instant.parse(startedAt) }.getOrNull() ?: return 0L
    return maxOf(0L, Duration.between(startedInstant, Instant.ofEpochMilli(nowMillis)).seconds)
}

private fun formatTimer(seconds: Long): String {
    val safe = if (seconds < 0) 0 else seconds
    return "%02d:%02d".format(safe / 60, safe % 60)
}

private fun formatElapsedTimer(seconds: Long): String {
    val safe = if (seconds < 0) 0 else seconds
    val minutes = safe / 60
    val secs = safe % 60
    return "%02d:%02d".format(minutes, secs)
}

private fun isTournamentStarted(status: String): Boolean {
    return status == "IN_PROGRESS" || status == "IN PROGRESS" || status == "COMPLETED"
}

@Composable
fun CardSection(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Card(modifier = modifier, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(22.dp), border = surfaceCardBorder()) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CreateTournamentDialog(onDismiss: () -> Unit, onCreate: (CreateTournamentInput) -> Unit) {
    var title by remember { mutableStateOf("") }
    var gameTitle by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var platform by remember { mutableStateOf("PC / Consola") }
    var maxParticipants by remember { mutableStateOf("16") }
    var fortniteLobbySize by remember { mutableStateOf(20) }
    var fortniteGamesPerRound by remember { mutableStateOf(3) }
    var teamSize by remember { mutableStateOf(1) }
    var reserveCount by remember { mutableStateOf(0) }
    var allowSoloRegistration by remember { mutableStateOf(false) }
    var bracketMode by remember { mutableStateOf("STANDARD") }
    var format by remember { mutableStateOf("SINGLE_ELIMINATION") }
    var mkartAdvanceCount by remember { mutableStateOf("1") }
    var mkartLosersAdvanceCount by remember { mutableStateOf("1") }
    var winnersBestOf by remember { mutableStateOf("3") }
    var losersBestOf by remember { mutableStateOf("3") }
    var seedingMethod by remember { mutableStateOf("MANUAL") }
    var callTimeout by remember { mutableStateOf("10") }
    var setupCount by remember { mutableStateOf("1") }
    var streamCountText by remember { mutableStateOf("0") }
    var playAreaName by remember { mutableStateOf("") }
    DialogWindow(
        onCloseRequest = onDismiss,
        title = "Nuevo torneo",
        resizable = true,
        state = rememberDialogState(size = DpSize(860.dp, 820.dp))
    ) {
        MainTheme(LocalMainAppearance.current) {
            Surface {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(22.dp)
                        .widthIn(max = 920.dp).fillMaxWidth()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text("Crear torneo", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    FormField(title, { title = it }, "Nombre del torneo")
                    LocalTournamentKind(if (teamSize > 1) "TEAMS" else bracketMode) { type ->
                        teamSize = if (type == "TEAMS") teamSize.takeIf { it > 1 } ?: 5 else 1
                        if (type != "TEAMS") { reserveCount = 0; allowSoloRegistration = false }
                        bracketMode = if (type == "TEAMS") "STANDARD" else type
                        if (type == "FORTNITE" && gameTitle.isBlank()) gameTitle = "Fortnite"
                    }
                    FormField(gameTitle, { gameTitle = it }, "Videojuego")
                    FormField(description, { description = it }, "Descripcion", 3)
                    FormField(platform, { platform = it }, "Plataforma")
                    if (bracketMode == "FORTNITE") FortniteConfiguration(fortniteLobbySize, fortniteGamesPerRound) { size, games -> fortniteLobbySize = size; fortniteGamesPerRound = games }
                    if (teamSize > 1) TeamConfigurationFields(teamSize, reserveCount, allowSoloRegistration, showToggle = false) { size, reserves, solo ->
                        teamSize = size; reserveCount = reserves; allowSoloRegistration = solo
                        if (size > 1) bracketMode = "STANDARD"
                    }
                    FormField(maxParticipants, { maxParticipants = it.filter(Char::isDigit) }, if (teamSize > 1) "Máximo de equipos" else "Maximo de participantes")
                    if (bracketMode != "FORTNITE") {
SegmentedChoiceRow("Formato", listOf("SINGLE_ELIMINATION" to "Elim. simple", "DOUBLE_ELIMINATION" to "Doble elim."), format) { format = it }
                    if (bracketMode == "MKART") {
                        SegmentedChoiceRow("Bracket principal", listOf("1" to "MKART pasa 1", "2" to "MKART pasa 2"), mkartAdvanceCount) { mkartAdvanceCount = it }
                        if (format == "DOUBLE_ELIMINATION") {
                            SegmentedChoiceRow("Bracket de repesca", listOf("1" to "MKART pasa 1", "2" to "MKART pasa 2"), mkartLosersAdvanceCount) { mkartLosersAdvanceCount = it }
                        }
                    } else if (format == "DOUBLE_ELIMINATION") {
                        SegmentedChoiceRow("Serie winners", listOf("1" to "Bo1", "3" to "Bo3", "5" to "Bo5"), winnersBestOf) { winnersBestOf = it }
                        SegmentedChoiceRow("Serie losers", listOf("1" to "Bo1", "3" to "Bo3", "5" to "Bo5"), losersBestOf) { losersBestOf = it }
                    } else {
                        SegmentedChoiceRow("Serie", listOf("1" to "Bo1", "3" to "Bo3", "5" to "Bo5"), winnersBestOf) { winnersBestOf = it }
                    }
                    SegmentedChoiceRow("Seeding", listOf("MANUAL" to "Manual", "RANDOM" to "Aleatorio"), seedingMethod) { seedingMethod = it }
}
                    FormField(callTimeout, { callTimeout = it.filter(Char::isDigit) }, "Minutos para llamada")
                    FormField(setupCount, { setupCount = it.filter(Char::isDigit) }, "Numero de setups")
                    SegmentedChoiceRow("Stream", listOf("0" to "Sin stream", "1" to "1 stream", "2" to "2 streams"), streamCountText) { streamCountText = it }
                    FormField(playAreaName, { playAreaName = it.take(80) }, "Zona de juego (opcional)")
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = onDismiss) { Text("Cancelar") }
                        Spacer(Modifier.size(8.dp))
                        Button(onClick = {
                            val winners = winnersBestOf.toIntOrNull() ?: 3
                            onCreate(
                                CreateTournamentInput(
                                    title = title.ifBlank { "Nuevo torneo" },
                                    gameTitle = gameTitle.ifBlank { "Videojuego" },
                                    description = description.ifBlank { "Torneo privado" },
                                    platform = platform.ifBlank { "PC / Consola" },
                                    maxParticipants = maxParticipants.toIntOrNull() ?: 16,
                                    fortniteLobbySize = fortniteLobbySize, fortniteGamesPerRound = fortniteGamesPerRound,
                                    teamSize = teamSize,
                                    reserveCount = reserveCount,
                                    allowSoloRegistration = allowSoloRegistration,
                                    format = format,
                                    bracketMode = bracketMode,
                                    mkartAdvanceCount = mkartAdvanceCount.toIntOrNull() ?: 1,
                                    mkartLosersAdvanceCount = if (format == "DOUBLE_ELIMINATION") {
                                        mkartLosersAdvanceCount.toIntOrNull() ?: (mkartAdvanceCount.toIntOrNull() ?: 1)
                                    } else {
                                        mkartAdvanceCount.toIntOrNull() ?: 1
                                    },
                                    bestOf = winners,
                                    winnersBestOf = winners,
                                    losersBestOf = losersBestOf.toIntOrNull() ?: winners,
                                    seedingMethod = seedingMethod,
                                    callTimeoutMinutes = callTimeout.toIntOrNull() ?: 10,
                                    setupCount = setupCount.toIntOrNull() ?: 1,
                                    streamCount = streamCountText.toIntOrNull() ?: 0,
                                    playAreaName = playAreaName.trim().takeIf { it.isNotEmpty() }
                                )
                            )
                        }) { Text("Crear") }
                    }
                }
            }
        }
    }
}

@Composable
fun CreateStartggTournamentDialog(
    onDismiss: () -> Unit,
    onPreview: (String, (DesktopStartggPreview) -> Unit, (String) -> Unit) -> Unit,
    onCreate: (String, Int, Int, Int) -> Unit
) {
    var eventUrl by remember { mutableStateOf("") }
    var callTimeout by remember { mutableStateOf("10") }
    var setupCount by remember { mutableStateOf("1") }
    var streamCountText by remember { mutableStateOf("0") }
    var preview by remember { mutableStateOf<DesktopStartggPreview?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    DialogWindow(
        onCloseRequest = onDismiss,
        title = "Nuevo torneo start.gg",
        resizable = true,
        state = rememberDialogState(size = DpSize(920.dp, 860.dp))
    ) {
        MainTheme(LocalMainAppearance.current) {
            Surface {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(22.dp)
                        .widthIn(max = 920.dp).fillMaxWidth()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text("Nuevo torneo start.gg", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("Crea un torneo espejo de start.gg. Solo necesitas el link del event, el tiempo de llamada y el numero de setups.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    FormField(eventUrl, { eventUrl = it }, "URL del event de start.gg", 3)
                    FormField(callTimeout, { callTimeout = it.filter(Char::isDigit) }, "Minutos para llamada")
                    FormField(setupCount, { setupCount = it.filter(Char::isDigit) }, "Numero de setups")
                    SegmentedChoiceRow("Stream", listOf("0" to "Sin stream", "1" to "1 stream", "2" to "2 streams"), streamCountText) { streamCountText = it }
                    Text("La importacion continuara en el servidor hasta terminar.")
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = onDismiss, enabled = !loading) { Text("Cancelar") }
                        Spacer(Modifier.size(8.dp))
                        Button(
                            onClick = { onCreate(eventUrl.trim(), callTimeout.toIntOrNull() ?: 10, setupCount.toIntOrNull() ?: 1, streamCountText.toIntOrNull() ?: 0) },
                            enabled = eventUrl.isNotBlank() && !loading
                        ) {
                            Text("Crear torneo start.gg")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ConfirmActionDialog(
    title: String,
    message: String,
    confirmLabel: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    DialogWindow(
        onCloseRequest = onDismiss,
        title = title,
        resizable = true,
        state = rememberDialogState(size = DpSize(620.dp, 360.dp))
    ) {
        MainTheme(LocalMainAppearance.current) {
            Surface {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(22.dp)
                        .widthIn(max = 720.dp).fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = onDismiss) { Text("Cancelar") }
                        Spacer(Modifier.size(8.dp))
                        Button(onClick = onConfirm) { Text(confirmLabel) }
                    }
                }
            }
        }
    }
}

@Composable
fun StartggImportDialog(
    onDismiss: () -> Unit,
    onPreview: (String, (DesktopStartggPreview) -> Unit, (String) -> Unit) -> Unit,
    onImport: (String) -> Unit
) {
    var eventUrl by remember { mutableStateOf("") }
    var preview by remember { mutableStateOf<DesktopStartggPreview?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    DialogWindow(
        onCloseRequest = onDismiss,
        title = "Importar desde start.gg",
        resizable = true,
        state = rememberDialogState(size = DpSize(920.dp, 860.dp))
    ) {
        MainTheme(LocalMainAppearance.current) {
            Surface {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(22.dp)
                        .widthIn(max = 920.dp).fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text("Importar desde start.gg", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("Pega el link del event de start.gg para traer jugadores y seeds publicos.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    FormField(eventUrl, { eventUrl = it }, "URL del event", 2)
                    Text("Puedes cerrar la ventana: la importacion continuara en el servidor.")
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = onDismiss, enabled = !loading) { Text("Cancelar") }
                        Spacer(Modifier.size(8.dp))
                        Button(
                            onClick = { onImport(eventUrl.trim()) },
                            enabled = eventUrl.isNotBlank() && !loading
                        ) { Text("Importar") }
                    }
                }
            }
        }
    }
}

@Composable
private fun surfaceCardBorder(): BorderStroke = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)

private fun isPlaceholderParticipantId(participantId: String): Boolean {
    return participantId.startsWith("winner_of_")
        || participantId.startsWith("loser_of_")
        || participantId.startsWith("advance_")
        || participantId.startsWith("drop_")
}

private fun hasResolvedContenders(match: DesktopMatchSummary): Boolean {
    return match.participantIds.size >= 2
        && match.participantNames.size >= 2
        && match.participantIds.all { it.isNotBlank() && !isPlaceholderParticipantId(it) }
}

private fun isDesktopOperationalMatch(match: DesktopMatchSummary, tournamentStarted: Boolean): Boolean {
    if (!tournamentStarted) return false
    if (!hasResolvedContenders(match)) return false
    return match.status != "CANCELLED"
}

private fun matchMatchesPlayerQuery(match: DesktopMatchSummary, query: String): Boolean {
    val normalizedQuery = query.trim().lowercase()
    if (normalizedQuery.isBlank()) {
        return true
    }
    return match.participantNames.any { participantName ->
        participantName.lowercase().contains(normalizedQuery)
    } || match.poolAwareLabel.lowercase().contains(normalizedQuery)
}

private enum class DesktopNaturalLabelPartType {
    Number,
    Text
}

private data class DesktopNaturalLabelPart(
    val type: DesktopNaturalLabelPartType,
    val text: String,
    val number: Int? = null
)

private fun naturalLabelParts(value: String): List<DesktopNaturalLabelPart> {
    val regex = Regex("\\d+|\\D+")
    return regex.findAll(value).map { match ->
        val chunk = match.value
        val number = chunk.trim().toIntOrNull()
        if (number != null) {
            DesktopNaturalLabelPart(DesktopNaturalLabelPartType.Number, chunk, number)
        } else {
            DesktopNaturalLabelPart(DesktopNaturalLabelPartType.Text, chunk)
        }
    }.toList()
}

private fun naturalLabelLessThan(left: String, right: String): Boolean {
    val leftParts = naturalLabelParts(left)
    val rightParts = naturalLabelParts(right)
    val count = minOf(leftParts.size, rightParts.size)
    for (index in 0 until count) {
        val leftPart = leftParts[index]
        val rightPart = rightParts[index]
        if (leftPart == rightPart) {
            continue
        }
        if (leftPart.type != rightPart.type) {
            return leftPart.type == DesktopNaturalLabelPartType.Number
        }
        if (leftPart.type == DesktopNaturalLabelPartType.Number) {
            return (leftPart.number ?: 0) < (rightPart.number ?: 0)
        }
        return leftPart.text.lowercase() < rightPart.text.lowercase()
    }
    return leftParts.size < rightParts.size
}

private fun activeMatchPriority(match: DesktopMatchSummary): Int = when (match.status.uppercase()) {
    "PLAYING" -> 0
    "CALLED" -> 1
    "CHECKED_IN" -> 2
    "PENDING" -> 3
    else -> 4
}

private fun activeMatchTimelineAnchor(match: DesktopMatchSummary): Long? {
    return match.startedAt?.let(::parseIsoMillis)
        ?: match.calledAt?.let(::parseIsoMillis)
}

private fun parseIsoMillis(value: String): Long? = runCatching {
    java.time.Instant.parse(value).toEpochMilli()
}.getOrNull()

private data class DesktopTournamentSetupStatus(
    val label: String,
    val occupyingMatchLabel: String? = null,
    val occupyingParticipants: String? = null
)

private fun buildTournamentSetups(tournament: DesktopTournamentDetail): List<DesktopTournamentSetupStatus> {
    val occupiedBySetup = tournament.matches
        .filter { isSetupOccupyingMatch(it) }
        .mapNotNull { match ->
            normalizeSetupLabel(match.stationLabel)?.let { setupLabel ->
                setupLabel to DesktopTournamentSetupStatus(
                    label = setupLabel,
                    occupyingMatchLabel = match.poolAwareLabel,
                    occupyingParticipants = match.participantsLabel
                )
            }
        }
        .toMap()

    return tournamentStationLabels(tournament.setupCount, tournament.streamCount).map { label ->
        occupiedBySetup[label] ?: DesktopTournamentSetupStatus(label = label)
    }
}

private fun availableSetupLabelsForMatch(tournament: DesktopTournamentDetail, targetMatch: DesktopMatchSummary): List<String> {
    val occupiedSetups = tournament.matches
        .asSequence()
        .filter { it.id != targetMatch.id }
        .filter { isSetupOccupyingMatch(it) }
        .mapNotNull { normalizeSetupLabel(it.stationLabel) }
        .toSet()
    return tournamentStationLabels(tournament.setupCount, tournament.streamCount)
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

private fun isSetupOccupyingMatch(match: DesktopMatchSummary): Boolean {
    return normalizeSetupLabel(match.stationLabel) != null && when (match.status) {
        "CALLED", "CHECKED_IN", "PLAYING", "RESULT_REPORTED", "UNDER_REVIEW" -> true
        else -> false
    }
}
