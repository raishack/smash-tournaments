@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.gestortorneos.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.gestortorneos.app.data.TournamentRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class TeamMemberMeta(val captain: Boolean = false, val gameId: String? = null, val preferredRole: String? = null)
data class TeamMember(val id: String, val nickname: String, val teamId: String?, val role: String, val revision: Int, val meta: TeamMemberMeta? = null)
data class RosterTeam(val id: String, val name: String, val code: String, val members: List<TeamMember>, val checkedIn: Boolean = false, val complete: Boolean = false)
data class TeamRoster(val teamSize: Int, val reserveCount: Int, val allowSoloRegistration: Boolean, val canEdit: Boolean, val teams: List<RosterTeam>, val unassigned: List<TeamMember>)

@Composable
fun TeamConfigurationFields(size: Int, reserves: Int, solo: Boolean, showToggle: Boolean = true, onChange: (Int, Int, Boolean) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (showToggle) Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Switch(checked = size > 1, onCheckedChange = { onChange(if (it) 5 else 1, 0, false) })
            Text("Torneo por equipos")
        }
        if (size > 1) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                OutlinedButton(onClick = { onChange(size - 1, reserves, solo) }, enabled = size > 2) { Text("−") }
                Text("$size titulares", modifier = Modifier.weight(1f))
                OutlinedButton(onClick = { onChange(size + 1, reserves, solo) }, enabled = size < 20) { Text("+") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                OutlinedButton(onClick = { onChange(size, reserves - 1, solo) }, enabled = reserves > 0) { Text("−") }
                Text("Hasta $reserves reservas", modifier = Modifier.weight(1f))
                OutlinedButton(onClick = { onChange(size, reserves + 1, solo) }, enabled = reserves < 20) { Text("+") }
            }
            Row { Switch(checked = solo, onCheckedChange = { onChange(size, reserves, it) }); Text("Admitir jugadores sin equipo") }
            Text("El aforo cuenta equipos. Cada equipo debe completar sus titulares antes de generar la bracket.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun RosterChoice(label: String, value: String, options: List<Pair<String, String>>, onChange: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }) { Text("$label: ${options.find { it.first == value }?.second ?: "Seleccionar"}") }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.heightIn(max = 320.dp)) {
            options.forEach { (key, text) -> DropdownMenuItem(text = { Text(text) }, onClick = { onChange(key); open = false }) }
        }
    }
}

