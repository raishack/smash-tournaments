package com.gestortorneos.app.ui.tournaments

import com.gestortorneos.app.ui.TournamentDetail

data class TournamentDetailState(
    val isLoading: Boolean = true,
    val detail: TournamentDetail? = null,
    val errorMessage: String? = null,
    val isMutating: Boolean = false
)
