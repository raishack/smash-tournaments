package com.gestortorneos.desktop

import com.gestortorneos.ui.UpdatePackage
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

internal fun DesktopAppUpdateInfo.downloadPackage() = UpdatePackage(msiUrl, sha256, sizeBytes, "msi")

internal fun desktopUpdateDirectory(): File = File(
    System.getenv("LOCALAPPDATA") ?: System.getProperty("java.io.tmpdir"),
    "TournamentPlatform/updates",
)

internal fun windowsInstallerCommand(file: File, windowsDirectory: String): List<String> {
    require(file.isFile && file.extension.equals("msi", true)) { "No se encuentra el instalador descargado." }
    // Argument list: spaces in the user profile are safe; no shell interprets the path.
    return listOf(File(windowsDirectory, "System32/msiexec.exe").absolutePath, "/i", file.absolutePath, "/norestart")
}

internal suspend fun launchWindowsInstaller(file: File) = withContext(Dispatchers.IO) {
    check(System.getProperty("os.name").contains("Windows", ignoreCase = true)) { "Este instalador solo sirve para Windows." }
    val windows = System.getenv("SystemRoot") ?: error("No se encontró Windows Installer.")
    val process = ProcessBuilder(windowsInstallerCommand(file, windows)).start()
    // Leave MSI's normal confirmation/UAC UI in charge; never silently elevate or reboot.
    if (process.waitFor(600, TimeUnit.MILLISECONDS)) {
        check(process.exitValue() in listOf(0, 1641, 3010)) {
            "Windows no pudo iniciar la instalación (código ${process.exitValue()}). Puedes volver a intentarlo."
        }
    }
}
