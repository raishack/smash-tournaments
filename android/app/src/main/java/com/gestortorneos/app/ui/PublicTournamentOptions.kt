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
            Text(if (detail.isStartggMirrored) "Display web" else "Display and online registration", style = MaterialTheme.typography.titleMedium)
            MainSwitchRow("Show on display", if (detail.displayEnabled) "Visible on tournament displays" else "Hidden from tournament displays",
                detail.displayEnabled, enabled) { onUpdate(mapOf("displayEnabled" to it)) }
            if (!detail.isStartggMirrored) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            MainStatusBadge(if (detail.registrationEnabled && canOpen) "Registration open" else "Registration closed",
                if (detail.registrationEnabled && canOpen) "OPEN" else "CLOSED")
            if (!canOpen) Text("Registration remains closed once the bracket is generated.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button(onClick = { onUpdate(mapOf("registrationEnabled" to !detail.registrationEnabled)) },
                enabled = enabled && (detail.registrationEnabled || canOpen)) {
                Text(if (detail.registrationEnabled) "Close registration" else "Open online registration")
            }
            RegistrationAdminButton(detail.id, if (enabled) adminKey else "")
            Text("Players enter their nickname and email and are added after verification. Registration closes when the bracket is generated.", style = MaterialTheme.typography.bodySmall)
            if (!enabled) Text("Sign in and wait for any current operation to finish before changing these settings.", style = MaterialTheme.typography.bodySmall)
            detail.registrationUrl?.let { url ->
                SelectionContainer { Text(url, style = MaterialTheme.typography.bodySmall) }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { clipboard.setText(AnnotatedString(url)) }) { Text("Copy link") }
                    TextButton(onClick = { uriHandler.openUri(url) }) { Text("Open ↗") }
                    TextButton(onClick = { context.startActivity(android.content.Intent.createChooser(android.content.Intent(android.content.Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(android.content.Intent.EXTRA_TEXT, url) }, "Share registration")) }) { Text("Share") }
                }
            }
            }
        }
    }
}
