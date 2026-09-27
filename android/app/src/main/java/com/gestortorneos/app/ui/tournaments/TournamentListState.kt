package com.gestortorneos.app.ui.tournaments

import com.gestortorneos.app.ui.TournamentSummary

data class TournamentListState(
    val isLoading: Boolean = true,
    val tournaments: List<TournamentSummary> = emptyList(),
    val errorMessage: String? = null
)
