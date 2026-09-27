package com.gestortorneos.desktop

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.window.WindowPlacement
import androidx.compose.ui.window.WindowState
import com.gestortorneos.ui.*
import javax.swing.SwingUtilities
import java.io.File
import kotlin.test.*

@OptIn(ExperimentalComposeUiApi::class)
class BracketFullscreenInteractionTest {
    @Test fun matchActionsAndRefreshKeepTheFullscreenOwnerInBothPresentations() {
        SwingUtilities.invokeAndWait {
            for (adaptive in listOf(false, true)) for (placement in listOf(WindowPlacement.Floating, WindowPlacement.Maximized)) {
                exercise(adaptive, placement)
            }
        }
    }

    private fun exercise(adaptive: Boolean, placement: WindowPlacement) {
        val window = WindowState(placement = placement)
        val fullscreen = DesktopBracketFullscreenState(window)
        var selected by mutableStateOf<DesktopMatchSummary?>(null)
        var current by mutableStateOf(DesktopMatchSummary(
            id = "a1", label = "Winners Round 1", displayIdentifier = "A1", status = "PLAYING", bestOf = 3,
            bracketMode = "DOUBLE_ELIMINATION", bracketStage = "WINNERS", roundNumber = 1, matchNumber = 1,
            advancersRequired = 1, participantIds = listOf("a", "b"), participantNames = listOf("Álex", "María"),
            participantsLabel = "", participants = emptyList(), scores = listOf(0, 0), winnerParticipantId = null,
            winnerName = null, stationLabel = "Setup 1", calledAt = null, startedAt = null, advancingParticipantIds = emptyList(),
        ))
        var inlineActions: Boolean? = null
        var closeActions: () -> Unit = {}
        val snackbar = SnackbarHostState()
        val scene = ImageComposeScene(width = 1400, height = 1000) {
            MainTheme(MainAppearance(adaptiveLayout = adaptive)) {
                CompositionLocalProvider(LocalBracketFullscreen provides fullscreen) {
                    Box(Modifier.fillMaxSize()) {
                        AdaptiveMatchLayout(selected != null, forceDialog = fullscreen.owner != null, content = {
                            ModernBracketBoard(listOf(current), selectableMatchIds = setOf("a1"),
                                onMatchSelected = { selected = it })
                        }, actions = { inline ->
                            SideEffect { inlineActions = inline; closeActions = { selected = null } }
                        })
                        DesktopBracketFullscreenOverlay(snackbar)
                    }
                }
            }
        }
        try {
            fun settle() { repeat(6) { scene.render().close() } }
            fun click(text: String) {
                val position = when (text) {
                    "Fullscreen" -> Offset(1360f, 24f)
                    "Álex" -> Offset(160f, 358f)
                    else -> Offset(1260f, 36f)
                }
                scene.sendPointerEvent(PointerEventType.Press, position)
                scene.sendPointerEvent(PointerEventType.Release, position)
                settle()
            }
            fun capture(name: String) {
                val directory = File("../../build/fullscreen-match-20260927/screenshots").apply { mkdirs() }
                scene.render().use { image -> image.encodeToData()!!.use { data -> File(directory, "$name.png").writeBytes(data.bytes) } }
            }
            settle()
            capture("desktop-normal")
            click("Fullscreen")
            capture("desktop-fullscreen")
            val owner = fullscreen.owner
            assertNotNull(owner)
            assertEquals(WindowPlacement.Fullscreen, window.placement)
            repeat(2) {
                click("Álex")
                assertEquals("a1", selected?.id)
                assertEquals(false, inlineActions, "Actions must use a window above the fullscreen canvas")
                assertSame(owner, fullscreen.owner, "Selecting a match must not close fullscreen")
                current = current.copy(scores = listOf(2, 0), status = "COMPLETED", winnerParticipantId = "a")
                settle()
                closeActions()
                settle()
                assertSame(owner, fullscreen.owner)
                assertEquals(WindowPlacement.Fullscreen, window.placement)
            }
            click("Exit fullscreen (Esc)")
            assertNull(fullscreen.owner)
            assertEquals(placement, window.placement)
        } finally { scene.close() }
    }
}
