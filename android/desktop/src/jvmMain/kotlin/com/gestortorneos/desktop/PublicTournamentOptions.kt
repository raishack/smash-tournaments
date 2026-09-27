@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.gestortorneos.desktop

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
fun PublicTournamentOptions(tournament: DesktopTournamentDetail, enabled: Boolean, adminKey: String, onUpdate: (Map<String, Boolean>) -> Unit) {
    val clipboard = LocalClipboardManager.current
    val uriHandler = LocalUriHandler.current
    val canOpen = tournament.matches.isEmpty() && tournament.status in listOf("DRAFT", "PUBLISHED", "CHECK_IN")
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(if (tournament.isStartggMirrored) "Display web" else "Display e inscripción online", style = MaterialTheme.typography.titleLarge)
            MainSwitchRow("Mostrar en el display", if (tournament.displayEnabled) "Visible en las pantallas del torneo" else "Oculto en las pantallas del torneo",
                tournament.displayEnabled, enabled) { onUpdate(mapOf("displayEnabled" to it)) }
            if (!tournament.isStartggMirrored) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            MainStatusBadge(if (tournament.registrationEnabled && canOpen) "Inscripción abierta" else "Inscripción cerrada",
                if (tournament.registrationEnabled && canOpen) "OPEN" else "CLOSED")
            if (!canOpen) Text("Con la bracket generada las inscripciones permanecen cerradas.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button(onClick = { onUpdate(mapOf("registrationEnabled" to !tournament.registrationEnabled)) },
                enabled = enabled && (tournament.registrationEnabled || canOpen)) {
                Text(if (tournament.registrationEnabled) "Cerrar inscripción" else "Abrir inscripción online")
            }
            RegistrationAdminButton(tournament.id, if (enabled) adminKey else "")
            Text("El jugador indica nick y correo y se añade después de verificarlo. La inscripción se cierra al generar la bracket.")
            if (!enabled) Text("Espera a que termine la operación para cambiar estas opciones.", style = MaterialTheme.typography.bodySmall)
            tournament.registrationUrl?.let { url ->
                SelectionContainer { Text(url) }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { clipboard.setText(AnnotatedString(url)) }) { Text("Copiar enlace") }
                    TextButton(onClick = { uriHandler.openUri(url) }) { Text("Abrir registro") }
                }
            }
            }
        }
    }
}
