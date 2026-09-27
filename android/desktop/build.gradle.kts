plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.compose")
    id("org.jetbrains.kotlin.plugin.compose")
}

kotlin {
    jvmToolchain(21)

    sourceSets {
        main {
            kotlin.srcDirs("src/jvmMain/kotlin")
            kotlin.srcDirs("../shared-ui/src/main/kotlin")
            resources.srcDirs("src/jvmMain/resources")
        }
    }
}

dependencies {
    testImplementation(kotlin("test"))
    implementation(compose.desktop.currentOs)
    implementation("net.java.dev.jna:jna-platform:5.17.0")
    implementation(compose.material3)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.9.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}

compose.desktop {
    application {
        mainClass = "com.gestortorneos.desktop.MainKt"
        buildTypes.release.proguard {
            isEnabled.set(false)
        }

        nativeDistributions {
            // Gson instantiates Kotlin API/session DTOs via Unsafe. jlink cannot
            // discover this reflective dependency; the full development JDK hides it.
            modules("jdk.unsupported")
            packageName = "SmashTournaments"
            packageVersion = "0.1.12"
            description = "Tournament manager desktop client"
            vendor = "Smash Tournaments"
            targetFormats(
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Exe,
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Msi,
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Deb,
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Rpm
            )
            windows {
                upgradeUuid = "7909c3d9-5584-4117-bc42-d8716265fa55"
                iconFile.set(project.file("src/jvmMain/resources/app-icon.ico"))
                shortcut = true
                menu = true
                menuGroup = "Smash Tournaments"
            }
            linux {
                iconFile.set(project.file("src/jvmMain/resources/app-icon-linux.png"))
                shortcut = true
                menuGroup = "Smash Tournaments"
                debMaintainer = "maintainer@example.com"
            }
        }
    }
}

val checkPackagedRuntime by tasks.registering(Exec::class) {
    group = "verification"
    description = "Checks login and session restore using the shipped Windows runtime."
    dependsOn("createDistributable")
    val launcher = javaToolchains.launcherFor { languageVersion.set(JavaLanguageVersion.of(21)) }
    doFirst {
        commandLine(
            "node", rootProject.file("../scripts/check-windows-runtime.mjs").absolutePath,
            launcher.get().metadata.installationPath.asFile.absolutePath,
            layout.buildDirectory.dir("compose/binaries/main/app").get().asFile.absolutePath
        )
    }
}

// A successful MSI build alone does not prove that its reduced JVM can log in.
tasks.matching { it.name in listOf("packageMsi", "packageReleaseMsi", "packageExe", "packageReleaseExe") }
    .configureEach { dependsOn(checkPackagedRuntime) }
