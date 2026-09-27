package com.gestortorneos.app.updates

import com.gestortorneos.ui.*
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.Assert.*
import org.junit.Test

class AppUpdateDownloadTest {
    private val bytes = byteArrayOf(0x50, 0x4b, 0x03, 0x04) + ByteArray(65536) { (it % 127).toByte() }
    private fun pkg(body: ByteArray = bytes) = UpdatePackage(
        "https://your-domain.example/downloads/android/main-test.apk",
        MessageDigest.getInstance("SHA-256").digest(body).joinToString("") { "%02x".format(it) }, body.size.toLong(), "apk",
    )
    private fun fixture(test: suspend (MockWebServer, AppUpdateDownloader, File) -> Unit) = runBlocking {
        val dir = Files.createTempDirectory("main-update-test").toFile()
        try {
            MockWebServer().use { server ->
                server.start()
                val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
                    .addInterceptor { chain -> chain.proceed(chain.request().newBuilder().url(server.url("/installer")).build()) }.build()
                test(server, AppUpdateDownloader(dir, "https://your-domain.example/", client), dir)
            }
        } finally { dir.deleteRecursively() }
    }

    @Test fun downloadIsVerifiedPrivateAndReusedWithoutAnotherRequest() = fixture { server, downloader, _ ->
        server.enqueue(MockResponse().setBody(Buffer().write(bytes)))
        var received = 0L
        val file = downloader.download(pkg()) { count, _ -> received = count }
        assertArrayEquals(bytes, file.readBytes())
        assertEquals(bytes.size.toLong(), received)
        assertEquals(file, downloader.download(pkg()) { _, _ -> })
        assertEquals(1, server.requestCount)
        val request = server.takeRequest()
        assertNull(request.getHeader("X-App-Key"))
        assertNull(request.getHeader("Authorization"))
    }

    @Test fun corruptFileIsRejectedAndRetryCanSucceed() = fixture { server, downloader, dir ->
        val corrupt = bytes.clone().also { it[100] = 99 }
        server.enqueue(MockResponse().setBody(Buffer().write(corrupt)))
        try { downloader.download(pkg()) { _, _ -> }; fail("Must reject corrupt download") } catch (_: IllegalStateException) { }
        assertTrue(dir.listFiles()!!.isEmpty())
        server.enqueue(MockResponse().setBody(Buffer().write(bytes)))
        assertTrue(downloader.verify(downloader.download(pkg()) { _, _ -> }, pkg()))
    }

    @Test fun modifiedCachedInstallerIsDownloadedAgain() = fixture { server, downloader, _ ->
        server.enqueue(MockResponse().setBody(Buffer().write(bytes)))
        val file = downloader.download(pkg()) { _, _ -> }
        file.writeBytes(bytes.clone().also { it[30] = 80 })
        server.enqueue(MockResponse().setBody(Buffer().write(bytes)))
        assertTrue(downloader.verify(downloader.download(pkg()) { _, _ -> }, pkg()))
        assertEquals(2, server.requestCount)
    }

    @Test fun untrustedOriginsAndMissingVerificationNeverMakeARequest() = fixture { server, downloader, _ ->
        val invalid = listOf(
            pkg().copy(url = "http://insecure.example.test/downloads/android/main-test.apk"),
            pkg().copy(url = "https://wrong.example/downloads/android/main-test.apk"),
            pkg().copy(url = "https://your-domain.example/other/main-test.apk"),
            pkg().copy(sha256 = null), pkg().copy(sizeBytes = null), pkg().copy(sizeBytes = 2_000_000_000L),
        )
        for (item in invalid) {
            try { downloader.download(item) { _, _ -> }; fail("Must reject invalid metadata") } catch (_: IllegalArgumentException) { }
        }
        assertEquals(0, server.requestCount)
    }

    @Test fun redirectIsNotFollowed() = fixture { server, downloader, dir ->
        server.enqueue(MockResponse().setResponseCode(302).addHeader("Location", "https://example.org/file.apk"))
        try { downloader.download(pkg()) { _, _ -> }; fail("Must reject redirect") } catch (_: java.io.IOException) { }
        assertEquals(1, server.requestCount)
        assertTrue(dir.listFiles()!!.isEmpty())
    }

    @Test fun missingBytesAndHtmlCannotBecomeInstallers() = fixture { server, downloader, dir ->
        server.enqueue(MockResponse().setBody(Buffer().write(bytes.copyOf(100))))
        try { downloader.download(pkg()) { _, _ -> }; fail("Must reject short response") } catch (_: IllegalArgumentException) { }
        val html = "<!DOCTYPE html><h1>Error</h1>".toByteArray()
        server.enqueue(MockResponse().setBody(Buffer().write(html)))
        try { downloader.download(pkg(html)) { _, _ -> }; fail("Must reject non APK even with matching hash") } catch (_: IllegalStateException) { }
        assertTrue(dir.listFiles()!!.isEmpty())
    }

    @Test fun cancellationInterruptsSocketAndRemovesPartialFile() = fixture { server, downloader, dir ->
        server.enqueue(MockResponse().setBody(Buffer().write(bytes)).throttleBody(1024, 1, TimeUnit.SECONDS))
        coroutineScope {
            val started = CompletableDeferred<Unit>()
            val job = launch { downloader.download(pkg()) { _, _ -> started.complete(Unit) } }
            withTimeout(5000) { started.await() }
            withTimeout(2000) { job.cancelAndJoin() }
        }
        assertTrue(dir.listFiles()!!.isEmpty())
    }

    @Test fun msiUsesItsOwnFormatAndPath() = fixture { server, downloader, _ ->
        val msi = byteArrayOf(0xd0.toByte(), 0xcf.toByte(), 0x11, 0xe0.toByte(), 0xa1.toByte(), 0xb1.toByte(), 0x1a, 0xe1.toByte()) + ByteArray(100)
        val metadata = pkg(msi).copy(url = "https://your-domain.example/downloads/windows/main-test.msi", extension = "msi")
        server.enqueue(MockResponse().setBody(Buffer().write(msi)))
        assertTrue(downloader.verify(downloader.download(metadata) { _, _ -> }, metadata))
    }
}
