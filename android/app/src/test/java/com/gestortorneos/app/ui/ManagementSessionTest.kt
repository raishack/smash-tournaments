package com.gestortorneos.app.ui

import com.gestortorneos.ui.ManagementSessionController
import com.gestortorneos.ui.ManagementSessionStorage
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class ManagementSessionTest {
    private class MemoryStorage : ManagementSessionStorage {
        var data: String? = null
        override fun read() = data
        override fun write(value: String) { data = value }
        override fun clear() { data = null }
    }
    @Test fun sessionAuthenticatesAllOperationsAndExpiresOnUnauthorized() = runBlocking {
        val server = MockWebServer(); server.start()
        val storage = MemoryStorage()
        val session = ManagementSessionController().apply { initialize(server.url("/").toString(), storage) }
        try {
            val token = "a".repeat(64)
            server.enqueue(MockResponse().setBody("""{"token":"$token","expiresAt":1999999999999,"user":{"id":"u1","username":"gestor","role":"MANAGER"}}"""))
            session.login(server.url("/").toString(), "gestor", " test password ")
            val login = server.takeRequest()
            assertTrue(login.body.readUtf8().contains(" test password "))
            val client = OkHttpClient.Builder().addInterceptor(session.interceptor).build()
            server.enqueue(MockResponse().setBody("{}"))
            client.newCall(Request.Builder().url(server.url("/operation")).header("X-Admin-Key", "obsolete").build()).execute().close()
            val operation = server.takeRequest()
            assertEquals("Bearer $token", operation.getHeader("Authorization")); assertNull(operation.getHeader("X-Admin-Key"))
            server.enqueue(MockResponse().setResponseCode(403).setBody("{}"))
            client.newCall(Request.Builder().url(server.url("/users")).build()).execute().close(); server.takeRequest()
            assertEquals(token, session.token)
            assertNotNull(storage.data)
            server.enqueue(MockResponse().setResponseCode(401).setBody("{}"))
            client.newCall(Request.Builder().url(server.url("/operation")).build()).execute().close(); server.takeRequest()
            assertEquals("", session.token); assertNull(session.state.value); assertNull(storage.data)
        } finally { server.shutdown() }
    }

    @Test fun restartRestoresSessionWithoutPasswordAndLogoutPersists() = runBlocking {
        MockWebServer().use { server ->
            val backend = server.url("/").toString()
            val storage = MemoryStorage()
            val first = ManagementSessionController().apply { initialize(backend, storage) }
            server.enqueue(MockResponse().setBody("""{"token":"${"a".repeat(64)}","expiresAt":1999999999999,"user":{"id":"u1","username":"gestor","role":"MANAGER"}}"""))
            first.login(backend, "gestor", "not-saved-password")
            assertFalse(storage.data!!.contains("not-saved-password"))
            val restarted = ManagementSessionController().apply { initialize(backend, storage) }
            assertEquals(first.state.value, restarted.state.value)
            restarted.invalidate("b".repeat(64))
            assertNotNull(restarted.state.value)
            server.enqueue(MockResponse().setResponseCode(503))
            val client = OkHttpClient.Builder().addInterceptor(restarted.interceptor).build()
            client.newCall(Request.Builder().url(server.url("/offline")).build()).execute().close()
            assertNotNull(storage.data)
            server.enqueue(MockResponse().setResponseCode(204))
            restarted.logout()
            assertNull(storage.data)
            assertEquals("", ManagementSessionController().apply { initialize(backend, storage) }.token)
        }
    }

    @Test fun expiredCorruptAndDifferentBackendSessionsAreNotRestored() {
        for (data in listOf("broken", "{}",
            """{"backend":"https://main.test","session":{"token":"${"a".repeat(64)}","expiresAt":1,"user":{"id":"u","username":"gestor","role":"MANAGER"}}}""",
            """{"backend":"https://smash.test","session":{"token":"${"a".repeat(64)}","expiresAt":1999999999999,"user":{"id":"u","username":"gestor","role":"MANAGER"}}}""")) {
            val storage = MemoryStorage().apply { this.data = data }
            val session = ManagementSessionController().apply { initialize("https://main.test", storage) }
            assertEquals("", session.token)
            assertNull(storage.data)
        }
    }

    @Test fun delayedLoginCannotRestoreSessionAfterLogout() = runBlocking {
        MockWebServer().use { server ->
            val backend = server.url("/").toString()
            val storage = MemoryStorage()
            val session = ManagementSessionController().apply { initialize(backend, storage) }
            server.enqueue(MockResponse().setBody("""{"token":"${"a".repeat(64)}","expiresAt":1999999999999,"user":{"id":"u1","username":"gestor","role":"MANAGER"}}""").setBodyDelay(400, java.util.concurrent.TimeUnit.MILLISECONDS))
            val thread = Thread { runBlocking { session.login(backend, "gestor", "password") } }.apply { start() }
            assertNotNull(server.takeRequest(3, java.util.concurrent.TimeUnit.SECONDS))
            session.logout()
            thread.join(5000)
            assertFalse(thread.isAlive)
            assertEquals("", session.token)
            assertNull(storage.data)
        }
    }

    @Test fun tokenIsNotSentToAnotherBackend() = runBlocking {
        MockWebServer().use { server -> MockWebServer().use { other ->
            val backend = server.url("/").toString()
            val session = ManagementSessionController().apply { initialize(backend, MemoryStorage()) }
            server.enqueue(MockResponse().setBody("""{"token":"${"a".repeat(64)}","expiresAt":1999999999999,"user":{"id":"u1","username":"gestor","role":"MANAGER"}}"""))
            session.login(backend, "gestor", "password")
            other.enqueue(MockResponse().setResponseCode(401))
            OkHttpClient.Builder().addInterceptor(session.interceptor).build()
                .newCall(Request.Builder().url(other.url("/operation")).build()).execute().close()
            assertNull(other.takeRequest().getHeader("Authorization"))
            assertNotNull(session.state.value)
        } }
    }
}
