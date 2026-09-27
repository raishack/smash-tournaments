package com.gestortorneos.ui

import androidx.compose.material3.*
import androidx.compose.runtime.*

@Composable
fun TournamentArchiveButton(archived: Boolean, busy: Boolean = false, onConfirm: () -> Unit) {
    var confirm by remember(archived) { mutableStateOf(false) }
    val label = if (archived) "Unarchive tournament" else "Archive tournament"
    OutlinedButton(onClick = { confirm = true }, enabled = !busy) { Text(label) }
    if (confirm) AlertDialog(
        onDismissRequest = { confirm = false },
        title = { Text(label) },
        text = { Text(if (archived) "It will return to Completed and become editable. The display remains disabled until you enable it."
            else "It will move to Archived, disappear from the display and become read-only. You can unarchive it later.") },
        confirmButton = { TextButton(onClick = { confirm = false; onConfirm() }, enabled = !busy) { Text(if (archived) "Unarchive" else "Archive") } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancel") } }
    )
}
