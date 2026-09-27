package com.gestortorneos.app.ui
import androidx.compose.runtime.Composable
import com.gestortorneos.ui.MainTournamentKinds
@Composable
internal fun LocalTournamentKind(selected: String, onSelect: (String) -> Unit) = MainTournamentKinds(selected, onSelect)
