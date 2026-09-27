package com.gestortorneos.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

data class TournamentReviewData(val title: String, val phase: String, val checkedAt: String,
    val items: List<TournamentReviewItem>, val standings: List<TournamentReviewStanding>, val standingsNote: String,
    val editable: Boolean, val participants: List<TournamentReviewParticipant>)
data class TournamentReviewParticipant(val id: String, val name: String, val checkedIn: Boolean, val status: String)
data class TournamentReviewItem(val id: String, val title: String, val detail: String,
    val level: String, val target: String, val actionLabel: String)
data class TournamentReviewStanding(val name: String, val placement: Int?)

@Composable
fun TournamentReviewButton(tournamentId: String, load: suspend () -> TournamentReviewData,
    onAttendance: suspend (TournamentReviewParticipant, Boolean) -> Unit, onNavigate: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var showAttendance by remember(tournamentId) { mutableStateOf(false) }
    var open by remember(tournamentId) { mutableStateOf(false) }
    var refresh by remember { mutableStateOf(0) }
    var data by remember(tournamentId) { mutableStateOf<TournamentReviewData?>(null) }
    var error by remember(tournamentId) { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val currentLoad by rememberUpdatedState(load)
    OutlinedButton(onClick = { open = true }, modifier = Modifier.heightIn(min = 48.dp)) {
        Text("Revisar preparación y cierre")
    }
    if (open) {
        LaunchedEffect(tournamentId, refresh) {
            loading = true; error = null
            try { data = currentLoad() }
            catch (e: CancellationException) { throw e }
            catch (_: Exception) { error = "No se pudo comprobar el torneo. Actualiza para reintentar; no se ha cambiado ningún dato." }
            finally { loading = false }
        }
        AlertDialog(onDismissRequest = { open = false }, title = { Text(data?.title ?: "Revisión del torneo") },
            text = {
                Column(Modifier.fillMaxWidth().heightIn(max = 560.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    data?.let { review ->
                        Text("Revisión orientativa. Los controles vuelven a validar los datos al guardar.", style = MaterialTheme.typography.bodySmall)
                        review.items.forEach { item ->
                            val label = when (item.level) { "OK" -> "✓ Correcto"; "BLOCKED" -> "! Pendiente"; "WARNING" -> "△ Revisar"; else -> "ⓘ Información" }
                            Text("$label · ${item.title}", style = MaterialTheme.typography.titleSmall,
                                color = if (item.level == "BLOCKED") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
                            Text(item.detail, style = MaterialTheme.typography.bodyMedium)
                            if (item.target.isNotBlank()) TextButton(enabled = !loading && error == null && !(item.target == "ARCHIVE" && item.level == "BLOCKED"), onClick = {
                                if (item.id == "attendance") showAttendance = !showAttendance
                                else { open = false; onNavigate(item.target) }
                            }, modifier = Modifier.heightIn(min = 48.dp)) { Text(item.actionLabel) }
                            if (item.id == "attendance" && showAttendance) {
                                Text("Cambiar la asistencia obligatoria puede invalidar un sorteo preparado. Después tendrás que generarlo de nuevo.", style = MaterialTheme.typography.bodySmall)
                                review.participants.forEach { participant ->
                                    Text(participant.name + if (participant.checkedIn) " · ✓ Asistencia confirmada" else " · Sin confirmar")
                                    TextButton(enabled = review.editable && participant.status == "ACTIVE" && !loading && error == null, onClick = {
                                        loading = true
                                        scope.launch {
                                            try { onAttendance(participant, !participant.checkedIn); data = currentLoad() }
                                            catch (e: CancellationException) { throw e }
                                            catch (_: Exception) { error = "No se pudo comprobar la asistencia. Actualiza antes de volver a intentarlo." }
                                            finally { loading = false }
                                        }
                                    }) { Text(if (participant.checkedIn) "Quitar asistencia" else "Confirmar asistencia") }
                                }
                            }
                            HorizontalDivider()
                        }
                        if (review.standings.isNotEmpty()) {
                            Text("Clasificación · Top 8", style = MaterialTheme.typography.titleMedium)
                            review.standings.forEach { Text("${it.placement?.toString() ?: "Por revisar"} · ${it.name}") }
                        }
                        if (review.standingsNote.isNotBlank()) Text(review.standingsNote, style = MaterialTheme.typography.bodySmall)
                        Text("Comprobado: ${review.checkedAt}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = { TextButton(enabled = !loading, onClick = { refresh++ }) { Text("Actualizar") } },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cerrar") } })
    }
}
