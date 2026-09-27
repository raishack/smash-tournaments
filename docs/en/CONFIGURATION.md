# Configuration and optional services

[Back to the project](../../README.md)

Private server settings live in `.env`. Branding contains only public client configuration. Never put SMTP/OAuth/database passwords or service-account keys into web scripts or native clients.

## Core variables

| Variable | Meaning |
| --- | --- |
| `PORT` | Backend port; keep `4000` with the included proxy |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database initialization |
| `DATABASE_URL` | Connection URL; Docker hostname is `db` |
| `PUBLIC_BASE_URL` | Your HTTPS origin for links/callbacks |
| `APP_CLIENT_KEY` | Public key embedded in clients; **not an admin password** |
| `MANAGEMENT_BOOTSTRAP_USERNAME` | Initial superadmin username |
| `MANAGEMENT_BOOTSTRAP_PASSWORD` | Initial password, at least 10 characters; used only on first initialization |
| `SEED_DEMO_DATA` | Optional example event in an empty database; default `false` |
| `SITE_DOMAIN` | DNS name for the optional HTTPS proxy |

If manually changing a database password, update both database settings and the URL, URL-encoding special characters. Changing `.env` does not change an existing PostgreSQL user's password: migrate that deliberately. `ADMIN_DELETE_KEY` is legacy and remains empty; use management accounts.

## SMTP

```dotenv
REGISTRATION_MAIL_FROM=Events <events@example.org>
REGISTRATION_SMTP_HOST=smtp.example.org
REGISTRATION_SMTP_PORT=587
REGISTRATION_SMTP_SECURE=false
REGISTRATION_SMTP_USER=events@example.org
REGISTRATION_SMTP_PASSWORD=
```

Enter the actual password privately. Use your provider's settings: 587 normally uses STARTTLS (`SECURE=false`), while 465 normally uses implicit TLS (`SECURE=true`). Authorize the sender/domain and recreate the backend after changes.

Test a real request → email → verification → participant record. Automated tests use simulated mail delivery and cannot prove deliverability.

## start.gg

- `STARTGG_API_TOKEN`: supported server-side imports and result synchronization.
- `STARTGG_OAUTH_CLIENT_ID` / `STARTGG_OAUTH_CLIENT_SECRET`: your own OAuth app for Players.
- Server callback: `https://events.example.org/api/player/auth/startgg/callback`.
- Native return URI: `<playerCallbackScheme>://auth/callback`; keep Android/iOS aligned.

Create these resources in your own start.gg account. Reporting also requires permission for the event. Imports use background jobs/batches; keep the backend running and inspect pending/failed work when external requests are throttled or refused. Players continues to use start.gg identity, separate from management accounts.

## Firebase / APNs

Optional remote Players notifications require your own Firebase project:

1. Register the Players Android app ID; install `android/app-player/google-services.json`.
2. Register the Players iOS bundle ID; add `GoogleService-Info.plist` to its target.
3. Configure `FIREBASE_SERVICE_ACCOUNT_JSON` on the backend, or mount a private file and set `FIREBASE_SERVICE_ACCOUNT_PATH` to its container path.
4. For iOS, add Firebase packages, push capabilities, APNs configuration and provisioning ([Clients](CLIENTS.md)).

Example files are placeholders. Management apps do not need Firebase. Service-account private keys must not be distributed in the source/apps.

## Telegram / WhatsApp

Telegram uses `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Add your bot to the intended group, enable Telegram in `/admin/`, customize templates and test a call.

WhatsApp uses `WHATSAPP_GROUP_JID` and the included `wacli`. Pair your own account inside the backend container using that CLI's help; its session persists in the `wacli_data` volume. `WACLI_AUTO_UPDATE=false` keeps the bundled version stable. Test any upgrade before an event.

Notifications are asynchronous. A delayed group service should not keep the organizer's match action waiting; inspect delivery/logs separately.

## Persistent data

| Host variable | Default folder |
| --- | --- |
| `DISPLAY_ADMIN_DATA_HOST_DIR` | `./data/display-admin` |
| `ANDROID_APP_UPDATES_HOST_DIR` | `./data/android-updates` |
| `WINDOWS_APP_UPDATES_HOST_DIR` | `./data/windows-updates` |

The display folder includes accounts, display settings, uploads and saved poster data. Update folders contain manifests/installers. Corresponding container paths default to `/app/data/...`; changing them also requires matching volume mounts. Keep data and backups private.
