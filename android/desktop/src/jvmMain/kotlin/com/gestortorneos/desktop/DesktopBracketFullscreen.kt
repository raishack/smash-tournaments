package com.gestortorneos.desktop

import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.WindowPlacement
import androidx.compose.ui.window.WindowState

internal val LocalBracketFullscreen = staticCompositionLocalOf<DesktopBracketFullscreenState?> { null }

internal class DesktopBracketFullscreenState(private val windowState: WindowState) {
    var owner by mutableStateOf<Any?>(null)
        private set
    var content by mutableStateOf<(@Composable () -> Unit)?>(null)
        private set
    private var previousPlacement = windowState.placement

    fun open(owner: Any, content: @Composable () -> Unit) {
        if (this.owner != null) return
        previousPlacement = windowState.placement
        this.owner = owner
        this.content = content
        windowState.placement = WindowPlacement.Fullscreen
    }

    fun close(owner: Any? = this.owner) {
        if (this.owner == null || this.owner !== owner) return
        content = null
        this.owner = null
        windowState.placement = previousPlacement
    }
}

@Composable
internal fun DesktopBracketFullscreenOverlay(snackbarHostState: SnackbarHostState) {
    val state = LocalBracketFullscreen.current ?: return
    val content = state.content ?: return
    val focus = remember { FocusRequester() }
    LaunchedEffect(state.owner) { focus.requestFocus() }
    Surface(Modifier.fillMaxSize().focusRequester(focus).focusable(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Bracket moderna", style = MaterialTheme.typography.titleLarge)
                    TextButton(onClick = { state.close() }) { Text("Salir de pantalla completa (Esc)") }
                }
                Box(Modifier.weight(1f).fillMaxWidth()) { content() }
            }
            SnackbarHost(snackbarHostState, Modifier.align(Alignment.BottomCenter))
        }
    }
}
