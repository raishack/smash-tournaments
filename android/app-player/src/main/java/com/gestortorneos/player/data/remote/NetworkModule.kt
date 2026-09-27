package com.gestortorneos.player.data.remote

import okhttp3.Interceptor
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object NetworkModule {
    @Volatile
    private var cachedBaseUrl: String? = null
    @Volatile
    private var cachedAppClientKey: String? = null
    @Volatile
    private var cachedRetrofit: Retrofit? = null
    @Volatile
    private var cachedPlayerApi: PlayerApi? = null
    @Volatile
    private var cachedAppUpdateApi: AppUpdateApi? = null

    fun playerApi(): PlayerApi {
        val settings = BackendConfig.currentSettings()
        val needsRefresh = cachedPlayerApi == null
            || cachedRetrofit == null
            || cachedBaseUrl != settings.baseUrl
            || cachedAppClientKey != settings.appClientKey

        if (needsRefresh) {
            synchronized(this) {
                val refreshedSettings = BackendConfig.currentSettings()
                val stillNeedsRefresh = cachedPlayerApi == null
                    || cachedRetrofit == null
                    || cachedBaseUrl != refreshedSettings.baseUrl
                    || cachedAppClientKey != refreshedSettings.appClientKey

                if (stillNeedsRefresh) {
                    val headerInterceptor = Interceptor { chain ->
                        val requestBuilder = chain.request().newBuilder()
                        if (refreshedSettings.appClientKey.isNotBlank()) {
                            requestBuilder.header("X-App-Key", refreshedSettings.appClientKey)
                        }
                        chain.proceed(requestBuilder.build())
                    }

                    val okHttp = OkHttpClient.Builder()
                        .addInterceptor(headerInterceptor)
                        .retryOnConnectionFailure(false)
                        .connectTimeout(20, TimeUnit.SECONDS)
                        .readTimeout(180, TimeUnit.SECONDS)
                        .writeTimeout(180, TimeUnit.SECONDS)
                        .callTimeout(180, TimeUnit.SECONDS)
                        .build()

                    val retrofit = Retrofit.Builder()
                        .baseUrl(refreshedSettings.baseUrl)
                        .client(okHttp)
                        .addConverterFactory(GsonConverterFactory.create())
                        .build()

                    cachedBaseUrl = refreshedSettings.baseUrl
                    cachedAppClientKey = refreshedSettings.appClientKey
                    cachedRetrofit = retrofit
                    cachedPlayerApi = retrofit.create(PlayerApi::class.java)
                    cachedAppUpdateApi = retrofit.create(AppUpdateApi::class.java)
                }
            }
        }

        return cachedPlayerApi ?: error("PlayerApi not initialized")
    }

    fun appUpdateApi(): AppUpdateApi {
        playerApi()
        return cachedAppUpdateApi ?: error("AppUpdateApi not initialized")
    }
}
