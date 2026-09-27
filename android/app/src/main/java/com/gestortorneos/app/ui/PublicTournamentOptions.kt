@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.gestortorneos.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import com.gestortorneos.ui.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp

@Composable
fun PublicTournamentOptions(detail: TournamentDetail, enabled: Boolean, adminKey: String, onUpdate: (Map<String, Boolean>) -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val clipboard = LocalClipboardManager.current
    val uriHandler = LocalUriHandler.current
    val canOpen = detail.matches.isEmpty() && detail.status in listOf("DRAFT", "PUBLISHED", "CHECK_IN")
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(if (detail.isStartggMirrored) "Display web" else "Display e inscripción online", style = MaterialTheme.typography.titleMedium)
            MainSwitchRow("Mostrar en el display", if (detail.displayEnabled) "Visible en las pantallas del torneo" else "Oculto en las pantallas del torneo",
                detail.displayEnabled, enabled) { onUpdate(mapOf("displayEnabled" to it)) }
            if (!detail.isStartggMirrored) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            MainStatusBadge(if (detail.registrationEnabled && canOpen) "Inscripción abierta" else "Inscripción cerrada",
                if (detail.registrationEnabled && canOpen) "OPEN" else "CLOSED")
            if (!canOpen) Text("Con la bracket generada las inscripciones permanecen cerradas.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button(onClick = { onUpdate(mapOf("registrationEnabled" to !detail.registrationEnabled)) },
                enabled = enabled && (detail.registrationEnabled || canOpen)) {
                Text(if (detail.registrationEnabled) "Cerrar inscripción" else "Abrir inscripción online")
            }
            RegistrationAdminButton(detail.id, if (enabled) adminKey else "")
            Text("El jugador indica nick y correo y se añade después de verificarlo. La inscripción se cierra al generar la bracket.", style = MaterialTheme.typography.bodySmall)
            if (!enabled) Text("Para cambiar estas opciones, inicia sesión y espera a que termine cualquier operación.", style = MaterialTheme.typography.bodySmall)
            detail.registrationUrl?.let { url ->
                SelectionContainer { Text(url, style = MaterialTheme.typography.bodySmall) }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { clipboard.setText(AnnotatedString(url)) }) { Text("Copiar enlace") }
                    TextButton(onClick = { uriHandler.openUri(url) }) { Text("Abrir ↗") }
                    TextButton(onClick = { context.startActivity(android.content.Intent.createChooser(android.content.Intent(android.content.Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(android.content.Intent.EXTRA_TEXT, url) }, "Compartir inscripción")) }) { Text("Compartir") }
                }
            }
            }
        }
    }
}
