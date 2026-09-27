package com.gestortorneos.player.ui

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.activity.ComponentActivity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import java.io.File
import androidx.test.core.app.ApplicationProvider
import com.gestortorneos.player.data.PlayerSession
import com.gestortorneos.player.data.PlayerSessionStore
import com.gestortorneos.ui.*
import kotlinx.coroutines.runBlocking
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
class PlayerProfileTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun capture(name: String) {
        compose.waitForIdle()
        compose.runOnIdle {
            val view = compose.activity.findViewById<View>(android.R.id.content)
            val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            view.draw(Canvas(bitmap))
            val output = File("build/reports/player-profile").apply { mkdirs() }
            File(output, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }

    @Test fun smallDarkProfileKeepsNotificationsUpdatesAndLogoutReachable() {
        var notificationSettings = false
        var batterySettings = false
        var loggedOut = false
        compose.setContent {
            MainTheme(MainAppearance(MainThemeMode.Dark, MainTextSize.ExtraLarge)) {
                Scaffold(containerColor = Color.Transparent) { padding ->
                    Box(Modifier.fillMaxSize().padding(padding)) {
                        ProfileSection(PlayerSession("fixture-startgg-session", "Player", "Player"), null, null,
                            MainThemeMode.Dark, true, true, true, false, {}, {},
                            { notificationSettings = true }, { batterySettings = true }, { loggedOut = true })
                    }
                }
            }
        }
        compose.onNodeWithText("Connected to start.gg").assertExists()
        capture("profile-top-dark-large")
        compose.onNodeWithText("Password").assertDoesNotExist()
        compose.onNodeWithText("Match call channel", useUnmergedTree = true).performScrollTo().performClick()
        compose.onNodeWithText("Battery", useUnmergedTree = true).performScrollTo().performClick()
        compose.onNodeWithText("Updates").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Sign out").performScrollTo().assertIsDisplayed()
        capture("profile-bottom-dark-large")
        assertTrue(notificationSettings); assertTrue(batterySettings); assertFalse(loggedOut)
        compose.onNodeWithText("Sign out").performClick()
        assertTrue(loggedOut)
    }

    @Test fun playerStartggSessionSurvivesReloadAndIsSeparateFromManagement() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val expected = PlayerSession("fixture-startgg-session", "Player", "Player")
        PlayerSessionStore.save(context, expected)
        assertEquals(expected, PlayerSessionStore.load(context))
        runBlocking { ManagementSession.logout() }
        assertEquals(expected, PlayerSessionStore.load(context))
        PlayerSessionStore.clear(context)
        assertNull(PlayerSessionStore.load(context))
    }
}
