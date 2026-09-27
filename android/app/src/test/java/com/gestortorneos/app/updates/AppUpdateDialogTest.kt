package com.gestortorneos.app.updates

import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
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
@Config(sdk = [34], qualifiers = "w320dp-h480dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AppUpdateDialogTest {
    @get:Rule val compose = createComposeRule()

    @Test fun requiredDownloadCanBeCancelledAndRetriedWithoutDismissingGate() {
        var state by mutableStateOf(UpdateDownloadState(busy = true, downloaded = 40, total = 100))
        var cancelled = false
        var retried = false
        var installed = false
        compose.setContent {
            MainTheme(MainAppearance()) {
                AppUpdateDialog(null, "0.1.9", "0.1.10", null, List(12) { "Cambio número $it en la aplicación" }, true,
                    state, false, "Android pedirá confirmar la instalación.",
                    onDownload = { retried = true }, onInstall = { installed = true },
                    onCancel = { cancelled = true; state = UpdateDownloadState(error = "Sin conexión") }, onDismiss = { fail("Required update dismissed") })
            }
        }
        compose.onNodeWithText("Más tarde").assertDoesNotExist()
        compose.onNodeWithText("Descargar actualización").assertIsNotEnabled()
        compose.onNodeWithText("Cancelar descarga").assertIsDisplayed().performClick()
        compose.onNodeWithText("Reintentar descarga").assertIsDisplayed().performClick()
        assertTrue(cancelled); assertTrue(retried)
        compose.runOnIdle { state = UpdateDownloadState(file = File("verified.apk")) }
        compose.onNodeWithText("Instalar actualización").assertIsDisplayed().performClick()
        assertTrue(installed)
    }
}
