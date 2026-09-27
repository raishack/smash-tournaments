<p align="center"><img src="display-web/brand-logo.png" width="112" alt="Smash Tournaments logo"></p>

# Smash Tournaments

**Your events. Your apps. Your branding.**

A self-hosted tournament platform with organizer apps, a player companion, a live venue display, online registration and editable results posters. Run local brackets, start.gg events, team competitions, ladders and Fortnite scoring.

Replace the included name and original bracket-spark logo with your community's identity using one configuration file. No connection to the original operator's server is required.

![Live tournament display](docs/en/images/display-bracket.png)

## What you get

| Component | Purpose |
| --- | --- |
| TypeScript API + PostgreSQL | Tournament state, brackets, results, accounts, registration, teams and background jobs |
| Android / Windows / iOS management | Create and operate events, call matches, report results, inspect rosters and archive tournaments |
| Android / iOS Players | start.gg sign-in, participant tournament views, match information and ladder workflows |
| Venue display | Modern brackets, winners/losers layouts, scenes, themes, sponsors and high-resolution rendering |
| Web management | Browser-based match operations, results and ladder administration |
| Public registration | Email verification, capacity, waitlists, teams, reserves and solo sign-ups |
| Results editor | Top 8/team posters, asset collections, custom uploads and high-resolution PNG export |

### Built for running the event

- Single/double elimination and round-robin brackets, seeding, check-in, setups and up to two streams.
- Modern bracket search, pan/zoom and match actions that preserve fullscreen.
- Background start.gg imports with resumable work and rate-aware requests.
- Team entries with configurable starters/reserves and administrative rosters.
- Fortnite groups with random seats, accumulated game scores, qualification and an external VIP.
- Shared organizer accounts: managers operate events; superadmins also manage users.
- Read-only tournament archives with explicit restoration.
- In-app downloads of your own signed Android/Windows updates from your backend.

## Quick start

You need **Node.js 22+**, npm and **Docker with Compose v2**. Native client builds have additional requirements.

```bash
git clone https://github.com/raishack/smash-tournaments.git
cd smash-tournaments
npm ci
npm run configure -- --init
```

1. Edit `branding.local.json`: set your HTTPS domain, names and unique app IDs.
2. Edit `.env`: review server settings and the generated initial administrator password.
3. Apply your identity and optionally your own square logo:

```bash
npm run configure -- --logo /path/to/your-logo.png
npm run audit:template
docker compose up --build -d
```

The server exposes its web/API at **its own** `http://127.0.0.1:4000`. Configure HTTPS before using mobile apps, public registration or OAuth. PostgreSQL stays inside Docker. Follow the [installation guide](docs/en/INSTALLATION.md) for HTTPS and first login. There is no shared default admin password.

## Documentation

| Guide | Contents |
| --- | --- |
| [Installation](docs/en/INSTALLATION.md) | Server setup, HTTPS, accounts, backups and first-run checklist |
| [Configuration](docs/en/CONFIGURATION.md) | SMTP, start.gg, Firebase, notifications and environment variables |
| [Branding](docs/en/BRANDING.md) | Names, logos, app IDs and Windows update identity |
| [Build the apps](docs/en/CLIENTS.md) | Android, Windows and generated Xcode projects |
| [User guide](docs/en/USER_GUIDE.md) | Create, register, seed, operate, display, finish and archive |
| [App updates](docs/en/UPDATES.md) | Signing, manifests, hashes and release checks |
| [Screenshots](docs/en/SCREENSHOTS.md) | Real screens with synthetic demonstration data |
| [Development](docs/en/DEVELOPMENT.md) | Architecture, tests and current limitations |

**Language:** documentation is in English. The current interfaces are primarily Spanish; the user guide includes the labels you will see. Full English UI localization is not claimed.

## Example screens

| Display settings | Match operations |
| --- | --- |
| ![Display administrator](docs/en/images/display-admin.png) | ![Management view](docs/en/images/manage.png) |

| Team registration | Results poster editor |
| --- | --- |
| ![Registration](docs/en/images/registration.png) | ![Top 8 editor](docs/en/images/top8-editor.png) |

![Fortnite scoring](docs/en/images/fortnite.png)

## Customize before distributing

Native apps are source projects, not preconfigured store downloads. Build them against your own server, use your own signing identities and configure your own optional service accounts. iOS signing and App Store distribution use your Apple developer account.

Production databases, private configuration, signing keys and internal deployment history are excluded. The generic logo is original project artwork; game artwork and third-party catalogs have separate attribution in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
