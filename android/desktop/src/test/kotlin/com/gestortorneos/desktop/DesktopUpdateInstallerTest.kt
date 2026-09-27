package com.gestortorneos.desktop

import java.nio.file.Files
import kotlin.test.*

class DesktopUpdateInstallerTest {
    @Test fun installerUsesSeparateArgumentsForPathsWithSpacesAndNeverReboots() {
        val directory = Files.createTempDirectory("Tournament Platform updater space ").toFile()
        try {
            val installer = java.io.File(directory, "Tournament Platform update.msi").apply { writeText("fixture") }
            val args = windowsInstallerCommand(installer, "C:/Windows")
            assertEquals(listOf("/i", installer.absolutePath, "/norestart"), args.drop(1))
            assertTrue(args.first().endsWith("msiexec.exe"))
            assertFalse(args.contains("/quiet"))
            assertFailsWith<IllegalArgumentException> { windowsInstallerCommand(java.io.File(directory, "missing.msi"), "C:/Windows") }
        } finally { directory.deleteRecursively() }
    }
}
