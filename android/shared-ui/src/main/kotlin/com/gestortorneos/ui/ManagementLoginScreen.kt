package com.gestortorneos.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun ManagementLoginScreen(baseUrl: String) {
    var username by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun login() {
        if (busy || username.isBlank() || password.isEmpty()) return
        busy = true; error = null
        scope.launch {
            try { ManagementSession.login(baseUrl, username, password); password = "" }
            catch (e: Exception) { error = if (e is java.io.IOException) "Could not connect. Check your connection and retry." else e.message }
            finally { busy = false }
        }
    }
    Surface(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().imePadding(), contentAlignment = Alignment.Center) {
            Column(Modifier.widthIn(max = 480.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp)) {
                    Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("MAIN", style = MaterialTheme.typography.headlineLarge, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                        Text("Tournament management", style = MaterialTheme.typography.titleMedium)
                    }
                }
                MainSectionHeading("Sign in")
                Text("Sign in with your management account. Use the same account as display administration.")
                Text(java.net.URI(baseUrl).host.orEmpty(), style = MaterialTheme.typography.labelLarge)
                OutlinedTextField(username, { username = it }, label = { Text("Username") }, singleLine = true, enabled = !busy,
                    modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next))
                OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, enabled = !busy,
                    modifier = Modifier.fillMaxWidth(), visualTransformation = if (passwordVisible) androidx.compose.ui.text.input.VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = { TextButton(onClick = { passwordVisible = !passwordVisible }, enabled = !busy) { Text(if (passwordVisible) "Hide" else "Show") } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { login() }))
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Button(onClick = { login() }, enabled = !busy && username.isNotBlank() && password.isNotEmpty(), modifier = Modifier.fillMaxWidth()) {
                    MainBusyLabel(if (busy) "Signing in…" else "Sign in", busy)
                }
                Text("Contact the superadmin if you need an account or password recovery.", style = MaterialTheme.typography.bodySmall)
                Text("Your session is kept when you close the app. You can sign out from Profile.", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
fun ManagementAccountControls(onLogout: () -> Unit, showLogout: Boolean = true) {
    val session by ManagementSession.state.collectAsState()
    val uri = LocalUriHandler.current
    session?.let {
        Text(it.user.username, style = MaterialTheme.typography.titleMedium)
        MainStatusBadge(if (it.user.role == "SUPER_ADMIN") "Superadmin" else "Manager")
        OutlinedButton(onClick = { uri.openUri(ManagementSession.baseUrl.trimEnd('/') + "/account/") }) {
            Text(if (it.user.role == "SUPER_ADMIN") "My account and users" else "My account and password")
        }
        if (showLogout) MainDangerButton("Sign out", onClick = onLogout)
    }
}
