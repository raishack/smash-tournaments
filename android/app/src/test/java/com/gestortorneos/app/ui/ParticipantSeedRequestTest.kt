package com.gestortorneos.app.ui

import com.gestortorneos.app.data.remote.UpdateParticipantRequestDto
import com.google.gson.Gson
import org.junit.Assert.*
import org.junit.Test

class ParticipantSeedRequestTest {
    @Test fun invalidTextNeverBecomesAnUnintendedClear() {
        for (text in listOf("", "  ", "1", "2048", " 4 ")) assertTrue(com.gestortorneos.ui.isValidParticipantSeed(text))
        for (text in listOf("abc", "0", "-1", "2049", "999999999999999999", "1.5")) assertFalse(com.gestortorneos.ui.isValidParticipantSeed(text))
    }
    @Test fun clearingSeedSurvivesGsonNullOmission() {
        val gson = Gson()
        val cleared = gson.toJsonTree(UpdateParticipantRequestDto("Player", null)).asJsonObject
        assertTrue(cleared["clearSeed"].asBoolean)
        assertFalse(cleared.has("seed"))
        val kept = gson.toJsonTree(UpdateParticipantRequestDto("Renamed", 4)).asJsonObject
        assertFalse(kept["clearSeed"].asBoolean)
        assertEquals(4, kept["seed"].asInt)
    }
}
