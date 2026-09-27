package com.gestortorneos.app.ui.tournaments

data class CreateTournamentState(
    val isSaving: Boolean = false,
    val successMessage: String? = null,
    val errorMessage: String? = null
)
