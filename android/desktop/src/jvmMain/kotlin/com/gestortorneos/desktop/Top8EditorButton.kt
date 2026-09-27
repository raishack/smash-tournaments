package com.gestortorneos.desktop

import androidx.compose.foundation.layout.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.material3.*
import com.gestortorneos.ui.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalUriHandler
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
fun Top8EditorButton(tournamentId: String) {
    val scope = rememberCoroutineScope()
    val uri = LocalUriHandler.current
    val repository = remember { DesktopTournamentRepository() }
    var busy by remember(tournamentId) { mutableStateOf(false) }
    var error by remember(tournamentId) { mutableStateOf<String?>(null) }
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            MainStatusBadge("Torneo finalizado", "COMPLETED")
            Text("Comparte los resultados", style = MaterialTheme.typography.titleLarge)
            Button(enabled = !busy, onClick = {
                busy = true; error = null
                scope.launch {
                    try { uri.openUri(repository.createTop8Session(tournamentId)) }
                    catch (e: CancellationException) { throw e }
                    catch (e: Exception) { error = e.message ?: "No se pudo abrir el editor" }
                    finally { busy = false }
                }
            }) { MainBusyLabel(if (busy) "Preparando imagen…" else "Imagen Top 8 · crear / editar", busy) }
            Text("Resultados precargados. Edita jugadores, personajes y diseño, guarda el proyecto y descarga una imagen PNG en 4K u 8K.", style = MaterialTheme.typography.bodySmall)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }
}
