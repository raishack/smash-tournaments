package com.gestortorneos.app.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import com.gestortorneos.ui.*
import java.io.File
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w420dp-h900dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ManagementUsabilityTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun capture(name: String) {
        compose.waitForIdle()
        compose.runOnIdle {
            val view = compose.activity.findViewById<View>(android.R.id.content)
            val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            view.draw(Canvas(bitmap))
            val dir = File("../../build/usability-review/screenshots").apply { mkdirs() }
            File(dir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }
    @Test fun primaryActionStaysReachableAndUsesLatestEnabledStateWithLargeText() {
        var busy by mutableStateOf(false)
        var clicks = 0
        var dark by mutableStateOf(true)
        compose.setContent {
            MainTheme(MainAppearance(theme = if (dark) MainThemeMode.Dark else MainThemeMode.Light, textSize = MainTextSize.ExtraLarge)) {
                Surface { Box(Modifier.fillMaxSize().padding(12.dp)) {
                    MainMatchActionPanel("m1", "Losers semifinal · B12", {}) {
                        PublishMatchPrimaryAction("Report result", !busy) { clicks++ }
                        CompactMatchRow("B12", listOf("Equipo con nombre muy largo de María y Alejandro", "Northern Lights"), listOf(2, 1), "PLAYING", "Stream 1", true) {}
                        repeat(30) { Text("Opción adicional $it") }
                    }
                } }
            }
        }
        compose.onNodeWithText("Report result").assertIsDisplayed().performClick()
        assertEquals(1, clicks)
        capture("actions-dark-large")
        compose.runOnIdle { busy = true; dark = false }
        compose.onNodeWithText("Report result").assertIsDisplayed().assertIsNotEnabled()
        capture("actions-light-large")
    }
    @Test @Config(qualifiers = "w1200dp-h900dp-mdpi")
    fun widePaneAndRuntimeRollbackKeepContentAndActions() {
        var adaptive by mutableStateOf(true)
        var selected by mutableStateOf(false)
        var created = 0
        compose.setContent { MainTheme(MainAppearance(adaptiveLayout = adaptive)) { Surface {
            AdaptiveMatchLayout(selected, content = {
                remember { created++; Any() }
                Text("Bracket con búsqueda")
            }, actions = { inline -> Text(if (inline) "Panel lateral" else "Diálogo anterior") })
        } } }
        compose.runOnIdle { selected = true }
        compose.onNodeWithText("Panel lateral").assertIsDisplayed()
        compose.runOnIdle { adaptive = false }
        compose.onNodeWithText("Diálogo anterior").assertIsDisplayed()
        compose.onNodeWithText("Bracket con búsqueda").assertIsDisplayed()
        assertEquals("Opening actions and switching layout must preserve the bracket instance", 1, created)
    }
    @Test fun guidedReviewUpdatesAttendanceAndNavigatesWithoutMutatingOtherFields() {
        var checked = false
        var loads = 0
        var destination = ""
        compose.setContent { MainTheme(MainAppearance()) {
            TournamentReviewButton("t", load = {
                loads++
                TournamentReviewData("Before you start", "PREPARATION", "2026-09-27", listOf(
                    TournamentReviewItem("attendance", "Attendance", "Una inscripción", "WARNING", "PARTICIPANTS", "Review attendance"),
                    TournamentReviewItem("draw", "Sorteo", "Pending", "BLOCKED", "COMPETITION", "Prepare competition")
                ), emptyList(), "", true, listOf(TournamentReviewParticipant("p1", "Álex", checked, "ACTIVE")))
            }, onAttendance = { participant, value -> assertEquals("p1", participant.id); checked = value }, onNavigate = { destination = it })
        } }
        compose.onNodeWithText("Review preparation and completion").performClick()
        compose.onNodeWithText("Review attendance").performScrollTo().performClick()
        compose.onNodeWithText("Confirm attendance").performScrollTo().performClick()
        compose.waitForIdle(); assertTrue(checked); assertEquals(2, loads)
        compose.onNodeWithText("Clear attendance").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Prepare competition").performScrollTo().performClick()
        assertEquals("COMPETITION", destination)
    }
    @Test fun searchIgnoresAccentsCaseAndEmptyQueries() {
        assertTrue(bracketSearchMatches(listOf("Equipo Álex", "María"), "  EQUIPO ALEX "))
        assertTrue(bracketSearchMatches(listOf("Equipo Álex", "María"), "maria"))
        assertFalse(bracketSearchMatches(listOf("Equipo Álex"), "  "))
        assertFalse(bracketSearchMatches(listOf("Equipo Álex"), "missing"))
    }
}
