package com.gestortorneos.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalUriHandler
import com.gestortorneos.app.data.TournamentRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
fun RegistrationAdminButton(tournamentId: String, adminKey: String) {
    val scope = rememberCoroutineScope()
    val uri = LocalUriHandler.current
    val repository = remember { TournamentRepository() }
    var busy by remember(tournamentId) { mutableStateOf(false) }
    var error by remember(tournamentId) { mutableStateOf<String?>(null) }
    Column {
        Button(enabled = !busy && adminKey.isNotBlank(), onClick = {
            busy = true; error = null
            scope.launch {
                try { uri.openUri(repository.createRegistrationAdminSession(tournamentId, adminKey)) }
                catch (e: CancellationException) { throw e }
                catch (e: Exception) { error = e.message ?: "No se pudo abrir el editor" }
                finally { busy = false }
            }
        }) { Text(if (busy) "Abriendo panel…" else "Inscripciones, lista de espera y sustituciones") }
        Text("Cierre automático, estado de equipos, capitanes y sustitución de reservas.", style = MaterialTheme.typography.bodySmall)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}
