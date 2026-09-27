package com.gestortorneos.ui

/** A blank field removes the seed; malformed or oversized input must never do so. */
fun isValidParticipantSeed(text: String): Boolean =
    text.isBlank() || text.trim().toIntOrNull()?.let { it in 1..2048 } == true
