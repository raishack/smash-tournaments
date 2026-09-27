# Third-party notices

Smash Tournaments is an independent community tournament tool. It is not an official Nintendo, Super Smash Bros., Rivals of Aether, Fortnite, Riot Games or start.gg product. Product names and character artwork belong to their respective owners.

## Game artwork and catalogs

- The Top 8 collection catalog is generated from [StreamHelperAssets](https://github.com/joaorb64/StreamHelperAssets), by joaorb64 and contributors. The source revision and collection metadata are recorded under `display-web/assets/top8-library/`. Artwork is requested and cached on demand; the full upstream artwork collection is not bundled.
- Existing Smash and Rivals stock icons are used for match/player identification in web and native clients. Their presence does not grant an independent license to game characters or artwork.
- [Top8er](https://github.com/ShonTitor/Top8er) was a reference for the results-poster feature. This implementation provides its own server integration and editor.
- Uploaded logos, photos and backgrounds remain the responsibility of the uploading organizer. Use assets you have permission to publish and retain any required artist credits.

The generic bracket/spark logo in `branding/logo.svg` is original project artwork; it is not an official game logo. The project's source-code license does not relicense third-party game art or trademarks. Consult each asset provider and rights holder for your intended use.

## Software dependencies

JavaScript dependency versions are pinned in `package-lock.json`; Kotlin/Compose dependencies are declared in the Gradle files. Each dependency retains its own license and notices. Relevant projects include Node.js, Express, PostgreSQL, Sharp/libvips, Firebase Admin SDK, Nodemailer, PGlite, Kotlin, Jetpack Compose, Compose Multiplatform, Gson, Retrofit, OkHttp and Playwright. Optional deployment/build tools include Docker, Caddy and XcodeGen.

Review dependency license files when redistributing compiled applications or container images. Apple SDKs, signing and distribution are governed by Apple's own terms. start.gg and messaging integrations require your own accounts and applicable service permissions.
