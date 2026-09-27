# Development and verification

## Source layout

| Directory | Purpose |
| --- | --- |
| `backend/` | Express, TypeScript, PostgreSQL, tournament operations and integrations |
| `display-web/` | Display, administration, management, registration and results editor |
| `android/app/` | Android management |
| `android/app-player/` | Android Players |
| `android/desktop/` | Windows management, using Compose Desktop |
| `android/shared-*/` | Shared Kotlin models, behavior and presentation |
| `ios-manage/`, `ios-player/` | SwiftUI sources and XcodeGen project specifications |
| `infra/postgres/` | Initial schema |
| `branding/` | Generic assets and applied configuration |
| `scripts/` | Configuration, integrity checks and browser fixtures |

## Backend and branding checks

```bash
npm ci
npm run test:backend
npm run test:template
npm run check:docs
```

Backend tests use isolated fixtures, including PGlite for database operations. Branding tests create a temporary copy, initialize a new installation, apply custom identities and artwork, preserve secrets across repeated configuration and reject invalid URLs. They do not edit your installed server.

For local backend development, configure PostgreSQL and environment variables as in [Installation](INSTALLATION.md), then use `npm run dev:backend`. The development server is not a replacement for the production reverse proxy and HTTPS configuration.

## Browser checks

Build first, install the Playwright browser, and run relevant `scripts/check-*.mjs` fixtures from the root. `npm run screenshots` verifies that the example pages render without uncaught browser errors. Set `CHROME_PATH` to use another Chromium executable.

## Native checks

On Windows with JDK 21 and Android SDK 36:

```powershell
./android/gradlew.bat -p android :app:testDebugUnitTest :desktop:test :app-player:testDebugUnitTest
./android/gradlew.bat -p android :app:assembleRelease :app-player:assembleRelease :desktop:packageReleaseMsi
```

Use `android/gradlew` on macOS/Linux. MSI packaging requires Windows; build the appropriate platform target elsewhere. Follow [Clients](CLIENTS.md) for signing and isolated iOS builds.

The workflow in `.github/workflows/verify.yml` runs backend tests, branding tests and documentation link checks. It does not publish installers or deploy a server.

## Release checklist

1. Back up database, assets, private configuration and signing identities.
2. Test affected backend and browser flows, including denied/expired authentication and archived events.
3. Test native login/session restoration, fullscreen interaction and updates on real devices.
4. Build with the installation's stable IDs and signing keys.
5. Recalculate installer size/SHA-256; verify the actual public download.
6. Record what was compiled, installed, published and distributed through Apple separately.

See [Updates](UPDATES.md). Never add real `.env`, tokens, player databases, signing keys or deployment logs to a public pull request.

## Known verification limits

Automated fixtures do not prove real SMTP delivery, start.gg permissions/rate behavior, APNs/FCM, device installer prompts or third-party asset availability. Configure these services for your own installation and exercise them before an event. Review `npm audit` and upstream release notes when upgrading dependencies.
