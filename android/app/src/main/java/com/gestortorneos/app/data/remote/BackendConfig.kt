package com.gestortorneos.app.data.remote

import com.gestortorneos.app.BuildConfig

object BackendConfig {
    const val domain = "your-domain.example"
    val baseUrl: String = BuildConfig.BACKEND_BASE_URL
    val displayWebUrl: String = BuildConfig.DISPLAY_WEB_URL
    val appClientKey: String = BuildConfig.APP_CLIENT_KEY
    val adminDeleteKey: String = BuildConfig.ADMIN_DELETE_KEY
}
