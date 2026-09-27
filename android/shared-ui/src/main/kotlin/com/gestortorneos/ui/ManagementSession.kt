package com.gestortorneos.ui

import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.HttpUrl.Companion.toHttpUrl

data class ManagementUser(val id: String, val username: String, val role: String)
data class ManagementLogin(val token: String, val expiresAt: Long, val user: ManagementUser)

/** Implementations encrypt the session using the current OS account/device. Never store passwords. */
interface ManagementSessionStorage {
    fun read(): String?
    fun write(value: String)
    fun clear()
}

private data class SavedManagementSession(val backend: String, val session: ManagementLogin)

open class ManagementSessionController(private val now: () -> Long = System::currentTimeMillis) {
    private val mutable = MutableStateFlow<ManagementLogin?>(null)
    val state = mutable.asStateFlow()
    val token: String get() = mutable.value?.token.orEmpty()
    private val client = OkHttpClient()
    private val gson = Gson()
    private val lock = Any()
    private var storage: ManagementSessionStorage? = null
    private var initialized = false
    private var generation = 0L
    var baseUrl: String = ""
        private set

    /** Called once before creating the UI. Activity recreation must not restore a stale session. */
    fun initialize(backend: String, storage: ManagementSessionStorage) = synchronized(lock) {
        if (initialized) return@synchronized
        initialized = true
        baseUrl = backend.trimEnd('/')
        this.storage = storage
        val saved = runCatching {
            storage.read()?.let { gson.fromJson(it, SavedManagementSession::class.java) }
        }.getOrNull()
        if (saved != null && saved.backend == baseUrl && valid(saved.session)) {
            mutable.value = saved.session
        } else {
            runCatching { storage.clear() }
        }
    }

    private fun valid(session: ManagementLogin?): Boolean = runCatching {
        session != null && session.token.matches(Regex("[a-f0-9]{64}")) && session.expiresAt > now() &&
            session.user.id.isNotBlank() && session.user.username.isNotBlank() &&
            session.user.role in listOf("SUPER_ADMIN", "MANAGER")
    }.getOrDefault(false)

    fun invalidate(sentToken: String) = synchronized(lock) {
        if (sentToken.isNotBlank() && token == sentToken) clearLocked()
    }

    private fun clearLocked() {
        generation++
        mutable.value = null
        runCatching { storage?.clear() }
    }

    val interceptor = Interceptor { chain ->
        val sentToken = synchronized(lock) {
            if (mutable.value?.let { !valid(it) } == true) clearLocked()
            val base = baseUrl.takeIf(String::isNotBlank)?.toHttpUrl()
            val url = chain.request().url
            if (base != null && base.scheme == url.scheme && base.host == url.host && base.port == url.port &&
                (url.encodedPath == base.encodedPath || url.encodedPath.startsWith(base.encodedPath.trimEnd('/') + "/"))) token else ""
        }
        val request = chain.request().newBuilder().removeHeader("X-Admin-Key")
        if (sentToken.isNotBlank()) request.header("Authorization", "Bearer $sentToken")
        val response = chain.proceed(request.build())
        if (response.code == 401) invalidate(sentToken)
        response
    }

    suspend fun login(backend: String, username: String, password: String) = withContext(Dispatchers.IO) {
        val attempt = synchronized(lock) {
            require(!initialized || backend.trimEnd('/') == baseUrl) { "The sign-in server has changed" }
            ++generation
        }
        val request = Request.Builder().url(backend.trimEnd('/') + "/api/management-auth/login").post(
            gson.toJson(mapOf("username" to username.trim(), "password" to password)).toRequestBody("application/json".toMediaType())
        ).build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching { gson.fromJson(body, com.google.gson.JsonObject::class.java).get("message")?.asString }.getOrNull()
                error(message ?: "Could not sign in. Check your connection and try again.")
            }
            val session = gson.fromJson(body, ManagementLogin::class.java)
            require(valid(session)) { "Invalid sign-in response" }
            synchronized(lock) {
                if (attempt != generation) return@synchronized
                baseUrl = backend.trimEnd('/')
                try { storage?.write(gson.toJson(SavedManagementSession(baseUrl, session))) }
                catch (_: Exception) { error("Could not save the session securely. Try again.") }
                mutable.value = session
            }
        }
    }

    suspend fun logout() {
        val (old, backend) = synchronized(lock) {
            val previous = token to baseUrl
            clearLocked()
            previous
        }
        if (old.isBlank()) return
        withContext(Dispatchers.IO) {
            runCatching {
                client.newCall(Request.Builder().url(backend + "/api/management-auth/logout")
                    .header("Authorization", "Bearer $old").post("{}".toRequestBody("application/json".toMediaType())).build())
                    .execute().close()
            }
        }
    }
}

object ManagementSession : ManagementSessionController()
