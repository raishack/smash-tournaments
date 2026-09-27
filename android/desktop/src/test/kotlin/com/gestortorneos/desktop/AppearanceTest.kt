package com.gestortorneos.desktop

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.gestortorneos.ui.*
import java.io.File
import javax.swing.SwingUtilities
import kotlin.test.*

@OptIn(ExperimentalComposeUiApi::class)
class AppearanceTest {
    @Test fun transparentAppScaffoldInheritsReadableTextAfterThemeChanges() {
        SwingUtilities.invokeAndWait {
            var mode by mutableStateOf(MainThemeMode.Light)
            var foreground = Color.Unspecified
            var background = Color.Unspecified
            val scene = ImageComposeScene(width = 700, height = 900, density = Density(1f)) {
                // Reproduce the app: a transparent Scaffold over a painted Box, without
                // an extra Surface that would hide the missing inherited content color.
                MainTheme(MainAppearance(mode)) {
                    Scaffold(containerColor = Color.Transparent) { padding ->
                        foreground = LocalContentColor.current
                        background = MaterialTheme.colorScheme.background
                        Column(Modifier.fillMaxSize().background(background).padding(padding).padding(24.dp),
                            verticalArrangement = Arrangement.spacedBy(20.dp)) {
                            MainSectionHeading("Competition", "Opciones del torneo")
                            Text("Tournament name y participantes")
                            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = .96f))) {
                                Column(Modifier.padding(20.dp)) {
                                    Text("Registrations y avisos")
                                    MainSwitchRow("Show on display", "Visible on tournament displays", true) {}
                                }
                            }
                            MainTournamentKinds("TEAMS") {}
                        }
                    }
                }
            }
            try {
                for (theme in listOf(MainThemeMode.Light, MainThemeMode.Dark, MainThemeMode.Light)) {
                    mode = theme
                    repeat(5) { scene.render().close() }
                    val directory = File("build/appearance-review").apply { mkdirs() }
                    scene.render().use { image ->
                        image.encodeToData()!!.use { data -> File(directory, "scaffold-${theme.name}.png").writeBytes(data.bytes) }
                    }
                    assertContrast(foreground, background)
                }
            } finally { scene.close() }
        }
    }

    @Test fun readableTextPairsInBothThemes() {
        for (scheme in listOf(MainLightColors, MainDarkColors)) {
            val pairs = listOf(
                scheme.onBackground to scheme.background,
                scheme.onSurface to scheme.surface,
                scheme.onSurfaceVariant to scheme.surfaceVariant,
                scheme.primary to scheme.surface,
                scheme.onPrimary to scheme.primary,
                scheme.onPrimaryContainer to scheme.primaryContainer,
                scheme.onSecondary to scheme.secondary,
                scheme.onSecondaryContainer to scheme.secondaryContainer,
                scheme.onTertiary to scheme.tertiary,
                scheme.onTertiaryContainer to scheme.tertiaryContainer,
                scheme.inverseOnSurface to scheme.inverseSurface,
                scheme.inversePrimary to scheme.inverseSurface,
                scheme.error to scheme.errorContainer,
                scheme.onError to scheme.error,
                scheme.onErrorContainer to scheme.errorContainer,
            )
            pairs.forEach { (text, background) -> assertContrast(text, background) }
            listOf(scheme.surfaceContainerLowest, scheme.surfaceContainerLow, scheme.surfaceContainer, scheme.surfaceContainerHigh, scheme.surfaceContainerHighest).forEach {
                assertContrast(scheme.onSurface, it)
                assertContrast(scheme.onSurfaceVariant, it)
            }
        }
    }

    @Test fun dialogThemesPreserveTextSizeWithoutMultiplyingItAgain() {
        SwingUtilities.invokeAndWait {
            var rootScale = 0f
            var dialogScale = 0f
            val scene = ImageComposeScene(width = 100, height = 100, density = Density(1f, 1.2f)) {
                MainTheme(MainAppearance(MainThemeMode.Dark, MainTextSize.ExtraLarge)) {
                    rootScale = LocalDensity.current.fontScale
                    // A new window supplies its own density, but inherits appearance preferences.
                    CompositionLocalProvider(LocalDensity provides Density(2f, 1f)) {
                        MainTheme(LocalMainAppearance.current) { dialogScale = LocalDensity.current.fontScale }
                    }
                }
            }
            try {
                scene.render().close()
                assertEquals(1.56f, rootScale, 0.001f)
                assertEquals(rootScale, dialogScale, 0.001f)
            } finally { scene.close() }
        }
    }

    @Test fun nativeCardsGrowForLongNamesAndAccessibleText() {
        SwingUtilities.invokeAndWait {
            for (mode in listOf(MainThemeMode.Light, MainThemeMode.Dark)) {
                val shortHeight = renderCards(mode, MainTextSize.Regular, longNames = false)
                val longHeight = renderCards(mode, MainTextSize.Regular, longNames = true)
                val largeHeight = renderCards(mode, MainTextSize.ExtraLarge, longNames = true)
                assertTrue(longHeight > shortHeight, "Long names must wrap instead of disappearing")
                assertTrue(largeHeight > longHeight, "Larger text must increase the card's height")
            }
        }
    }

    private fun renderCards(mode: MainThemeMode, size: MainTextSize, longNames: Boolean): Int {
        var height = 0
        var actualFontScale = 0f
        val match = fixture(longNames)
        val scene = ImageComposeScene(width = 1060, height = 1400, density = Density(1f, 1.2f)) {
            MainTheme(MainAppearance(mode, size)) {
                actualFontScale = LocalDensity.current.fontScale
                assertContrast(MainPalette.success, MainPalette.successContainer)
                assertContrast(MainPalette.warning, MainPalette.warningContainer)
                Surface(Modifier.fillMaxSize()) {
                    Column(Modifier.padding(32.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                        Text("MAIN · Appearance", style = MaterialTheme.typography.headlineMedium)
                        AppearanceControls()
                        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                            Column(Modifier.width(420.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                Text("Playing", style = MaterialTheme.typography.titleMedium)
                                RelationalMatchNode(match, showOperationalState = true, onHeight = { height = it })
                            }
                            Column(Modifier.width(420.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                Text("Result y descalificación", style = MaterialTheme.typography.titleMedium)
                                RelationalMatchNode(match.copy(status = "WALKOVER", winnerParticipantId = "a", scores = listOf(1, 0)), showOperationalState = true)
                            }
                        }
                    }
                }
            }
        }
        try {
            repeat(5) { scene.render(it * 16_000_000L).close() }
            assertEquals(1.2f * size.scale, actualFontScale, 0.001f, "Preserve the OS font scale")
            assertTrue(height > 0)
            if (longNames) {
                val directory = File("build/appearance-review").apply { mkdirs() }
                scene.render(100_000_000L).use { image ->
                    image.encodeToData()!!.use { data -> File(directory, "${mode.name}-${size.name}.png").writeBytes(data.bytes) }
                }
            }
        } finally {
            scene.close()
        }
        return height
    }

    private fun assertContrast(text: Color, background: Color) {
        val a = text.luminance(); val b = background.luminance()
        val ratio = (maxOf(a, b) + 0.05f) / (minOf(a, b) + 0.05f)
        assertTrue(ratio >= 4.5f, "Insufficient text contrast ($ratio): $text on $background")
    }

    private fun fixture(longNames: Boolean) = DesktopMatchSummary(
        id = "a1", label = "Winners Round 1", displayIdentifier = "A1", status = "PLAYING", bestOf = 3,
        bracketMode = "DOUBLE_ELIMINATION", bracketStage = "WINNERS", roundNumber = 1, matchNumber = 1,
        advancersRequired = 1, participantIds = listOf("a", "b"),
        participantNames = if (longNames) listOf("Community Team | Equipo de Alejandro y María del Mar", "Northern Lights | Equipo de Lucía y José Antonio") else listOf("Ana", "Luis"),
        participantsLabel = "", participants = emptyList(), scores = listOf(2, 1), winnerParticipantId = null,
        winnerName = null, stationLabel = "Setup 1", calledAt = null, startedAt = null, advancingParticipantIds = emptyList(),
    )
}
