package com.gestortorneos.ui

import androidx.compose.material3.*
import androidx.compose.runtime.*

@Composable
fun TournamentArchiveButton(archived: Boolean, busy: Boolean = false, onConfirm: () -> Unit) {
    var confirm by remember(archived) { mutableStateOf(false) }
    val label = if (archived) "Desarchivar torneo" else "Archivar torneo"
    OutlinedButton(onClick = { confirm = true }, enabled = !busy) { Text(label) }
    if (confirm) AlertDialog(
        onDismissRequest = { confirm = false },
        title = { Text(label) },
        text = { Text(if (archived) "Volverá a Finalizado y podrás editarlo. El display seguirá desactivado hasta que lo habilites."
            else "Se moverá a Archivados, dejará de aparecer en el display y quedará en solo lectura. Podrás desarchivarlo después.") },
        confirmButton = { TextButton(onClick = { confirm = false; onConfirm() }, enabled = !busy) { Text(if (archived) "Desarchivar" else "Archivar") } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancelar") } }
    )
}
