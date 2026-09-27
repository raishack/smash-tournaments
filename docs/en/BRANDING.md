# Your name, logos and app identity

[Back to the project](../../README.md)

The default names are **Smash Tournaments** and **Smash Players**, with an original bracket-spark logo. Replace them for your own community or keep them for evaluation.

## Apply your identity

Initialize once with `npm run configure -- --init`, edit `branding.local.json`, then run:

```bash
npm run configure -- --logo /path/to/my-club-logo.png
```

The command works on Windows, Linux and macOS. Later runs retain the applied logo even if you omit `--logo`.

| Field | Used for |
| --- | --- |
| `projectName` | Web/display titles and common product labels |
| `manageAppTitle`, `playerAppTitle` | Android/iOS installed names and in-app labels |
| `desktopAppTitle` | Desktop window name |
| `desktopPackageName` | Installer/product name; no spaces |
| `vendor`, `desktopMaintainer` | Desktop package metadata |
| `publicBaseUrl`, `appClientKey` | Backend HTTPS origin and public client key |
| `androidManageAppId`, `androidPlayerAppId` | Distinct Android application IDs |
| `iosManageBundleId`, `iosPlayerBundleId` | Swift configuration and generated Xcode target IDs |
| `desktopApplicationId` | Windows update manifest identity |
| `playerCallbackScheme` | Android/iOS Players OAuth return scheme |
| `manageCallbackScheme` | Management iOS URL scheme |
| `windowsUpgradeUuid` | Permanent MSI UpgradeCode for your installation |
| `iconBackground` | Opaque background color, in `#RRGGBB` format |

Use your own reverse-domain identifiers, such as `org.northclub.events` and `org.northclub.players`. Internal Kotlin namespaces may remain `com.gestortorneos`; those are not published app IDs.

## Logos and generated files

Use a square **PNG, WebP or SVG**, at least **512 × 512**; **1024 × 1024** is recommended. Keep key artwork centrally positioned for launcher masks. Transparent input is flattened against `iconBackground`, including iOS icons.

The script generates:

- Android management and Players launcher artwork.
- A multi-size Windows `.ico` and Linux package icon.
- Both iOS AppIcon sets and `BrandAssets.xcassets` catalogs.
- A web logo/favicon and **1920 × 1080** idle display illustration.
- XcodeGen `project.yml` files containing names, IDs and callback schemes.

Rebuild native apps to change an installed icon/name. Existing manually maintained Xcode projects are not modified: import the generated catalog into each target and update its display name and bundle ID, or use the generated projects described in [Clients](CLIENTS.md).

## Event artwork is independently editable

Use `/admin/` to upload backgrounds, overlays, sponsors, sounds and game themes. The Top 8 editor has separate event-logo, background and participant/team-image uploads, with recommended dimensions shown in the interface. A selected character-art collection applies to the entire poster; individual custom uploads remain available.

## Reconfiguration and upgrades

Re-running configuration validates input and updates public client settings while preserving server secrets. It generates files; review and commit your branding changes before merging upstream changes.

After distributing apps, keep their package IDs, signing keys and Windows UpgradeCode stable. Each independent operator should initialize their own identities. Renaming alone does not establish compatibility with somebody else's installed apps.

`npm run configure -- --defaults` restores sample branding without editing `.env`; this is for template development, not a production upgrade.
