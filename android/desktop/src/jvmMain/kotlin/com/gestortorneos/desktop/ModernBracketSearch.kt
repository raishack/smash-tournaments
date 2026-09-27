package com.gestortorneos.desktop

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp

internal class ModernBracketSearch {
    var query by mutableStateOf("")
    var selectedId by mutableStateOf<String?>(null)
    var focusRequest by mutableStateOf(0)
    var appliedFocusRequest = -1
    val nodes = mutableMapOf<String, LayoutCoordinates>()
    var viewport: LayoutCoordinates? = null
    fun select(id: String?) { selectedId = id; focusRequest++ }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ModernBracketSearchControls(search: ModernBracketSearch, hits: List<DesktopMatchSummary>) {
    val index = hits.indexOfFirst { it.id == search.selectedId }
    fun step(direction: Int) {
        if (hits.isNotEmpty()) search.select(hits[(index + direction + hits.size) % hits.size].id)
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(search.query, { search.query = it.take(120) },
                label = { Text("Buscar jugador o equipo") }, singleLine = true,
                modifier = Modifier.widthIn(max = 400.dp).fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { step(1) }))
            OutlinedButton(onClick = { step(-1) }, enabled = hits.size > 1, modifier = Modifier.heightIn(min = 48.dp)) { Text("Anterior") }
            OutlinedButton(onClick = { step(1) }, enabled = hits.size > 1, modifier = Modifier.heightIn(min = 48.dp)) { Text("Siguiente") }
            TextButton(onClick = { search.query = "" }, enabled = search.query.isNotEmpty(), modifier = Modifier.heightIn(min = 48.dp)) { Text("Limpiar") }
        }
        Text(when {
            search.query.isBlank() -> "Busca en todas las fases de la bracket."
            hits.isEmpty() -> "Sin coincidencias"
            else -> "${index.coerceAtLeast(0) + 1} de ${hits.size} · ${hits.getOrNull(index)?.displayIdentifier.orEmpty()}"
        }, style = MaterialTheme.typography.bodySmall)
    }
}
