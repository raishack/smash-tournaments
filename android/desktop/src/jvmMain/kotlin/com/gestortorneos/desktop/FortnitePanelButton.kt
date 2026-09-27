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
                catch (e: Exception) { error = e.message ?: "Could not open the editor" }
                finally { busy = false }
            }
        }) { Text(if (busy) "Opening Fortnite…" else "Manage Fortnite: groups and scores") }
        Text("Open groups, seats, score sheets and standings. Works on mobile and desktop.", style = MaterialTheme.typography.bodySmall)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
fun FortniteConfiguration(size: Int, games: Int, onChange: (Int, Int) -> Unit) {
    Column {
        FortniteNumber("Participants per group (+ VIP)", size, (5..100 step 5).toList()) { onChange(it, games) }
        FortniteNumber("Games per round (accumulated points)", games, (1..20).toList()) { onChange(size, it) }
        Text("Podium: 10 / 6 / 4 points · Kill: 1 · VIP: 5 extra. External VIP does not occupy a participant seat. Balanced groups.", style = MaterialTheme.typography.bodySmall)
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
