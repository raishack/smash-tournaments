package com.gestortorneos.app.updates

import android.content.Intent
import android.content.ComponentName
import android.content.pm.PackageManager
import android.net.Uri
import android.content.pm.PackageInfo
import android.content.pm.Signature
import java.io.File
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [27])
@Suppress("DEPRECATION")
class AndroidInstallTest {
    private fun info(version: Int, name: String = "com.gestortorneos.app", signer: String = "aabb") = PackageInfo().apply {
        packageName = name; versionCode = version; signatures = arrayOf(Signature(signer))
    }

    @Test fun requiresExpectedIdentityNewVersionAndSameSigner() {
        validateAndroidUpdate(info(11), info(10), 11)
        for (candidate in listOf(info(11, "com.smash.app"), info(11, signer = "ccdd"), info(10), info(12))) {
            try { validateAndroidUpdate(candidate, info(10), 11); fail("Must reject this APK") } catch (_: IllegalArgumentException) { }
        }
    }

    @Test fun installerReceivesOnlyScopedContentUriAndReadPermission() {
        val context = RuntimeEnvironment.getApplication()
        val intent = androidInstallIntent(Uri.parse("content://${context.packageName}.updates/updates/verified.apk"))
        assertEquals(Intent.ACTION_VIEW, intent.action)
        assertEquals("content", intent.data!!.scheme)
        assertEquals("${context.packageName}.updates", intent.data!!.authority)
        assertEquals("application/vnd.android.package-archive", intent.type)
        assertTrue(intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertEquals(0, intent.flags and Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        assertEquals(intent.data, intent.clipData!!.getItemAt(0).uri)
    }

    @Test fun providerExposesOnlyUpdaterCacheAndIsNotExported() {
        val app = RuntimeEnvironment.getApplication()
        val provider = app.packageManager.getProviderInfo(ComponentName(app, UpdateFileProvider::class.java), PackageManager.GET_META_DATA)
        assertEquals("${app.packageName}.updates", provider.authority)
        assertFalse(provider.exported)
        assertTrue(provider.grantUriPermissions)
        val xml = app.resources.getXml(provider.metaData.getInt("android.support.FILE_PROVIDER_PATHS"))
        val roots = mutableListOf<Pair<String, String?>>()
        while (xml.next() != org.xmlpull.v1.XmlPullParser.END_DOCUMENT) {
            if (xml.eventType == org.xmlpull.v1.XmlPullParser.START_TAG && xml.name != "paths") roots += xml.name to xml.getAttributeValue(null, "path")
        }
        xml.close()
        assertEquals(listOf("cache-path" to "app-updates/"), roots)
    }
}
