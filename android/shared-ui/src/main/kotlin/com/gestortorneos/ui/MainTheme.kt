package com.gestortorneos.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class MainThemeMode(val label: String) { System("System"), Light("Light"), Dark("Dark") }
enum class MainTextSize(val label: String, val scale: Float) { Regular("Normal", 1f), Large("Large", 1.15f), ExtraLarge("Extra large", 1.3f) }

data class MainAppearance(
    val theme: MainThemeMode = MainThemeMode.System,
    val textSize: MainTextSize = MainTextSize.Regular,
    val onTheme: (MainThemeMode) -> Unit = {},
    val onTextSize: (MainTextSize) -> Unit = {},
    val adaptiveLayout: Boolean = true,
    val onAdaptiveLayout: ((Boolean) -> Unit)? = null,
)
val LocalMainAppearance = staticCompositionLocalOf { MainAppearance() }
private val LocalMainSystemFontScale = staticCompositionLocalOf<Float?> { null }

val MainLightColors = lightColorScheme(
    primary = Color(0xFF3345A4), onPrimary = Color.White,
    primaryContainer = Color(0xFFE2E7FF), onPrimaryContainer = Color(0xFF18255C),
    secondary = Color(0xFF006B60), onSecondary = Color.White,
    secondaryContainer = Color(0xFFD6F3EB), onSecondaryContainer = Color(0xFF084D43),
    tertiary = Color(0xFF735300), onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFF0CC), onTertiaryContainer = Color(0xFF402D00),
    background = Color(0xFFF3F5FA), onBackground = Color(0xFF172033),
    surface = Color(0xFFFFFFFF), onSurface = Color(0xFF172033),
    surfaceVariant = Color(0xFFE8ECF4), onSurfaceVariant = Color(0xFF475569),
    outline = Color(0xFF64748B), outlineVariant = Color(0xFFCBD5E1),
    error = Color(0xFFB42335), onError = Color.White,
    errorContainer = Color(0xFFFFE4E8), onErrorContainer = Color(0xFF791D2B),
    surfaceTint = Color(0xFF3345A4),
    inverseSurface = Color(0xFF243247), inverseOnSurface = Color(0xFFF1F5FB), inversePrimary = Color(0xFFB5C2FF),
    surfaceDim = Color(0xFFDCE2EC), surfaceBright = Color.White,
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF8FAFD),
    surfaceContainer = Color(0xFFF0F3F9), surfaceContainerHigh = Color(0xFFE8ECF4), surfaceContainerHighest = Color(0xFFE0E6F0),
)
val MainDarkColors = darkColorScheme(
    primary = Color(0xFFB5C2FF), onPrimary = Color(0xFF18255C),
    primaryContainer = Color(0xFF283C70), onPrimaryContainer = Color(0xFFE2E7FF),
    secondary = Color(0xFF7DDECB), onSecondary = Color(0xFF00382F),
    secondaryContainer = Color(0xFF134C43), onSecondaryContainer = Color(0xFFB3F5E3),
    tertiary = Color(0xFFF5CB72), onTertiary = Color(0xFF402D00),
    tertiaryContainer = Color(0xFF43351C), onTertiaryContainer = Color(0xFFFFE4A6),
    background = Color(0xFF0F1724), onBackground = Color(0xFFF1F5FB),
    surface = Color(0xFF182334), onSurface = Color(0xFFF1F5FB),
    surfaceVariant = Color(0xFF243247), onSurfaceVariant = Color(0xFFC2CEDF),
    outline = Color(0xFF93A4BC), outlineVariant = Color(0xFF43536A),
    error = Color(0xFFFFB2BA), onError = Color(0xFF650E20),
    errorContainer = Color(0xFF522735), onErrorContainer = Color(0xFFFFDAE0),
    surfaceTint = Color(0xFFB5C2FF),
    inverseSurface = Color(0xFFE8ECF4), inverseOnSurface = Color(0xFF172033), inversePrimary = Color(0xFF3345A4),
    surfaceDim = Color(0xFF0F1724), surfaceBright = Color(0xFF344158),
    surfaceContainerLowest = Color(0xFF0B1220), surfaceContainerLow = Color(0xFF141E2E),
    surfaceContainer = Color(0xFF182334), surfaceContainerHigh = Color(0xFF243247), surfaceContainerHighest = Color(0xFF2E3D54),
)

object MainPalette {
    val isDark: Boolean @Composable get() = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val success: Color @Composable get() = if (isDark) Color(0xFF8DE2B0) else Color(0xFF17643B)
    val successContainer: Color @Composable get() = if (isDark) Color(0xFF163D2C) else Color(0xFFDCF5E5)
    val warning: Color @Composable get() = if (isDark) Color(0xFFF5CB72) else Color(0xFF805400)
    val warningContainer: Color @Composable get() = if (isDark) Color(0xFF43351C) else Color(0xFFFFF0CC)
}

private val MainTypography = Typography(
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 15.sp, lineHeight = 22.sp),
    bodySmall = TextStyle(fontSize = 13.sp, lineHeight = 19.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun MainTheme(appearance: MainAppearance, content: @Composable () -> Unit) {
    val dark = when (appearance.theme) {
        MainThemeMode.System -> isSystemInDarkTheme()
        MainThemeMode.Light -> false
        MainThemeMode.Dark -> true
    }
    val density = LocalDensity.current
    val colors = if (dark) MainDarkColors else MainLightColors
    // A dialog has its own density; reuse the system font scale without doubling the app setting.
    val systemFontScale = LocalMainSystemFontScale.current ?: density.fontScale
    CompositionLocalProvider(
        LocalMainAppearance provides appearance,
        LocalMainSystemFontScale provides systemFontScale,
        LocalDensity provides Density(density.density, systemFontScale * appearance.textSize.scale),
        // MaterialTheme alone leaves unstyled text black. Transparent scaffolds and
        // custom/tinted cards inherit this color instead of providing their own.
        LocalContentColor provides colors.onBackground,
    ) {
        MaterialTheme(colorScheme = colors, typography = MainTypography, content = content)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AppearanceControls() {
    val appearance = LocalMainAppearance.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Appearance", style = MaterialTheme.typography.titleMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            MainThemeMode.entries.forEach { mode ->
                FilterChip(selected = appearance.theme == mode, onClick = { appearance.onTheme(mode) }, label = { Text(mode.label) }, modifier = Modifier.heightIn(min = 48.dp))
            }
        }
        Text("Text size", style = MaterialTheme.typography.titleMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            MainTextSize.entries.forEach { size ->
                FilterChip(selected = appearance.textSize == size, onClick = { appearance.onTextSize(size) }, label = { Text(size.label) }, modifier = Modifier.heightIn(min = 48.dp))
            }
        }
        Text("Combines with your device text size.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Player · Result 2–1", style = MaterialTheme.typography.bodyLarge)
        if (!forceClassicPresentation && appearance.onAdaptiveLayout != null) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("Adaptive layout", style = MaterialTheme.typography.titleMedium)
                    Text("Compact list with actions beside the bracket on wide screens. Disable it to restore the previous layout.", style = MaterialTheme.typography.bodySmall)
                }
                Switch(checked = appearance.adaptiveLayout, onCheckedChange = appearance.onAdaptiveLayout)
            }
        }
    }
}
