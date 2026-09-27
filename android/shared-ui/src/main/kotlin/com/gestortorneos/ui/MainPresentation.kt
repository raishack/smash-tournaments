package com.gestortorneos.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

// Independent rollback of presentation only. Search and tournament review stay enabled.
const val forceClassicPresentation = false
val adaptiveManagementPresentation: Boolean
    @Composable get() = !forceClassicPresentation && LocalMainAppearance.current.adaptiveLayout

@Composable
fun AdaptiveMatchLayout(hasSelection: Boolean, content: @Composable () -> Unit, actions: @Composable (Boolean) -> Unit, forceDialog: Boolean = false) {
    val currentContent by rememberUpdatedState(content)
    val stableContent = remember { movableContentOf { currentContent() } }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        // Fullscreen owns its surface; actions must appear above it, never behind it.
        val wide = !forceDialog && adaptiveManagementPresentation && maxWidth >= 880.dp * LocalDensity.current.fontScale
        if (wide) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) { stableContent() }
            if (hasSelection) Column(Modifier.width(380.dp * LocalDensity.current.fontScale)) { actions(true) }
        } else {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) { stableContent() }
            if (hasSelection) actions(false)
        }
    }
}

@Composable
fun CompactMatchRow(title: String, names: List<String>, scores: List<Int>, status: String,
    destination: String?, selected: Boolean, onClick: () -> Unit) {
    OutlinedCard(onClick = onClick, modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge)
            names.forEachIndexed { index, name ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(name, Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                    Text(scores.getOrElse(index) { 0 }.toString(), fontWeight = FontWeight.Bold)
                }
            }
            MainStatusBadge(mainStatusLabel(status), status)
            if (!destination.isNullOrBlank()) Text(destination, style = MaterialTheme.typography.bodySmall)
            Text(if (selected) "Open actions" else "View actions ›", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        }
    }
}

class MainPrimaryAction {
    var label by mutableStateOf("")
    var enabled by mutableStateOf(false)
    var invoke: () -> Unit = {}
}
private val LocalMainPrimaryAction = staticCompositionLocalOf<MainPrimaryAction?> { null }

@Composable
fun PublishMatchPrimaryAction(label: String, enabled: Boolean, onClick: () -> Unit) {
    val action = LocalMainPrimaryAction.current
    SideEffect { action?.label = label; action?.enabled = enabled; action?.invoke = onClick }
    DisposableEffect(action) { onDispose { action?.enabled = false; action?.label = ""; action?.invoke = {} } }
}

/** One scrolling body with the primary action always reachable, including large text. */
@Composable
fun MainMatchActionPanel(matchId: String, title: String, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    val action = remember(matchId) { MainPrimaryAction() }
    Surface(Modifier.fillMaxWidth().heightIn(max = 760.dp), shape = MaterialTheme.shapes.large,
        tonalElevation = 3.dp, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                TextButton(onClick = onDismiss) { Text("Close") }
            }
            HorizontalDivider()
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                key(matchId) { CompositionLocalProvider(LocalMainPrimaryAction provides action) { content() } }
            }
            if (action.label.isNotBlank()) {
                HorizontalDivider()
                Button(onClick = { if (action.enabled) action.invoke() }, enabled = action.enabled,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(action.label) }
            }
        }
    }
}
