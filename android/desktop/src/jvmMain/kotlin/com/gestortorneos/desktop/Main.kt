package com.gestortorneos.desktop

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.window.rememberWindowState
import androidx.compose.ui.unit.dp

fun main() {
    if (System.getProperty("os.name").startsWith("Windows")) {
        com.gestortorneos.ui.ManagementSession.initialize(DesktopConfig.baseUrl, WindowsManagementSessionStorage())
    }
    androidx.compose.ui.window.application {
        val windowState = rememberWindowState(width = 1200.dp, height = 820.dp)
        val fullscreen = remember(windowState) { DesktopBracketFullscreenState(windowState) }
        androidx.compose.ui.window.Window(
            onCloseRequest = ::exitApplication,
            title = "Smash Tournaments",
            state = windowState,
            onPreviewKeyEvent = { event ->
                if (event.key == Key.Escape && event.type == KeyEventType.KeyUp && fullscreen.owner != null) {
                    fullscreen.close()
                    true
                } else false
            },
        ) {
            CompositionLocalProvider(LocalBracketFullscreen provides fullscreen) {
                Box(Modifier.fillMaxSize()) { DesktopApp(onExitForUpdate = ::exitApplication) }
            }
        }
    }
}
