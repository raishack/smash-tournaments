package com.gestortorneos.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.util.Locale

@Composable
fun AppUpdateDialog(
    title: String?, currentVersion: String, targetVersion: String,
    notes: String?, changelog: List<String>, required: Boolean,
    state: UpdateDownloadState, installing: Boolean, installHint: String,
    onDownload: () -> Unit, onInstall: () -> Unit, onCancel: () -> Unit, onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (!required && !state.busy && !installing) onDismiss() },
        title = { Text(title ?: "Nueva versión disponible") },
        text = {
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Versión actual: $currentVersion\nNueva versión: $targetVersion")
                if (required) Text("Esta actualización es necesaria para continuar.")
                Text(installHint)
                if (state.busy) {
                    if (state.total > 0) {
                        LinearProgressIndicator(progress = { (state.downloaded.toFloat() / state.total).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                        Text(String.format(Locale.getDefault(), "%d%% · %.1f / %.1f MB", state.downloaded * 100 / state.total, state.downloaded / 1048576.0, state.total / 1048576.0))
                    } else LinearProgressIndicator(Modifier.fillMaxWidth())
                    Text(if (state.downloaded == state.total && state.total > 0) "Verificando archivo…" else "Descargando dentro de la app…")
                }
                if (state.file != null) Text("Descarga verificada. Lista para instalar.")
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                notes?.takeIf { it.isNotBlank() }?.let { Text(it) }
                if (changelog.isNotEmpty()) Text(changelog.joinToString("\n") { "• $it" })
            }
        },
        confirmButton = {
            Button(onClick = if (state.file != null) onInstall else onDownload, enabled = !state.busy && !installing) {
                Text(when { installing -> "Abriendo instalador…"; state.file != null -> "Instalar actualización"; state.error != null -> "Reintentar descarga"; else -> "Descargar actualización" })
            }
        },
        dismissButton = {
            if (state.busy) TextButton(onClick = onCancel) { Text("Cancelar descarga") }
            else if (!required && !installing) TextButton(onClick = onDismiss) { Text("Más tarde") }
        },
    )
}
