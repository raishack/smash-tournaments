package com.gestortorneos.app.ui

import android.graphics.Bitmap
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import android.graphics.Canvas
import androidx.compose.foundation.background
import androidx.compose.ui.graphics.Color
import android.view.View
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import com.gestortorneos.ui.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w420dp-h900dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MainVisualReviewTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun capture(name: String) {
        val output = File("../../../build/port-session-20260925/clean/screenshots").apply { mkdirs() }
        compose.waitForIdle()
        compose.runOnIdle {
            val view = compose.activity.findViewById<View>(android.R.id.content)
            val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            view.draw(Canvas(bitmap))
            File(output, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }

    @Test fun loginHasAccessiblePasswordVisibilityInBothThemes() {
        var dark by mutableStateOf(false)
        compose.setContent { MainTheme(MainAppearance(theme = if (dark) MainThemeMode.Dark else MainThemeMode.Light)) { ManagementLoginScreen("https://your-domain.example/") } }
        capture("login-light")
        compose.runOnIdle { dark = true }; capture("login-dark")
        compose.onNodeWithText("Show").performScrollTo().performClick()
        compose.onNodeWithText("Hide").assertIsDisplayed().performClick()
        compose.onNode(hasText("Sign in") and hasClickAction()).performScrollTo().assertIsNotEnabled()
    }

    @Test fun summaryAndScoringKeepLongPlayerNamesAndActionsReachable() {
        var dark by mutableStateOf(false)
        var wins by mutableStateOf(1)
        compose.setContent {
            MainTheme(MainAppearance(theme = if (dark) MainThemeMode.Dark else MainThemeMode.Light, textSize = MainTextSize.Large)) {
                Surface { Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    MainTournamentSummary("MAIN Weekly · Smash Ultimate", "Doble eliminación · Bo3", "IN_PROGRESS", "In progress", "32/32 participantes", "La competición está en marcha. Gestiona los partidos desde Match operations.")
                    MainStatusBadge("Playing · Winners semifinal", "PLAYING")
                    ParticipantScoreRow("Name de jugador especialmente largo", wins, 2, false, null, false, true, "+1 game") { wins++ }
                    ParticipantScoreRow("Segundo jugador", 0, 2, false, null, false, false, "+1 game") {}
                    MainDangerButton("DQ Segundo jugador", onClick = {})
                } }
            }
        }
        capture("tournament-light")
        compose.runOnIdle { dark = true }; capture("tournament-dark")
        compose.onNodeWithText("Name de jugador especialmente largo").assertIsDisplayed()
        compose.onAllNodesWithText("+1 game")[0].performScrollTo().performClick()
        compose.onNodeWithText("2 of 2 games needed to win").assertIsDisplayed()
        compose.onNodeWithText("DQ Segundo jugador").performScrollTo().assertIsDisplayed()
    }

    @Test @Config(qualifiers = "w1100dp-h820dp-mdpi")
    fun wideLayoutUsesTwoColumnsAndKeepsEveryTournamentKindSelectable() {
        var kind by mutableStateOf("STANDARD")
        compose.setContent {
            MainTheme(MainAppearance()) { Surface {
                Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    MainTournamentSummary("MAIN · New tournament", "Configura la competición", "DRAFT", "Draft", "Registrations", null)
                    MainAdaptivePair(first = { MainTournamentKinds(kind) { kind = it } }, second = {
                        Card { Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            MainSectionHeading("Display e inscripciones")
                            MainSwitchRow("Show on display", "Visible on tournament displays", true) {}
                            MainStatusBadge("Registration open", "OPEN")
                            OutlinedButton(onClick = {}) { Text("Copy link") }
                        } }
                    })
                }
            } }
        }
        compose.onNodeWithText("Fortnite").performClick(); compose.runOnIdle { org.junit.Assert.assertEquals("FORTNITE", kind) }
        capture("tablet-two-columns")
        compose.onNodeWithText("Teams · LoL / Valorant").performClick(); compose.runOnIdle { org.junit.Assert.assertEquals("TEAMS", kind) }
    }

    @Test fun profileShowsAccountFirstAndOtherActionsRequireExpansion() {
        var dark by mutableStateOf(false)
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"token":"${"a".repeat(64)}","expiresAt":9999999999999,"user":{"id":"fixture","username":"demo-admin","role":"SUPER_ADMIN"}}"""))
        server.start()
        try {
            runBlocking { ManagementSession.login(server.url("/").toString(), "fixture", "fixture-password") }
            compose.setContent {
                MainTheme(MainAppearance(theme = if (dark) MainThemeMode.Dark else MainThemeMode.Light)) {
                    Scaffold(containerColor = Color.Transparent) { padding ->
                        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(padding)) {
                            ProfileScreen(if (dark) MainThemeMode.Dark else MainThemeMode.Light, true, null, false,
                                com.gestortorneos.app.data.TournamentRepository.AdminNotificationSettings(true, false), null, false, {}, {}, {}, { _, _ -> })
                        }
                    }
                }
            }
            compose.onNodeWithText("demo-admin").assertIsDisplayed()
            capture("profile-light")
            compose.runOnIdle { dark = true }; capture("profile-dark")
            compose.onNodeWithText("Sign out").performScrollTo().assertIsDisplayed()
        } finally {
            server.enqueue(MockResponse().setBody("{}"))
            runBlocking { ManagementSession.logout() }; server.close()
        }
    }

    @Test fun destructiveTournamentActionIsSeparatedAndCanBeFound() {
        var calls = 0
        compose.setContent { MainTheme(MainAppearance()) { Column {
            Button(onClick = {}) { Text("Start tournament") }
            MainOtherActions { MainDangerButton("Reset tournament", onClick = { calls++ }) }
        } } }
        compose.onNodeWithText("Reset tournament").assertDoesNotExist()
        compose.onNodeWithText("Other actions  +").performClick()
        compose.onNodeWithText("Reset tournament").performClick()
        org.junit.Assert.assertEquals(1, calls)
    }
}
