package com.gestortorneos.player.data.remote

import retrofit2.http.GET
import retrofit2.http.Path

data class AndroidAppUpdateDto(
    val applicationId: String,
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val required: Boolean,
    val minSupportedVersionCode: Int? = null,
    val title: String? = null,
    val notes: String? = null,
    val changelog: List<String>? = null,
    val publishedAt: String? = null,
    val sha256: String? = null,
    val sizeBytes: Long? = null,
)

interface AppUpdateApi {
    @GET("api/app-updates/android/{applicationId}")
    suspend fun getAndroidAppUpdate(
        @Path("applicationId") applicationId: String,
    ): AndroidAppUpdateDto
}
