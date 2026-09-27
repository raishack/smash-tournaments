package com.gestortorneos.desktop

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class OperationNetworkTest {
    @Test fun revisionHeadersSurviveLateRefreshAndErrorsAreRedacted() {
        val received = mutableListOf<Pair<String?, String?>>()
        val oldRevision = "a".repeat(64)
        val newRevision = "b".repeat(64)
        val read = OperationNetwork.beginRead()
        OperationNetwork.remember("network-test", oldRevision, read)
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/tournaments/t1/matches/network-test/game-win") { exchange ->
            received.add(exchange.requestHeaders.getFirst("X-Match-Revision") to exchange.requestHeaders.getFirst("X-Operation-Id"))
            assertEquals("Windows", exchange.requestHeaders.getFirst("X-Client-Platform"))
            if (received.size == 1) {
                exchange.responseHeaders.add("X-Match-Revision", newRevision)
                exchange.sendResponseHeaders(200, 2)
                exchange.responseBody.use { it.write("{}".toByteArray()) }
            } else {
                val error = """{"message":"token=secret-value https://host/path?token=url-secret"}""".toByteArray()
                exchange.sendResponseHeaders(409, error.size.toLong())
                exchange.responseBody.use { it.write(error) }
            }
        }
        server.start()
        val client = OkHttpClient.Builder().addInterceptor(OperationNetwork.interceptor("Windows", "test")).build()
        try {
            val request = Request.Builder().url("http://127.0.0.1:${server.address.port}/api/tournaments/t1/matches/network-test/game-win").post("{}".toRequestBody()).build()
            client.newCall(request).execute().use { assertEquals(200, it.code) }
            OperationNetwork.remember("network-test", oldRevision, read) // Late poll must not undo the acknowledgement.
            client.newCall(request).execute().use { assertEquals(409, it.code) }
            assertEquals(listOf(oldRevision, newRevision), received.map { it.first })
            assertTrue(received.all { !it.second.isNullOrBlank() })
            assertNotEquals(received[0].second, received[1].second)
            val diagnostic = OperationNetwork.diagnostics("Windows", "test")
            assertTrue(diagnostic.contains("HTTP 409"))
            assertFalse(diagnostic.contains("secret-value"))
            assertFalse(diagnostic.contains("url-secret"))
        } finally {
            server.stop(0)
            client.connectionPool.evictAll()
            client.dispatcher.executorService.shutdown()
        }
    }
}
