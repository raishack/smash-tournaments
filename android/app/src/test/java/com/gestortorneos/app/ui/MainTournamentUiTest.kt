package com.gestortorneos.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.gestortorneos.ui.MainAppearance
import com.gestortorneos.ui.MainTheme
import com.gestortorneos.ui.MainThemeMode
import com.gestortorneos.ui.MainTextSize
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
@RunWith(RobolectricTestRunner::class)

@Config(sdk = [34], qualifiers = "w360dp-h640dp-mdpi")

@GraphicsMode(GraphicsMode.Mode.NATIVE)

class MainTournamentUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun profileCanReachBottomAndNotificationsOnSmallScreen() {
        compose.setContent {

            MainTheme(MainAppearance()) {

                Box(Modifier.size(320.dp, 420.dp)) {

                    ProfileScreen(MainThemeMode.System, true, null, false, com.gestortorneos.app.data.TournamentRepository.AdminNotificationSettings(true, false), null, false, {}, {}, {}, { _, _ -> })

                }

            }

        }

        compose.onNodeWithText("Configuracion local").performScrollTo().assertIsDisplayed()

        compose.onNodeWithText("WhatsApp", useUnmergedTree = true).performScrollTo().assertIsDisplayed()

        compose.onNodeWithText("Perfil").performScrollTo().assertIsDisplayed()

    }

    @Test fun loginFieldsRemainReachableWithLargeText() {
        compose.setContent {
            MainTheme(MainAppearance(textSize = MainTextSize.ExtraLarge)) {
                Box(Modifier.size(320.dp, 360.dp)) {
                    com.gestortorneos.ui.ManagementLoginScreen("https://example.test/")
                }
            }
        }
        compose.onNode(hasSetTextAction() and hasText("Usuario")).performScrollTo().performTextInput("gestor")
        compose.onNode(hasSetTextAction() and hasText("Contraseña")).performScrollTo().performTextInput("test-password")
        compose.onNodeWithText("Entrar").performScrollTo().assertIsDisplayed().assertIsEnabled()
    }

    @Test fun teamsAndFortniteAreExplicitAndHaveReachableConfiguration() {

        compose.setContent {

            MainTheme(MainAppearance()) {

                Box(Modifier.size(320.dp, 540.dp)) { CreateTournamentScreen(CreateTournamentMode.Manual, {}, {}) }

            }

        }

        fun reveal(text: String) {

            compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasText(text))

        }

        reveal("Por equipos · LoL / Valorant")

        compose.onNodeWithText("Por equipos · LoL / Valorant").performClick()

        for (label in listOf("5 titulares", "Hasta 0 reservas", "Admitir jugadores sin equipo", "Máximo de equipos")) {
            reveal(label)

            compose.onNodeWithText(label).assertIsDisplayed()

        }
        reveal("5 titulares")
        reveal("Fortnite")

        compose.onNodeWithText("Fortnite").performClick()

        reveal("Participantes por grupo (+ VIP): 20")

        compose.onNodeWithText("Participantes por grupo (+ VIP): 20").performClick()

        compose.onNodeWithText("100", useUnmergedTree = true).performScrollTo().performClick()

        compose.onNodeWithText("Participantes por grupo (+ VIP): 100").assertIsDisplayed()

        reveal("Partidas por ronda (puntos acumulados): 3")

        compose.onNodeWithText("Partidas por ronda (puntos acumulados): 3").assertIsDisplayed()
        reveal("Maximo de participantes")

        compose.onNodeWithText("Maximo de participantes").assertIsDisplayed()

    }

    @Test fun importedTournamentHasWorkingDisplayToggleWithoutRegistrationControls() {
        val detail = TournamentDetail(
            id="imported", title="Imported", game="Smash", description="", status="COMPLETED",
            platform="start.gg", maxParticipants=32, format="Double", rawFormat="DOUBLE_ELIMINATION",
            bracketMode="STANDARD", mkartAdvanceCount=2, mkartLosersAdvanceCount=2,
            bestOf=3, winnersBestOf=3, losersBestOf=3, seedingMethod="MANUAL", callTimeoutMinutes=5,
            setupCount=1, playAreaName=null, isStartggMirrored=true, startggEventUrl=null,
            playerMatchReportingEnabled=false, supportsSmashCharacterReporting=true,
            participants=emptyList(), matches=emptyList()
        )
        var current by androidx.compose.runtime.mutableStateOf(detail)
        var update: Map<String, Boolean>? = null
        compose.setContent {
            MainTheme(MainAppearance()) {
                PublicTournamentOptions(current, true, "session") { values ->
                    update = values
                    current = current.copy(displayEnabled = values.getValue("displayEnabled"))
                }
            }
        }
        compose.onNodeWithText("Mostrar en el display").assertIsOn().performClick()
        compose.onNodeWithText("Mostrar en el display").assertIsOff().assertIsDisplayed()
        org.junit.Assert.assertEquals(mapOf("displayEnabled" to false), update)
        compose.onNodeWithText("Abrir inscripción online").assertDoesNotExist()
        compose.onNodeWithText("Mostrar en el display").performClick()
        org.junit.Assert.assertEquals(mapOf("displayEnabled" to true), update)
    }

}
