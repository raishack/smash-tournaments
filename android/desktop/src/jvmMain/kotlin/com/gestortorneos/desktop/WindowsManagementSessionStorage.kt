package com.gestortorneos.desktop

import com.gestortorneos.ui.ManagementSessionStorage
import com.sun.jna.platform.win32.Crypt32Util
import com.sun.jna.platform.win32.WinCrypt
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

/** DPAPI uses the current Windows account, with no password saved by the app. */
class WindowsManagementSessionStorage(private val file: Path = Path.of(
    System.getenv("LOCALAPPDATA") ?: System.getProperty("user.home"), "TournamentManager", DesktopConfig.desktopApplicationId, "management-session.bin"
)) : ManagementSessionStorage {
    override fun read(): String? = if (!Files.exists(file)) null else
        Crypt32Util.cryptUnprotectData(Files.readAllBytes(file), WinCrypt.CRYPTPROTECT_UI_FORBIDDEN).toString(Charsets.UTF_8)

    override fun write(value: String) {
        val encrypted = Crypt32Util.cryptProtectData(value.toByteArray(Charsets.UTF_8), WinCrypt.CRYPTPROTECT_UI_FORBIDDEN)
        Files.createDirectories(file.parent)
        val temp = Files.createTempFile(file.parent, "session-", ".tmp")
        try {
            Files.write(temp, encrypted)
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } finally { Files.deleteIfExists(temp) }
    }
    override fun clear() { Files.deleteIfExists(file) }
}
