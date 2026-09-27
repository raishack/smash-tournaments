package com.gestortorneos.desktop

import java.util.prefs.Preferences

data class DesktopConnectionSettings(
    val baseUrl: String,
    val appClientKey: String
)

object DesktopClientConfig {
    private val preferences: Preferences = Preferences.userRoot().node("com.gestortorneos.desktop")
    private const val KEY_BACKEND_URL = "backend_base_url"
    private const val KEY_APP_CLIENT_KEY = "backend_app_client_key"

    @Volatile
    private var cachedBaseUrl: String = normalizeBaseUrl(
        preferences.get(KEY_BACKEND_URL, System.getenv("GT_BACKEND_URL") ?: "http://127.0.0.1:4000/")
    )

    @Volatile
    private var cachedAppClientKey: String =
        preferences.get(KEY_APP_CLIENT_KEY, System.getenv("GT_APP_CLIENT_KEY") ?: "").trim()

    fun currentSettings(): DesktopConnectionSettings {
        return DesktopConnectionSettings(
            baseUrl = cachedBaseUrl,
            appClientKey = cachedAppClientKey
        )
    }

    fun update(baseUrl: String, appClientKey: String) {
        val normalizedBaseUrl = normalizeBaseUrl(baseUrl)
        val normalizedAppClientKey = appClientKey.trim()
        preferences.put(KEY_BACKEND_URL, normalizedBaseUrl)
        preferences.put(KEY_APP_CLIENT_KEY, normalizedAppClientKey)
        cachedBaseUrl = normalizedBaseUrl
        cachedAppClientKey = normalizedAppClientKey
    }

    val baseUrl: String
        get() = cachedBaseUrl

    val appClientKey: String
        get() = cachedAppClientKey

    private fun normalizeBaseUrl(value: String): String {
        val trimmed = value.trim()
        require(trimmed.isNotBlank()) { "The backend URL cannot be empty" }
        val withScheme = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            trimmed
        } else {
            "http://$trimmed"
        }
        return if (withScheme.endsWith("/")) withScheme else "$withScheme/"
    }
}
