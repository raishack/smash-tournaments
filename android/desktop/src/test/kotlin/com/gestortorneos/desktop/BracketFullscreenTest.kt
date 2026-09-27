package com.gestortorneos.desktop

import androidx.compose.ui.window.WindowPlacement
import androidx.compose.ui.window.WindowState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertSame

class BracketFullscreenTest {
    @Test fun restoresBothFloatingAndMaximizedWindows() {
        for (placement in listOf(WindowPlacement.Floating, WindowPlacement.Maximized)) {
            val window = WindowState(placement = placement)
            val state = DesktopBracketFullscreenState(window)
            val owner = Any()
            state.open(owner) { }
            assertEquals(WindowPlacement.Fullscreen, window.placement)
            assertSame(owner, state.owner)
            state.close()
            assertEquals(placement, window.placement)
            assertNull(state.content)
            assertNull(state.owner)
        }
    }

    @Test fun anotherBoardCannotReplaceOrDismissTheActiveBoard() {
        val window = WindowState()
        val state = DesktopBracketFullscreenState(window)
        val active = Any()
        val other = Any()
        state.open(active) { }
        state.open(other) { }
        state.close(other)
        assertSame(active, state.owner)
        assertEquals(WindowPlacement.Fullscreen, window.placement)
        state.close(active)
        assertEquals(WindowPlacement.Floating, window.placement)
    }
}
