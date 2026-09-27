package com.gestortorneos.player.data.remote

import com.gestortorneos.player.BuildConfig

data class PlayerBackendSettings(
    val baseUrl: String,
    val appClientKey: String
)

object BackendConfig {
    private var cachedBaseUrl: String = normalizeBaseUrl(BuildConfig.BACKEND_BASE_URL)
    private var cachedAppClientKey: String = BuildConfig.APP_CLIENT_KEY.trim()

    fun initialize(): PlayerBackendSettings {
        cachedBaseUrl = normalizeBaseUrl(BuildConfig.BACKEND_BASE_URL)
        cachedAppClientKey = BuildConfig.APP_CLIENT_KEY.trim()
        return currentSettings()
    }

    fun currentSettings(): PlayerBackendSettings = PlayerBackendSettings(
        baseUrl = cachedBaseUrl,
        appClientKey = cachedAppClientKey
    )

    private fun normalizeBaseUrl(value: String): String {
        val trimmed = value.trim()
        require(trimmed.isNotEmpty()) { "The backend URL cannot be empty" }
        val withScheme = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "http://$trimmed"
        return if (withScheme.endsWith("/")) withScheme else "$withScheme/"
    }
}
