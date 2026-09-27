@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package com.gestortorneos.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun MainStatusBadge(label: String, state: String = "") {
    val success = state in listOf("COMPLETED", "WALKOVER", "VISIBLE", "OPEN")
    val active = state in listOf("PLAYING", "IN_PROGRESS", "IN PROGRESS", "CALLED", "READY")
    val colors = MaterialTheme.colorScheme
    Surface(color = if (success) MainPalette.successContainer else if (active) colors.primaryContainer else colors.surfaceVariant,
        contentColor = if (success) MainPalette.success else if (active) colors.onPrimaryContainer else colors.onSurfaceVariant,
        shape = RoundedCornerShape(8.dp)) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (success) "✓" else if (active) "●" else "○", style = MaterialTheme.typography.labelMedium)
            Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
fun MainSectionHeading(title: String, description: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        description?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
fun MainBusyLabel(text: String, busy: Boolean) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = LocalContentColor.current)
        Text(text)
    }
}

@Composable
fun MainDangerButton(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(onClick, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = if (enabled) .45f else .15f))) { Text(text) }
}

@Composable
fun MainSwitchRow(title: String, description: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().toggleable(checked, enabled = enabled, role = Role.Switch, onValueChange = onChange).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked, onCheckedChange = null, enabled = enabled)
    }
}

@Composable
fun MainTournamentSummary(title: String, subtitle: String, status: String, statusLabel: String, count: String, nextStep: String?) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                MainStatusBadge(statusLabel, status)
                Text(count, modifier = Modifier.padding(vertical = 6.dp), style = MaterialTheme.typography.labelLarge)
            }
            nextStep?.let {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
fun MainTournamentKinds(selected: String, onSelect: (String) -> Unit) {
    val options = listOf(
        Triple("STANDARD", "Individual", "Bracket de eliminación simple o doble."),
        Triple("TEAMS", "Por equipos · LoL / Valorant", "Titulares, reservas y jugadores que buscan equipo."),
        Triple("FORTNITE", "Fortnite", "Grupos, partidas y puntos acumulados. VIP externo."),
        Triple("MKART", "Mario Kart", "Varios jugadores por carrera y plazas de clasificación.")
    )
    Column(Modifier.fillMaxWidth().selectableGroup(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        MainSectionHeading("Tipo de torneo", "Elige cómo van a competir los participantes.")
        BoxWithConstraints {
            val columns = if (maxWidth >= 620.dp) 2 else 1
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                options.chunked(columns).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { (value, title, description) ->
                            val chosen = selected == value
                            Surface(Modifier.weight(1f), shape = RoundedCornerShape(16.dp),
                                color = if (chosen) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                                border = BorderStroke(if (chosen) 2.dp else 1.dp, if (chosen) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)) {
                                Row(Modifier.selectable(chosen, role = Role.RadioButton, onClick = { onSelect(value) }).padding(14.dp),
                                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    RadioButton(chosen, onClick = null)
                                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(title, style = MaterialTheme.typography.titleSmall)
                                        Text(description, style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun MainAdaptivePair(first: @Composable () -> Unit, second: @Composable () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        if (maxWidth >= 760.dp) Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.weight(1f)) { first() }
            Box(Modifier.weight(1f)) { second() }
        } else Column(verticalArrangement = Arrangement.spacedBy(16.dp)) { first(); second() }
    }
}

@Composable
fun MainOtherActions(content: @Composable ColumnScope.() -> Unit) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "Ocultar otras acciones  −" else "Otras acciones  +") }
        if (expanded) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
        }
    }
}
