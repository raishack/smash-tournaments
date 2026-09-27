package com.gestortorneos.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.material3.*
import com.gestortorneos.ui.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalUriHandler
import com.gestortorneos.app.data.TournamentRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
fun Top8EditorButton(tournamentId: String) {
    val scope = rememberCoroutineScope()
    val uri = LocalUriHandler.current
    val repository = remember { TournamentRepository() }
    var busy by remember(tournamentId) { mutableStateOf(false) }
    var error by remember(tournamentId) { mutableStateOf<String?>(null) }
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            MainStatusBadge("Tournament finished", "COMPLETED")
            Text("Share results", style = MaterialTheme.typography.titleLarge)
            Button(enabled = !busy, onClick = {
                busy = true; error = null
                scope.launch {
                    try { uri.openUri(repository.createTop8Session(tournamentId)) }
                    catch (e: CancellationException) { throw e }
                    catch (e: Exception) { error = e.message ?: "Could not open the editor" }
                    finally { busy = false }
                }
            }) { MainBusyLabel(if (busy) "Preparing image…" else "Top 8 image · create / edit", busy) }
            Text("Results prefilled. Edit players, characters and design, save the project and download a 4K or 8K PNG.", style = MaterialTheme.typography.bodySmall)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }
}
