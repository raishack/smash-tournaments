package com.gestortorneos.desktop

import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

class WindowsManagementSessionStorageTest {
    @Test fun dpapiRestoresFromAnotherStoreInstanceAndErasesOnLogout() {
        if (!System.getProperty("os.name").startsWith("Windows")) return
        val directory = Files.createTempDirectory("main-session-check-")
        val file = directory.resolve("session.bin")
        try {
            val value = "fixture-session-token-" + "a".repeat(64)
            WindowsManagementSessionStorage(file).write(value)
            assertFalse(Files.readAllBytes(file).toString(Charsets.UTF_8).contains(value))
            val reopened = WindowsManagementSessionStorage(file)
            assertEquals(value, reopened.read())
            reopened.write("replacement")
            assertEquals("replacement", WindowsManagementSessionStorage(file).read())
            reopened.clear()
            assertNull(WindowsManagementSessionStorage(file).read())
        } finally { Files.deleteIfExists(file); Files.deleteIfExists(directory) }
    }
}
