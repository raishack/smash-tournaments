# Installation

[Back to the project](../../README.md)

## Requirements

- Node.js 22+ and npm for configuration and source builds.
- Docker Engine/Desktop with Compose v2. PostgreSQL 16 is included.
- A DNS name pointing to your server, with TCP 80/443 reachable for HTTPS.
- Persistent storage and independent backups of the database, uploaded files and configuration.

SMTP is needed for email registration. start.gg OAuth is needed for Players. Local organizer-operated brackets do not need these external accounts.

## Initialize a fresh checkout

```bash
git clone https://github.com/raishack/smash-tournaments.git
cd smash-tournaments
npm ci
npm run configure -- --init
```

This creates ignored `branding.local.json` and `.env` files with independently generated database/admin credentials and a Windows upgrade UUID. Open `.env` locally to obtain the initial administrator password: the script does not print it. Initialization refuses to overwrite existing files.

Edit `branding.local.json`: set `publicBaseUrl` to your HTTPS origin, choose your names and unique Android/iOS/desktop IDs, and set your vendor/maintainer details. Keep the generated Windows UUID throughout this installation's lifetime.

```bash
npm run configure
# Optional custom logo:
npm run configure -- --logo /absolute/path/club-logo.png
npm run audit:template
```

Configuration generates icons and iOS project specifications. It updates only the public URL/client key in an existing `.env`, preserving private passwords. See [Branding](BRANDING.md).

## Start backend and database

```bash
docker compose up --build -d
docker compose ps
docker compose logs --tail=80 backend
curl http://127.0.0.1:4000/health
```

Run the health check on the server. The API is bound to loopback; PostgreSQL is not published to the host. Keep `PORT=4000` with the supplied HTTPS overlay. Schema preparation runs at startup.

A fresh installation starts without tournaments. `SEED_DEMO_DATA=true` optionally seeds an empty database; switch it back to `false` after evaluation.

## Enable HTTPS

Add your DNS name to `.env`, matching the hostname in `publicBaseUrl`:

```dotenv
SITE_DOMAIN=events.example.org
```

Point DNS at the server and open ports 80/443, then run:

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml up --build -d
curl https://events.example.org/health
```

The included Caddy proxy stores certificates in persistent volumes. With an existing proxy, forward the whole origin to `http://127.0.0.1:4000`, preserving paths and forwarded host/protocol headers. Do not deploy under a URL prefix; panels use root-relative URLs.

## First login

Open `/account/` on your HTTPS domain. Use `MANAGEMENT_BOOTSTRAP_USERNAME` and `MANAGEMENT_BOOTSTRAP_PASSWORD` from `.env`.

- Superadmins administer users and tournaments.
- Managers operate tournaments and the display; they cannot administer users.
- These accounts also work in management apps, `/manage/` and `/admin/`.
- Players signs in with start.gg instead.

After successful initialization, clear the bootstrap password and recreate the backend container. Existing accounts remain in `data/display-admin/management-users.json`; changing bootstrap variables does not reset them.

## First event checklist

1. [Build a management client](CLIENTS.md) using your URL and sign in.
2. Create a local tournament with two demonstration participants.
3. Confirm attendance if required and generate its bracket.
4. Enable the tournament's display switch and open `/` on a second screen.
5. Start the tournament, call a match and report a result.
6. Complete it and open the results poster editor.
7. Test real email verification with an address you control before sharing registration links.

Automated fixtures do not validate your DNS, email delivery, start.gg permissions, APNs or signing identities.

## Backups and upgrades

Back up PostgreSQL **and** `data/`, plus private `.env`, branding configuration and signing keys. The display data directory contains management accounts and uploaded/saved assets. Protect backups as private data.

Example database backup on a Linux/macOS shell:

```bash
mkdir -p backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > backups/database.sql
```

Use coordinated snapshots or a maintenance window for database + files, and test restoration in isolation. Do not run `docker compose down -v` during a normal upgrade: it deletes named volumes.

Before upgrading source, back up or commit your branding changes, review the diff, run tests and rebuild affected clients. Preserve configuration and volumes. Take a database backup first; rolling code back does not automatically reverse schema changes.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| API fails to start | Database health, URL, first admin password and backend logs |
| App cannot connect | Compiled HTTPS origin, certificate, matching public client key |
| No registration email | SMTP credentials, authorized sender, junk folder, delivery test |
| Tournament absent from display | Display toggle, event state, screen filter, archived state |
| Players sign-in fails | OAuth configuration and exact server/native callbacks |
| Repackaged Windows login fails | Keep `jdk.unsupported`; run `checkPackagedRuntime` |
