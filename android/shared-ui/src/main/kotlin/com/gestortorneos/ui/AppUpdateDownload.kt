package com.gestortorneos.ui

import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request

data class UpdatePackage(val url: String, val sha256: String?, val sizeBytes: Long?, val extension: String)

data class UpdateDownloadState(
    val busy: Boolean = false,
    val downloaded: Long = 0,
    val total: Long = 0,
    val file: File? = null,
    val error: String? = null,
)

/** A separate client deliberately excludes API keys, admin credentials and redirects. */
class AppUpdateDownloader(
    private val directory: File,
    private val trustedBaseUrl: String,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .followRedirects(false).followSslRedirects(false)
        .connectTimeout(20, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build(),
) {
    private fun validatePackage(pkg: UpdatePackage) {
        val url = pkg.url.toHttpUrl()
        val origin = trustedBaseUrl.toHttpUrl()
        val platform = when (pkg.extension) { "apk" -> "android"; "msi" -> "windows"; else -> error("Unsupported update format.") }
        require(origin.isHttps && origin.username.isEmpty() && origin.password.isEmpty() &&
            url.isHttps && url.host == origin.host && url.port == origin.port &&
            url.username.isEmpty() && url.password.isEmpty() && url.query == null && url.fragment == null &&
            url.encodedPath.startsWith("/downloads/$platform/") && url.pathSegments.size == 3 &&
            url.pathSegments.last().endsWith(".${pkg.extension}")) { "The update URL is invalid for Smash Tournaments." }
        require(pkg.sha256?.matches(Regex("[a-fA-F0-9]{64}")) == true &&
            pkg.sizeBytes != null && pkg.sizeBytes in 8..1_073_741_824L) {
            "The server has not published verification data. Check for updates again."
        }
    }

    suspend fun verify(file: File, pkg: UpdatePackage): Boolean = withContext(Dispatchers.IO) {
        validatePackage(pkg)
        if (!file.isFile || file.length() != pkg.sizeBytes) return@withContext false
        val hash = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val bytes = ByteArray(65536)
            while (true) {
                currentCoroutineContext().ensureActive()
                val count = input.read(bytes)
                if (count < 0) break
                hash.update(bytes, 0, count)
            }
        }
        if (!hash.digest().joinToString("") { "%02x".format(it) }.equals(pkg.sha256, true)) return@withContext false
        val header = file.inputStream().use { it.readNBytesCompat(8) }
        if (pkg.extension == "apk") header.take(4) == listOf<Byte>(0x50, 0x4b, 0x03, 0x04)
        else header.contentEquals(byteArrayOf(0xd0.toByte(), 0xcf.toByte(), 0x11, 0xe0.toByte(), 0xa1.toByte(), 0xb1.toByte(), 0x1a, 0xe1.toByte()))
    }

    suspend fun download(pkg: UpdatePackage, progress: (Long, Long) -> Unit): File = withContext(Dispatchers.IO) {
        validatePackage(pkg)
        check(directory.isDirectory || directory.mkdirs()) { "Could not create the updates folder." }
        val target = File(directory, "${pkg.sha256!!.lowercase()}.${pkg.extension}")
        val partial = File(directory, "${target.name}.part")
        if (verify(target, pkg)) { progress(pkg.sizeBytes!!, pkg.sizeBytes); return@withContext target }
        target.delete()
        require(directory.usableSpace > pkg.sizeBytes!! + 16_777_216L) { "There is not enough space to download the update." }
        val call = client.newCall(Request.Builder().url(pkg.url).build())
        coroutineScope {
            // Closing the call interrupts a blocked socket read as soon as the user cancels.
            val cancelWatcher = launch(start = CoroutineStart.UNDISPATCHED) {
                try { awaitCancellation() } finally { call.cancel() }
            }
            try {
                call.execute().use { response ->
                    if (response.code != 200) throw IOException("Could not download the update (HTTP ${response.code}).")
                    val body = response.body ?: throw IOException("The server returned an empty file.")
                    require(body.contentLength() == -1L || body.contentLength() == pkg.sizeBytes) { "The update size does not match. Try again." }
                    var received = 0L
                    var lastProgress = 0L
                    body.byteStream().use { input ->
                        partial.outputStream().use { output ->
                            val buffer = ByteArray(65536)
                            while (true) {
                                ensureActive()
                                val count = input.read(buffer)
                                if (count < 0) break
                                received += count
                                require(received <= pkg.sizeBytes) { "The download exceeds the expected size." }
                                output.write(buffer, 0, count)
                                val now = System.nanoTime()
                                if (now - lastProgress > 100_000_000L) { progress(received, pkg.sizeBytes); lastProgress = now }
                            }
                            output.fd.sync()
                        }
                    }
                }
                check(verify(partial, pkg)) { "The file is incomplete or failed verification. Download it again." }
                ensureActive()
                Files.move(partial.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
                progress(pkg.sizeBytes, pkg.sizeBytes)
                // Only our previously verified installer files are eligible for cleanup.
                directory.listFiles()?.filter { it != target && it.name.matches(Regex("[a-f0-9]{64}\\.(apk|msi)(\\.part)?")) }?.forEach { it.delete() }
                target
            } catch (error: Exception) {
                // Socket closure during cancellation must remain cancellation, not a failed download.
                ensureActive()
                throw error
            } finally {
                cancelWatcher.cancel()
                partial.delete()
            }
        }
    }
}

private fun java.io.InputStream.readNBytesCompat(count: Int): ByteArray {
    val bytes = ByteArray(count)
    var offset = 0
    while (offset < count) { val read = read(bytes, offset, count - offset); if (read < 0) break; offset += read }
    return bytes.copyOf(offset)
}

class AppUpdateTransfer(private val scope: CoroutineScope, private val downloader: AppUpdateDownloader) {
    private val mutable = MutableStateFlow(UpdateDownloadState())
    val state = mutable.asStateFlow()
    private var job: Job? = null

    fun download(pkg: UpdatePackage) {
        if (job?.isActive == true) return
        mutable.value = UpdateDownloadState(busy = true, total = pkg.sizeBytes ?: 0)
        job = scope.launch {
            try {
                val file = downloader.download(pkg) { received, total -> mutable.value = UpdateDownloadState(true, received, total) }
                mutable.value = UpdateDownloadState(file = file)
            } catch (error: CancellationException) {
                mutable.value = UpdateDownloadState()
                throw error
            } catch (error: Exception) {
                mutable.value = UpdateDownloadState(error = error.message ?: "Could not download the update.")
            }
        }
    }

    fun cancel() { job?.cancel() }
    fun reset() { if (job?.isActive != true) mutable.value = UpdateDownloadState() }
}