@Composable
fun TeamRosterPanel(tournamentId: String, onChanged: () -> Unit = {}) {
    val repository = remember { TournamentRepository() }
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var data by remember(tournamentId) { mutableStateOf<TeamRoster?>(null) }
    var busy by remember(tournamentId) { mutableStateOf(false) }
    var generation by remember(tournamentId) { mutableStateOf(0) }
    var error by remember(tournamentId) { mutableStateOf<String?>(null) }
    var expanded by remember(tournamentId) { mutableStateOf(setOf<String>()) }
    var selected by remember(tournamentId) { mutableStateOf(setOf<String>()) }
    var name by remember(tournamentId) { mutableStateOf("") }
    var nick by remember(tournamentId) { mutableStateOf("") }
    var addTeam by remember(tournamentId) { mutableStateOf("") }
    var addRole by remember(tournamentId) { mutableStateOf("PLAYER") }
    var moving by remember(tournamentId) { mutableStateOf<TeamMember?>(null) }
    var removing by remember(tournamentId) { mutableStateOf<TeamMember?>(null) }
    var target by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("PLAYER") }
    suspend fun refresh() {
        val currentGeneration = generation
        try { val refreshed = repository.teamRoster(tournamentId); if (currentGeneration == generation) data = refreshed }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { error = e.message ?: "No se pudieron cargar las plantillas" }
    }
    fun action(body: Map<String, Any?>) {
        if (busy) return
        generation++; busy = true; error = null
        scope.launch {
            try {
                data = repository.teamAction(tournamentId, body); selected = emptySet()
                if (body["action"] == "CREATE_TEAM") name = ""
                if (body["action"] == "ADD_MEMBER") nick = ""
                onChanged()
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { error = e.message ?: "No se pudo guardar"; refresh() }
            finally { busy = false }
        }
    }
    LaunchedEffect(tournamentId) { while (isActive) { if (!busy) refresh(); delay(15000) } }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Equipos y plantillas", style = MaterialTheme.typography.titleLarge)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (data == null) OutlinedButton(onClick = { scope.launch { refresh() } }) { Text("Cargar plantillas") }
            data?.let { roster ->
                val enabled = roster.canEdit && !busy
                val destinations = listOf("" to "Sin equipo") + roster.teams.map { it.id to it.name }
                val roles = if (roster.reserveCount > 0) listOf("PLAYER" to "Titular", "RESERVE" to "Reserva") else listOf("PLAYER" to "Titular")
                Text("${roster.teamSize} titulares · hasta ${roster.reserveCount} reservas por equipo")
                if (!roster.canEdit) Text("Las altas están cerradas. Para cambiar titulares por reservas usa «Inscripciones, lista de espera y sustituciones».")
                Button(onClick = { action(mapOf("action" to "SOLO_OPTION", "enabled" to !roster.allowSoloRegistration)) }, enabled = enabled) {
                    Text(if (roster.allowSoloRegistration) "Deshabilitar inscripción sin equipo" else "Habilitar inscripción sin equipo")
                }
                roster.teams.forEach { team ->
                    OutlinedButton(onClick = { expanded = if (team.id in expanded) expanded - team.id else expanded + team.id }, modifier = Modifier.fillMaxWidth()) {
                        Text("${if (team.id in expanded) "▾" else "▸"} ${team.name} · ${team.members.count { it.role == "PLAYER" }}/${roster.teamSize} titulares · ${team.members.count { it.role == "RESERVE" }}/${roster.reserveCount} reservas")
                    }
                    if (team.id in expanded) {
                        Text("${if (team.complete) "Equipo completo" else "Equipo incompleto"} · ${if (team.checkedIn) "Asistencia confirmada" else "Sin check-in"}")
                        Text("Código: ${team.code}", style = MaterialTheme.typography.bodySmall)
                        OutlinedButton(onClick = { clipboard.setText(AnnotatedString(team.code)) }) { Text("Copiar código de equipo") }
                        team.members.forEach { member ->
                            Text("${member.nickname} · ${if (member.role == "RESERVE") "Reserva" else "Titular"}")
                            Text(listOfNotNull(if (member.meta?.captain == true) "Capitán" else null, member.meta?.gameId, member.meta?.preferredRole).filter { it.isNotBlank() }.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                            if (enabled) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                OutlinedButton(onClick = { moving = member; target = member.teamId.orEmpty(); role = member.role }) { Text("Mover / cambiar plaza") }
                                TextButton(onClick = { removing = member }) { Text("Retirar") }
                            }
                        }
                    }
                }
                Text("Sin equipo (${roster.unassigned.size})", style = MaterialTheme.typography.titleMedium)
                Text("Esta lista no ocupa plazas en la bracket. Selecciona jugadores para formar un equipo o asígnalos a uno existente.", style = MaterialTheme.typography.bodySmall)
                roster.unassigned.forEach { member ->
                    Column {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Checkbox(checked = member.id in selected, enabled = enabled, onCheckedChange = { selected = if (it) selected + member.id else selected - member.id })
                            Text(listOfNotNull(member.nickname, member.meta?.gameId, member.meta?.preferredRole).filter { it.isNotBlank() }.joinToString(" · "), modifier = Modifier.weight(1f))
                        }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(enabled = enabled, onClick = { moving = member; target = ""; role = "PLAYER" }) { Text("Asignar") }
                            TextButton(enabled = enabled, onClick = { removing = member }) { Text("Retirar") }
                        }
                    }
                }
                if (roster.canEdit) {
                    OutlinedTextField(value = name, onValueChange = { name = it.take(80) }, label = { Text("Nombre del nuevo equipo") }, modifier = Modifier.fillMaxWidth())
                    Button(enabled = enabled && name.trim().length >= 2 && selected.size <= roster.teamSize, onClick = {
                        action(mapOf("action" to "CREATE_TEAM", "name" to name.trim(), "members" to selected.map { mapOf("id" to it, "role" to "PLAYER") }))
                    }) { Text("Crear equipo · ${selected.size} titulares seleccionados") }
                    Text("Los reservas se pueden asignar después. También puedes crear un equipo vacío y completar su plantilla.", style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(value = nick, onValueChange = { nick = it.take(80) }, label = { Text("Añadir jugador manualmente: nick") }, modifier = Modifier.fillMaxWidth())
                    RosterChoice("Destino", addTeam, destinations) { addTeam = it }
                    if (addTeam.isNotEmpty()) RosterChoice("Plaza", addRole, roles) { addRole = it }
                    Button(enabled = enabled && nick.trim().length >= 2, onClick = { action(mapOf("action" to "ADD_MEMBER", "nickname" to nick.trim(), "teamId" to addTeam.ifEmpty { null }, "role" to addRole)) }) { Text("Añadir jugador a plantilla / lista") }
                }
                moving?.let { member -> AlertDialog(onDismissRequest = { moving = null }, title = { Text(member.nickname) }, text = {
                    Column { RosterChoice("Destino", target, destinations) { target = it }; if (target.isNotEmpty()) RosterChoice("Plaza", role, roles) { role = it } }
                }, confirmButton = { Button(onClick = { action(mapOf("action" to "MOVE_MEMBER", "id" to member.id, "revision" to member.revision, "teamId" to target.ifEmpty { null }, "role" to role)); moving = null }, enabled = enabled) { Text("Guardar asignación") } }, dismissButton = { TextButton(onClick = { moving = null }) { Text("Cancelar") } }) }
                removing?.let { member -> AlertDialog(onDismissRequest = { removing = null }, title = { Text("Retirar a ${member.nickname}") }, text = { Text("Se eliminará su inscripción de la plantilla o lista sin equipo.") }, confirmButton = { Button(onClick = { action(mapOf("action" to "REMOVE_MEMBER", "id" to member.id, "revision" to member.revision)); removing = null }, enabled = enabled) { Text("Retirar") } }, dismissButton = { TextButton(onClick = { removing = null }) { Text("Cancelar") } }) }
            }
        }
    }
}
