package com.gestortorneos.player.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightAppColors = lightColorScheme(
    primary = Color(0xFF005B4F),
    onPrimary = Color.White,
    secondary = Color(0xFF8C3B00),
    onSecondary = Color.White,
    background = Color(0xFFF4F1EA),
    onBackground = Color(0xFF15212B),
    surface = Color(0xFFFFFBF5),
    onSurface = Color(0xFF15212B),
    surfaceVariant = Color(0xFFE6E8EC),
    onSurfaceVariant = Color(0xFF475569)
)

private val DarkAppColors = darkColorScheme(
    primary = Color(0xFF75D6C4),
    onPrimary = Color(0xFF032F2A),
    secondary = Color(0xFFFFB17A),
    onSecondary = Color(0xFF4C2500),
    background = Color(0xFF0F172A),
    onBackground = Color(0xFFF8FAFC),
    surface = Color(0xFF111827),
    onSurface = Color(0xFFF8FAFC),
    surfaceVariant = Color(0xFF1F2937),
    onSurfaceVariant = Color(0xFFCBD5E1)
)

@Composable
fun GestorTorneosPlayerTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkAppColors else LightAppColors,
        content = content
    )
}
