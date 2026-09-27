package com.gestortorneos.desktop

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalUriHandler
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
fun FortnitePanelButton(tournamentId: String) {
    val scope = rememberCoroutineScope()
    val uri = LocalUriHandler.current
    val repository = remember { DesktopTournamentRepository() }
    var busy by remember(tournamentId) { mutableStateOf(false) }
    var error by remember(tournamentId) { mutableStateOf<String?>(null) }
    Column {
        Button(enabled = !busy, onClick = {
            busy = true; error = null
            scope.launch {
                try { uri.openUri(repository.createFortniteSession(tournamentId)) }
                catch (e: CancellationException) { throw e }
                catch (e: Exception) { error = e.message ?: "No se pudo abrir el editor" }
                finally { busy = false }
            }
        }) { Text(if (busy) "Abriendo Fortnite…" else "Gestionar Fortnite: grupos y puntuaciones") }
        Text("Abre el panel de grupos, puestos, actas y clasificación. Adaptado a móvil y PC.", style = MaterialTheme.typography.bodySmall)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
fun FortniteConfiguration(size: Int, games: Int, onChange: (Int, Int) -> Unit) {
    Column {
        FortniteNumber("Participantes por grupo (+ VIP)", size, (5..100 step 5).toList()) { onChange(it, games) }
        FortniteNumber("Partidas por ronda (puntos acumulados)", games, (1..20).toList()) { onChange(size, it) }
        Text("Podio: 10 / 6 / 4 puntos · Kill: 1 · VIP: 5 extra. VIP externo adicional, sin ocupar plaza. Grupos equilibrados.", style = MaterialTheme.typography.bodySmall)
    }
}
@Composable
private fun FortniteNumber(label: String, value: Int, values: List<Int>, onChange: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    androidx.compose.foundation.layout.Box {
        OutlinedButton(onClick = { open = true }) { Text("$label: $value") }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) { values.forEach { number ->
            DropdownMenuItem(text = { Text(number.toString()) }, onClick = { onChange(number); open = false })
        } }
    }
}
