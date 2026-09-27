package com.gestortorneos.ui

fun tournamentStationLabels(setupCount: Int, streamCount: Int): List<String> =
    List(setupCount.coerceAtLeast(1)) { "Setup " + (it + 1) } +
        List(streamCount.coerceIn(0, 2)) { "Stream " + (it + 1) }
