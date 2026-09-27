package com.gestortorneos.app.ui

import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.gestortorneos.app.BuildConfig
import com.gestortorneos.app.data.remote.*
import kotlinx.coroutines.launch

@Composable
fun MatchSyncFeedback(tournamentId: String, matchId: String, status: MatchSyncStatus?, enabled: Boolean) {
    if (status == null) return
    val scope = rememberCoroutineScope()
    var sending by remember(matchId) { mutableStateOf(false) }
    var feedback by remember(matchId, status) { mutableStateOf<String?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(status.message, color = if (status.state == "FAILED") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
        status.error?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        feedback?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        if (status.canRetry) OutlinedButton(enabled = enabled && !sending, onClick = {
            sending = true
            scope.launch {
                runCatching { NetworkModule.tournamentApi.retrySync(tournamentId, matchId) }
                    .onSuccess { feedback = "Reintento solicitado" }
                    .onFailure { feedback = it.message ?: "No se pudo solicitar el reintento" }
                sending = false
            }
        }) { Text(if (sending) "Solicitando..." else "Reintentar sincronización") }
    }
}

@Composable
fun TournamentActivityButton(tournamentId: String) {
    var open by remember(tournamentId) { mutableStateOf(false) }
    var refresh by remember { mutableStateOf(0) }
    var activity by remember(tournamentId) { mutableStateOf<TournamentActivity?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val context = LocalContext.current
    OutlinedButton(onClick = { open = true }) { Text("Historial y diagnóstico") }
    if (open) {
        LaunchedEffect(tournamentId, refresh) {
            loading = true
            error = null
            runCatching { NetworkModule.tournamentApi.getActivity(tournamentId) }
                .onSuccess { activity = it }
                .onFailure { error = it.message ?: "No se pudo cargar el historial" }
            loading = false
        }
        AlertDialog(onDismissRequest = { open = false }, title = { Text("Historial y diagnóstico") },
            text = {
                Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    OutlinedButton(onClick = {
                            val diagnostic = (activity?.diagnosticText ?: "Diagnóstico del torneo\nTorneo: $tournamentId\nServidor no disponible") + "\n" + OperationNetwork.diagnostics("Android", BuildConfig.VERSION_NAME)
                            val intent = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, diagnostic) }
                            context.startActivity(Intent.createChooser(intent, "Compartir diagnóstico"))
                        }) { Text("Compartir diagnóstico") }
                    activity?.let { data ->
                        if (data.entries.isEmpty()) Text("Todavía no hay operaciones registradas.")
                        data.entries.forEach { entry ->
                            Text(entry.summary, style = MaterialTheme.typography.titleSmall)
                            Text(entry.createdAt + (entry.matchLabel?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodySmall)
                            Text(entry.detail, style = MaterialTheme.typography.bodySmall)
                            HorizontalDivider()
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { refresh++ }, enabled = !loading) { Text("Actualizar") } },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cerrar") } })
    }
}
