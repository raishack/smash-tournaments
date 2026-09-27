package com.gestortorneos.app.ui.theme

import androidx.compose.runtime.Composable
import com.gestortorneos.ui.MainAppearance
import com.gestortorneos.ui.MainTheme

@Composable
fun GestorTorneosTheme(content: @Composable () -> Unit) {
    MainTheme(MainAppearance(), content)
}
