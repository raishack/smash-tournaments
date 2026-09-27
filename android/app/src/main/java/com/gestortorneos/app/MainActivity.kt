package com.gestortorneos.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.gestortorneos.app.ui.GestorTorneosApp
import com.gestortorneos.app.ui.theme.GestorTorneosTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        com.gestortorneos.ui.ManagementSession.initialize(
            com.gestortorneos.app.data.remote.BackendConfig.baseUrl, AndroidManagementSessionStorage(applicationContext)
        )
        setContent {
            GestorTorneosTheme {
                GestorTorneosApp()
            }
        }
    }
}
