package com.gestortorneos.app.ui

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.window.Dialog
import com.gestortorneos.ui.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowDialog

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w420dp-h900dp-mdpi")
class BracketFullscreenInteractionTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val match = MatchSummary(
        id = "m1", bracketStage = "WINNERS", roundNumber = 1, matchNumber = 1,
        label = "A1", status = "PLAYING", participantsLabel = "Álex vs María",
        participantNames = listOf("Álex", "María"), participantIds = listOf("p1", "p2"),
        participantScores = listOf(0, 0), advancersRequired = 1,
        advancingParticipantIds = emptyList(), bestOf = 3,
    )

    private fun View.webViews(): List<WebView> = when (this) {
        is WebView -> listOf(this)
        is ViewGroup -> (0 until childCount).flatMap { getChildAt(it).webViews() }
        else -> emptyList()
    }

    private fun visibleWebView(): WebView = (
        listOf(compose.activity.window.decorView) + ShadowDialog.getShownDialogs()
            .filter { it.isShowing }.mapNotNull { it.window?.decorView }
        ).flatMap { it.webViews() }.distinct().single()

    @Test fun closingMatchActionsKeepsTheSameFullscreenBoard() = exerciseActions(adaptive = false)

    @Test fun phoneAdaptiveActionsKeepFullscreenThroughResultAndRefresh() = exerciseActions(adaptive = true)

    @Test @Config(qualifiers = "w1200dp-h900dp-mdpi")
    fun tabletUsesDialogAboveFullscreenInsteadOfHiddenSidePanel() = exerciseActions(adaptive = true)

    private fun exerciseActions(adaptive: Boolean) {
        var selection by mutableStateOf<String?>(null)
        var fullscreen by mutableStateOf(false)
        var report by mutableStateOf(false)
        var current by mutableStateOf(match)
        var inlineActions: Boolean? = null
        compose.setContent { MainTheme(MainAppearance(adaptiveLayout = adaptive)) { Surface {
            AdaptiveMatchLayout(selection != null, forceDialog = fullscreen, content = {
                ExperimentalBracketBoard(listOf(current), selectableMatchIds = setOf(match.id),
                    onMatchSelected = { selection = it }, onFullscreenChanged = { fullscreen = it })
            }, actions = { inline ->
                SideEffect { inlineActions = inline }
                val body: @Composable () -> Unit = {
                    MainMatchActionPanel(match.id, "Acciones A1", { selection = null }) {
                        PublishMatchPrimaryAction("Report result", true) { report = true }
                    }
                }
                if (inline) body() else Dialog(onDismissRequest = { selection = null }) { body() }
            })
            if (report) Dialog(onDismissRequest = { report = false }) {
                Button(onClick = { current = current.copy(participantScores = listOf(2, 0), status = "COMPLETED"); report = false }) {
                    Text("Save result de prueba")
                }
            }
        } } }
        compose.onNodeWithText("Fullscreen").performClick()
        lateinit var board: WebView
        lateinit var host: Any
        compose.runOnIdle { board = visibleWebView(); host = board.parent }
        compose.runOnIdle {
            assertTrue(board.webViewClient.shouldOverrideUrlLoading(board, "gtt-match://select/m1"))
        }
        compose.onNodeWithText("Report result").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(false, inlineActions); assertTrue(fullscreen) }
        compose.onNodeWithText("Save result de prueba").assertIsDisplayed().performClick()
        compose.onNodeWithText("Close").assertIsDisplayed().performClick()
        compose.onNodeWithText("Exit fullscreen").assertIsDisplayed()
        compose.runOnIdle { assertTrue(fullscreen); assertSame(board, visibleWebView()); assertSame(host, board.parent) }
        // Reopening and cancelling must also leave the fullscreen owner intact.
        compose.runOnIdle { board.webViewClient.shouldOverrideUrlLoading(board, "gtt-match://select/m1") }
        compose.onNodeWithText("Close").performClick()
        compose.onNodeWithText("Exit fullscreen").assertIsDisplayed()
        compose.onNodeWithText("Exit fullscreen").performClick()
        compose.onNodeWithText("Fullscreen").assertIsEnabled()
        compose.runOnIdle { assertFalse(fullscreen); assertSame(board, visibleWebView()) }
    }
}
