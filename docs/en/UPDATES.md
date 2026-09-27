# Publishing Android and Windows updates

[Back to the project](../../README.md)

Publish only apps built for **your own** backend, application IDs and signing identities. Do not reuse another installation's APK, MSI or manifest. iOS updates use Apple's distribution workflow.

## 1. Build a new version

- Android: increase `versionCode` and `versionName` in the relevant app's `build.gradle.kts`.
- Windows: increase `packageVersion` in `android/desktop/build.gradle.kts`.
- Preserve Android signing certificates/application IDs and Windows UpgradeCode.
- Run tests and inspect the packaged Windows runtime before distributing.

## 2. Copy installers first

Create the following folders if they do not exist:

```text
data/android-updates/files/
data/windows-updates/files/
```

Copy the complete APK/MSI files there. Use new filenames for each version. Keep the previous installers available while clients transition.

## 3. Prepare manifests

`data/android-updates/manifest.json`:

```json
{
  "apps": [{
    "applicationId": "org.northclub.events",
    "versionCode": 11,
    "versionName": "0.1.10",
    "apkFile": "north-events-0.1.10.apk",
    "required": false,
    "title": "Update available",
    "notes": "Describe the user-visible changes."
  }]
}
```

Add a separate entry for Players with its own ID/version/file. For Windows, create `data/windows-updates/manifest.json` using `version` and `msiFile`:

```json
{
  "apps": [{
    "applicationId": "org.northclub.events.desktop",
    "version": "0.1.13",
    "msiFile": "NorthDesk-0.1.13.msi",
    "required": false,
    "notes": "Describe the user-visible changes."
  }]
}
```

These version numbers are examples: they must match your compiled artifacts and exceed the installed version. Generate the mandatory integrity fields from the actual files:

```bash
node scripts/update-installer-integrity.mjs
```

This writes `sha256` and `sizeBytes`. Never retain values from an older installer. Prepare manifests in staging and replace live manifests only after all referenced installers are uploaded completely.

## 4. Verify externally

Check your public endpoints:

```text
https://events.example.org/api/app-updates/android/org.northclub.events
https://events.example.org/api/app-updates/windows/org.northclub.events.desktop
```

Verify returned version, application ID, URL, SHA-256 and byte length. Download the full public file and compare its hash/size, then test an upgrade from the previous installed version on a spare device.

The app downloads from its configured backend and checks integrity. Android may ask the user to allow installation from this app; Windows launches the installer and may require confirmation. These are not silent operating-system upgrades.

## Rollback

Keep previous manifests and installers. Restoring a manifest changes what is offered next; it does not automatically downgrade an already-installed app. Android version-code and Windows installer rules still apply. Take server/database backups independently; a client rollback is not a database rollback.
