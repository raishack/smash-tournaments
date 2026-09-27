package com.gestortorneos.app.data.remote

import okhttp3.OkHttpClient
import okhttp3.Request
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object NetworkModule {
    private val retrofit by lazy {
        val client = OkHttpClient.Builder()
            .addInterceptor(com.gestortorneos.ui.ManagementSession.interceptor)
            .addInterceptor(OperationNetwork.interceptor("Android", com.gestortorneos.app.BuildConfig.VERSION_NAME))
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(3, TimeUnit.MINUTES)
            .writeTimeout(3, TimeUnit.MINUTES)
            .callTimeout(3, TimeUnit.MINUTES)
            .addInterceptor { chain ->
                val request: Request = chain.request()
                    .newBuilder()
                    .addHeader("X-App-Key", BackendConfig.appClientKey)
                    .apply { if (chain.request().url.encodedPath.contains("/ladder/")) header("X-Admin-Key", BackendConfig.adminDeleteKey) }
                    .build()
                chain.proceed(request)
            }
            .build()

        Retrofit.Builder()
            .baseUrl(BackendConfig.baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    val tournamentApi: TournamentApi by lazy {
        retrofit.create(TournamentApi::class.java)
    }

    val appUpdateApi: AppUpdateApi by lazy {
        retrofit.create(AppUpdateApi::class.java)
    }
}
