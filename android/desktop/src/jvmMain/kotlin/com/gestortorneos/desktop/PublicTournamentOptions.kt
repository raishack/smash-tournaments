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
            Text(if (tournament.isStartggMirrored) "Display web" else "Display and online registration", style = MaterialTheme.typography.titleLarge)
            MainSwitchRow("Show on display", if (tournament.displayEnabled) "Visible on tournament displays" else "Hidden from tournament displays",
                tournament.displayEnabled, enabled) { onUpdate(mapOf("displayEnabled" to it)) }
            if (!tournament.isStartggMirrored) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            MainStatusBadge(if (tournament.registrationEnabled && canOpen) "Registration open" else "Registration closed",
                if (tournament.registrationEnabled && canOpen) "OPEN" else "CLOSED")
            if (!canOpen) Text("Registration remains closed once the bracket is generated.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button(onClick = { onUpdate(mapOf("registrationEnabled" to !tournament.registrationEnabled)) },
                enabled = enabled && (tournament.registrationEnabled || canOpen)) {
                Text(if (tournament.registrationEnabled) "Close registration" else "Open online registration")
            }
            RegistrationAdminButton(tournament.id, if (enabled) adminKey else "")
            Text("Players enter their nickname and email and are added after verification. Registration closes when the bracket is generated.")
            if (!enabled) Text("Wait for the operation to finish before changing these settings.", style = MaterialTheme.typography.bodySmall)
            tournament.registrationUrl?.let { url ->
                SelectionContainer { Text(url) }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { clipboard.setText(AnnotatedString(url)) }) { Text("Copy link") }
                    TextButton(onClick = { uriHandler.openUri(url) }) { Text("Open registration") }
                }
            }
            }
        }
    }
}
