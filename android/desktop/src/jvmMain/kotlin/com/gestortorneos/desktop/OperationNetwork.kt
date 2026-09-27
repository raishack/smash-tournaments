package com.gestortorneos.desktop

import okhttp3.Interceptor
import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong

data class MatchSyncStatus(val state: String = "", val message: String = "", val error: String? = null, val canRetry: Boolean = false)
data class ImportProgressDto(val stage: String = "", val message: String = "", val completed: Int? = null, val total: Int? = null) {
    val label: String get() = message + if (completed != null && total != null) " ($completed/$total)" else ""
}
data class ActivityEntry(val matchLabel: String? = null, val id: String, val createdAt: String, val matchId: String?, val summary: String, val detail: String)
data class TournamentActivity(val entries: List<ActivityEntry> = emptyList(), val diagnosticText: String = "")

object OperationNetwork {
    private val sequence = AtomicLong()
    private val revisions = mutableMapOf<String, Pair<Long, String>>()
    private val failures = ArrayDeque<String>()
    fun beginRead(): Long = sequence.incrementAndGet()
    @Synchronized fun remember(id: String, revision: String?, request: Long) {
        if (revision != null && request >= (revisions[id]?.first ?: 0)) revisions[id] = request to revision
    }
    @Synchronized private fun revision(id: String?): String? = revisions[id]?.second
    @Synchronized private fun failure(message: String) {
        failures.addLast("${Instant.now()} ${sanitize(message)}")
        while (failures.size > 30) failures.removeFirst()
    }
    @Synchronized fun diagnostics(platform: String, version: String): String =
        "Cliente: $platform $version\nÚltimos errores del cliente:\n" + failures.joinToString("\n")

    private fun sanitize(value: String): String = value
        .replace(Regex("Bearer\\s+[^\\s,;\"']+", RegexOption.IGNORE_CASE), "Bearer [oculto]")
        .replace(Regex("https?://[^\\s\"']+", RegexOption.IGNORE_CASE), "[URL omitida]")
        .replace(Regex("((?:token|password|secret|authorization|api[_-]?key|x-app-key|x-admin-key)[\"']?\\s*[=:]\\s*[\"']?)[^\\s,;&\"']+", RegexOption.IGNORE_CASE), "$1[oculto]")
        .take(1000)

    fun interceptor(platform: String, version: String) = Interceptor { chain ->
        val original = chain.request()
        val requestNumber = sequence.incrementAndGet()
        val segments = original.url.pathSegments
        val matchIndex = segments.indexOf("matches")
        val matchId = if (matchIndex >= 0) segments.getOrNull(matchIndex + 1) else null
        val builder = original.newBuilder().header("X-Client-Platform", platform).header("X-App-Version", version)
        if (original.method != "GET") {
            builder.header("X-Operation-Id", UUID.randomUUID().toString())
            revision(matchId)?.let { builder.header("X-Match-Revision", it) }
        }
        try {
            val response = chain.proceed(builder.build())
            if (matchId != null) remember(matchId, response.header("X-Match-Revision"), requestNumber)
            if (!response.isSuccessful) failure("${original.method} match=${matchId ?: "-"} HTTP ${response.code}: ${response.peekBody(2048).string()}")
            response
        } catch (error: Exception) {
            failure("${original.method} match=${matchId ?: "-"}: ${error.message}")
            throw error
        }
    }
}
