package com.gestortorneos.player.updates

import android.app.Application
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.gestortorneos.player.data.remote.BackendConfig
import com.gestortorneos.player.BuildConfig
import com.gestortorneos.player.data.remote.AndroidAppUpdateDto
import com.gestortorneos.player.data.remote.NetworkModule
import com.gestortorneos.ui.*
import java.io.File
import kotlinx.coroutines.*
import retrofit2.HttpException

internal fun AndroidAppUpdateDto.downloadPackage() = UpdatePackage(apkUrl, sha256, sizeBytes, "apk")

@Suppress("DEPRECATION")
internal fun validateAndroidUpdate(archive: PackageInfo, installed: PackageInfo, expectedVersion: Int) {
    require(archive.packageName == installed.packageName &&
        PackageInfoCompat.getLongVersionCode(archive) == expectedVersion.toLong() &&
        expectedVersion > PackageInfoCompat.getLongVersionCode(installed)) { "El APK no corresponde a esta aplicación o versión." }
    val installedSigners = if (Build.VERSION.SDK_INT >= 28) installed.signingInfo?.apkContentsSigners else installed.signatures
    val archiveSigners = if (Build.VERSION.SDK_INT >= 28) archive.signingInfo?.let {
        if (it.hasMultipleSigners()) it.apkContentsSigners else it.signingCertificateHistory
    } else archive.signatures
    require(!installedSigners.isNullOrEmpty() && !archiveSigners.isNullOrEmpty() && installedSigners.all { it in archiveSigners }) {
        "La firma del APK no coincide con la aplicación instalada."
    }
}

class AndroidUpdateViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application
    val downloader = AppUpdateDownloader(File(app.cacheDir, "app-updates"), BackendConfig.currentSettings().baseUrl)
    val transfer = AppUpdateTransfer(viewModelScope, downloader)
    var update by mutableStateOf<AndroidAppUpdateDto?>(null); private set
    var visible by mutableStateOf(false); private set
    var checking by mutableStateOf(false); private set
    var installing by mutableStateOf(false); private set
    var message by mutableStateOf<String?>(null); private set
    var installError by mutableStateOf<String?>(null)
    private var checked = false

    fun check(manual: Boolean = false) {
        if (checking || installing || transfer.state.value.busy) return
        if (checked && !manual) return
        checked = true
        checking = true
        viewModelScope.launch {
            try {
                val remote = try { NetworkModule.appUpdateApi().getAndroidAppUpdate(app.packageName) }
                    catch (error: HttpException) { if (error.code() == 404) null else throw error }
                require(remote == null || remote.applicationId == app.packageName) { "La actualización no corresponde a Smash Tournaments." }
                val next = remote?.takeIf { it.versionCode > BuildConfig.VERSION_CODE }
                if (next?.versionCode != update?.versionCode || next?.sha256 != update?.sha256) transfer.reset()
                update = next
                visible = next != null
                message = if (next == null) "Tienes la última versión (${BuildConfig.VERSION_NAME})." else "Nueva versión: ${next.versionName}."
            } catch (error: CancellationException) { throw error }
            catch (_: Exception) { message = "No se pudo comprobar la actualización. Revisa la conexión y vuelve a intentarlo." }
            finally { checking = false }
        }
    }

    fun show() { if (update != null) visible = true else check(true) }
    fun dismiss() { visible = false }

    fun install(context: Context) {
        val target = update ?: return
        val file = transfer.state.value.file ?: return
        if (installing) return
        installing = true
        viewModelScope.launch {
            try {
                kotlin.check(downloader.verify(file, target.downloadPackage())) { "El archivo ya no es válido. Vuelve a descargarlo." }
                withContext(Dispatchers.IO) {
                    @Suppress("DEPRECATION")
                    val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
                    @Suppress("DEPRECATION")
                    val archive = app.packageManager.getPackageArchiveInfo(file.path, flags) ?: error("No se pudo leer el APK.")
                    @Suppress("DEPRECATION")
                    val installed = app.packageManager.getPackageInfo(app.packageName, flags)
                    validateAndroidUpdate(archive, installed, target.versionCode)
                }
                context.startActivity(androidInstallIntent(context, file))
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { installError = error.message ?: "No se pudo abrir el instalador."; transfer.reset() }
            finally { installing = false }
        }
    }
}

internal fun androidInstallIntent(context: Context, file: File): Intent {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
    return androidInstallIntent(uri)
}

internal fun androidInstallIntent(uri: Uri): Intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        clipData = ClipData.newRawUri("Actualización Smash Tournaments", uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
}

@Composable
fun AndroidAppUpdateGate(model: AndroidUpdateViewModel = viewModel()) {
    val context = LocalContext.current
    val state by model.transfer.state.collectAsState()
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (context.packageManager.canRequestPackageInstalls()) model.install(context)
        else model.installError = "Para instalar la actualización, permite que Smash Tournaments instale aplicaciones en Ajustes. El archivo sigue descargado."
    }
    LaunchedEffect(model) { model.check() }
    val target = model.update
    if (target != null && model.visible) {
        AppUpdateDialog(
            title = target.title, currentVersion = BuildConfig.VERSION_NAME, targetVersion = target.versionName,
            notes = target.notes, changelog = target.changelog.orEmpty(),
            required = target.required || (target.minSupportedVersionCode?.let { BuildConfig.VERSION_CODE < it } == true),
            state = state, installing = model.installing,
            installHint = "La descarga se guarda en la app. Android te pedirá confirmar la instalación y, la primera vez, permitir que Smash Tournaments instale aplicaciones.",
            onDownload = { model.transfer.download(target.downloadPackage()) },
            onInstall = {
                if (context.packageManager.canRequestPackageInstalls()) model.install(context)
                else try { permissionLauncher.launch(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))) }
                catch (_: Exception) { model.installError = "Abre Ajustes > Aplicaciones > Smash Tournaments y permite instalar aplicaciones desconocidas." }
            },
            onCancel = model.transfer::cancel, onDismiss = model::dismiss,
        )
    }
    model.installError?.let { error ->
        AlertDialog(onDismissRequest = { model.installError = null }, title = { Text("No se pudo instalar") },
            text = { Text(error) }, confirmButton = { TextButton(onClick = { model.installError = null }) { Text("Cerrar") } })
    }
}

@Composable
fun AndroidUpdateSettings(model: AndroidUpdateViewModel = viewModel()) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Actualizaciones", style = MaterialTheme.typography.titleMedium)
            Text("Versión instalada: ${BuildConfig.VERSION_NAME}")
            model.message?.let { Text(it) }
            OutlinedButton(onClick = { model.check(true) }, enabled = !model.checking) {
                Text(if (model.checking) "Comprobando…" else "Buscar actualizaciones")
            }
            if (model.update != null) Button(onClick = model::show) { Text("Ver actualización") }
        }
    }
}
