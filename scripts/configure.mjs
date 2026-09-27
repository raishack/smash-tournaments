import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'backend/package.json'));
const sharp = require('sharp');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const parseJSON = text => JSON.parse(text.replace(/^\uFEFF/, ''));
const readJSON = async name => parseJSON(await fs.readFile(path.join(root, name), 'utf8'));
const defaults = await readJSON('branding/default.json');
const exists = async name => fs.access(path.join(root, name)).then(() => true, () => false);
const stringify = value => JSON.stringify(value, null, 2) + '\n';

async function main() {
  if (args.includes('--init')) {
    if (await exists('branding.local.json') || await exists('.env')) throw Error('Initialization requires a fresh checkout without branding.local.json or .env. Existing files are never overwritten.');
    const config = { ...defaults, appClientKey: randomBytes(24).toString('hex'), windowsUpgradeUuid: randomUUID() };
    const password = randomBytes(24).toString('hex');
    let env = await fs.readFile(path.join(root, '.env.example'), 'utf8');
    env = env.replaceAll('change_this_postgres_password', password)
      .replaceAll('replace_with_your_app_client_key', config.appClientKey)
      .replace(/^MANAGEMENT_BOOTSTRAP_USERNAME=.*$/m, 'MANAGEMENT_BOOTSTRAP_USERNAME=admin')
      .replace(/^MANAGEMENT_BOOTSTRAP_PASSWORD=.*$/m, 'MANAGEMENT_BOOTSTRAP_PASSWORD=' + randomBytes(18).toString('hex'));
    await fs.writeFile(path.join(root, '.env'), env, { flag: 'wx', mode: 0o600 });
    await fs.writeFile(path.join(root, 'branding.local.json'), stringify(config), { flag: 'wx' });
    console.log('Created .env and branding.local.json. Edit the public URL, names and app IDs, then run npm run configure. The initial admin password is in .env; keep that file private.');
    return;
  }
  if (args.includes('--help')) {
    console.log('node scripts/configure.mjs --init\nnode scripts/configure.mjs [--config branding.local.json] [--logo /path/to/logo.png]\nnode scripts/configure.mjs --defaults (restore sample branding; does not edit .env)');
    return;
  }
  const config = args.includes('--defaults') ? defaults : { ...defaults, ...parseJSON(await fs.readFile(path.resolve(root, option('--config') || 'branding.local.json'), 'utf8')) };
  for (const [key, value] of Object.entries(config)) {
    if (!Object.hasOwn(defaults, key) || typeof value !== 'string') throw Error('Unknown or non-string configuration field: ' + key);
    if (/[\r\n\x00]/.test(value)) throw Error('Invalid characters in ' + key);
  }
  for (const key of ['projectName', 'manageAppTitle', 'playerAppTitle', 'desktopAppTitle', 'vendor']) {
    if (!/^[\p{L}\p{N} ._()\-]{2,60}$/u.test(config[key])) throw Error(key + ' must be 2–60 letters, numbers, spaces, dots, underscores, parentheses or hyphens.');
  }
  for (const key of ['androidManageAppId', 'androidPlayerAppId', 'iosManageBundleId', 'iosPlayerBundleId', 'desktopApplicationId']) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*){2,}$/.test(config[key])) throw Error('Use a reverse-domain identifier for ' + key);
  }
  if (config.androidManageAppId === config.androidPlayerAppId || config.iosManageBundleId === config.iosPlayerBundleId) throw Error('Management and Players need distinct app IDs.');
  for (const key of ['playerCallbackScheme', 'manageCallbackScheme']) if (!/^[a-z][a-z0-9+.-]{2,49}$/.test(config[key])) throw Error('Invalid callback scheme: ' + key);
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,49}$/.test(config.desktopPackageName)) throw Error('Invalid desktop package name.');
  if (!/^[a-zA-Z0-9._+@-]+$/.test(config.desktopMaintainer) || !config.desktopMaintainer.includes('@')) throw Error('Invalid maintainer email.');
  if (!/^[a-zA-Z0-9_-]{12,128}$/.test(config.appClientKey)) throw Error('The public client key must have 12–128 letters, digits, underscores or hyphens.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.windowsUpgradeUuid)) throw Error('Invalid Windows UpgradeCode UUID.');
  if (!/^#[0-9a-f]{6}$/i.test(config.iconBackground)) throw Error('iconBackground must be #RRGGBB.');
  const url = new URL(config.publicBaseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw Error('publicBaseUrl must be an HTTPS origin, without credentials, path, query or fragment.');
  config.publicBaseUrl = url.origin;
  const old = await exists('branding/applied.json') ? await readJSON('branding/applied.json') : {
    ...defaults, projectName: 'Tournament Platform', manageAppTitle: 'Tournament Manager', playerAppTitle: 'Tournament Player', desktopAppTitle: 'Tournament Manager Desktop', desktopPackageName: 'TournamentManagerDesktop', vendor: 'Tournament Platform'
  };
  // Prepare and validate everything before writing any source file.
  const writes = new Map();
  const commonKeys = ['projectName', 'androidManageAppId', 'androidPlayerAppId', 'iosManageBundleId', 'iosPlayerBundleId', 'desktopApplicationId', 'playerCallbackScheme', 'manageCallbackScheme', 'publicBaseUrl', 'appClientKey', 'desktopPackageName', 'desktopMaintainer'];
  const replace = (text, keys) => {
    const pairs = keys.map(k => [old[k], config[k]]).filter(([a,b]) => a && a !== b);
    pairs.push([old.projectName.toUpperCase(), config.projectName.toUpperCase()]);
    // Simultaneous replacement prevents cascades when names contain one another.
    const map = new Map(pairs); const from = [...map.keys()].sort((a,b) => b.length-a.length);
    if (!from.length) return text;
    return text.replace(new RegExp(from.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g'), match => map.get(match));
  };
  async function walk(directory) {
    for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
      if (['build', 'node_modules', '.gradle', '.kotlin', '.git', 'tests', 'test', 'assets', 'roa2-stock-icons', 'smash-icons'].includes(entry.name)) continue;
      const relative = directory + '/' + entry.name;
      if (entry.isDirectory()) { await walk(relative); continue; }
      if (!/\.(kt|kts|swift|xml|html|js)$/.test(relative)) continue;
      const text = await fs.readFile(path.join(root, relative), 'utf8');
      const titleKey = relative.startsWith('display-web/') || relative.startsWith('android/shared-') ? 'projectName'
        : relative.startsWith('android/app-player/') || relative.startsWith('ios-player/') ? 'playerAppTitle'
        : relative.startsWith('android/desktop/') ? 'desktopAppTitle' : 'manageAppTitle';
      let updated = replace(text, [...commonKeys, titleKey]);
      // Legacy profile/notification labels can differ from the window title.
      if (!await exists('branding/applied.json')) updated = updated.replaceAll('Tournament Manager Desktop', config.desktopAppTitle).replaceAll('Tournament Manager', config.manageAppTitle).replaceAll('Tournament Player', config.playerAppTitle);
      if (relative === 'android/desktop/build.gradle.kts') {
        updated = updated.replace(/vendor = "[^"]*"/, `vendor = "${config.vendor}"`)
          .replace(/menuGroup = "[^"]*"/g, `menuGroup = "${config.projectName}"`);
        if (/upgradeUuid\s*=/.test(updated)) updated = updated.replace(/upgradeUuid\s*=\s*"[^"]*"/, `upgradeUuid = "${config.windowsUpgradeUuid}"`);
        else updated = updated.replace('windows {', `windows {\n                upgradeUuid = "${config.windowsUpgradeUuid}"`);
      }
      if (relative.endsWith('network_security_config.xml') || relative.endsWith('/data/remote/BackendConfig.kt')) updated = updated.replaceAll(new URL(old.publicBaseUrl).hostname, url.hostname);
      if (updated !== text) writes.set(relative, updated);
    }
  }
  for (const directory of ['android', 'ios-manage', 'ios-player', 'display-web']) await walk(directory);
  const logoPath = option('--logo') || (!args.includes('--defaults') && await exists('branding/logo-applied.png') ? 'branding/logo-applied.png' : 'branding/logo.svg');
  const logo = await fs.readFile(path.resolve(root, logoPath));
  const metadata = await sharp(logo, { limitInputPixels: 40000000 }).metadata();
  if (!metadata.width || metadata.width !== metadata.height || metadata.width < 512) throw Error('Use a square PNG, WebP or SVG logo at least 512 × 512 (1024 × 1024 recommended).');
  const png = async size => sharp(logo).resize(size, size, { fit: 'contain', background: config.iconBackground }).flatten({ background: config.iconBackground }).png().toBuffer();
  for (const app of ['app', 'app-player']) writes.set(`android/${app}/src/main/res/drawable/ic_logo.png`, await png(512));
  if (await exists('android/app-player/src/main/res/ic_logo.png')) writes.set('android/app-player/src/main/res/ic_logo.png', await png(512));
  writes.set('android/desktop/src/jvmMain/resources/app-icon-linux.png', await png(512));
  const icoParts = await Promise.all([16,32,48,256].map(png));
  const header = Buffer.alloc(6 + icoParts.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(icoParts.length, 4);
  let offset = header.length;
  for (let i=0; i<icoParts.length; i++) { const pos=6+i*16, size=[16,32,48,256][i]; header[pos]=size%256; header[pos+1]=size%256; header.writeUInt16LE(1,pos+4); header.writeUInt16LE(32,pos+6); header.writeUInt32LE(icoParts[i].length,pos+8); header.writeUInt32LE(offset,pos+12); offset+=icoParts[i].length; }
  writes.set('android/desktop/src/jvmMain/resources/app-icon.ico', Buffer.concat([header, ...icoParts]));
  const contents = await readJSON('ios-manage/TournamentManagerIOS/AppIcon.appiconset/Contents.json');
  for (const base of ['ios-manage/TournamentManagerIOS', 'ios-player/TournamentPlayerIOS']) {
    for (const entry of contents.images) writes.set(`${base}/AppIcon.appiconset/${entry.filename}`, await png(Math.round(parseFloat(entry.size)*parseFloat(entry.scale))));
    writes.set(`${base}/AppIcon.appiconset/Contents.json`, stringify(contents));
  }
  writes.set('ios-player/TournamentPlayerIOS/AppIcon/ios-app-icon-1024.png', await png(1024));
  writes.set('display-web/brand-logo.png', await png(512));
  writes.set('branding/logo-applied.png', await png(1024));
  writes.set('display-web/favicon.png', await png(64));
  const logoData = (await png(512)).toString('base64');
  writes.set('display-web/idle-placeholder.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="${config.iconBackground}"/><image href="data:image/png;base64,${logoData}" x="792" y="260" width="336" height="336"/><text x="960" y="695" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="76" fill="white">${config.projectName}</text><text x="960" y="770" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#b5bfd4">The next round starts here.</text></svg>\n`);
  for (const relative of ['display-web/index.html','display-web/admin/index.html','display-web/manage/index.html','display-web/account/index.html','display-web/register/index.html','display-web/top8/index.html','display-web/fortnite/index.html','display-web/registration-admin/index.html']) {
    const text = writes.get(relative) || await fs.readFile(path.join(root, relative), 'utf8');
    writes.set(relative, text.includes('rel="icon"') ? text : text.replace('</head>', '<link rel="icon" type="image/png" href="/favicon.png"></head>'));
  }
  if (!args.includes('--defaults') && await exists('.env')) {
    let env = await fs.readFile(path.join(root, '.env'), 'utf8');
    for (const [key,value] of [['PUBLIC_BASE_URL',config.publicBaseUrl],['APP_CLIENT_KEY',config.appClientKey]]) {
      const rx = new RegExp('^'+key+'=.*$','m'); env = rx.test(env) ? env.replace(rx,()=>key+'='+value) : env+'\n'+key+'='+value+'\n';
    }
    writes.set('.env', env);
  }
  writes.set('branding/applied.json', stringify(config));
  for (const [directory, target, bundle, title] of [
    ['ios-manage', 'TournamentManager', config.iosManageBundleId, config.manageAppTitle],
    ['ios-player', 'TournamentPlayer', config.iosPlayerBundleId, config.playerAppTitle]
  ]) {
    const source = directory === 'ios-manage' ? 'TournamentManagerIOS' : 'TournamentPlayerIOS';
    const callback = directory === 'ios-manage' ? config.manageCallbackScheme : config.playerCallbackScheme;
    const yamlString = JSON.stringify;
    writes.set(`${directory}/project.yml`, `# Generated by scripts/configure.mjs. Signing team is set in your own Xcode.\nname: ${target}\noptions:\n  deploymentTarget:\n    iOS: "17.0"\ntargets:\n  ${target}:\n    type: application\n    platform: iOS\n    sources:\n      - path: ${source}\n        excludes:\n          - AppIcon\n          - AppIcon.appiconset\n    settings:\n      base:\n        PRODUCT_BUNDLE_IDENTIFIER: ${bundle}\n        PRODUCT_NAME: ${target}\n        SWIFT_VERSION: "5.0"\n        TARGETED_DEVICE_FAMILY: "1,2"\n        ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon\n        MARKETING_VERSION: "0.1.0"\n        CURRENT_PROJECT_VERSION: "1"\n    info:\n      path: Generated/Info.plist\n      properties:\n        CFBundleDisplayName: ${yamlString(title)}\n        UILaunchScreen: {}\n        UIApplicationSceneManifest:\n          UIApplicationSupportsMultipleScenes: false\n        UISupportedInterfaceOrientations:\n          - UIInterfaceOrientationPortrait\n          - UIInterfaceOrientationLandscapeLeft\n          - UIInterfaceOrientationLandscapeRight\n        CFBundleURLTypes:\n          - CFBundleURLName: ${bundle}\n            CFBundleURLSchemes:\n              - ${callback}\n`);
    // Xcode needs an asset catalog wrapper, rather than an uncontained .appiconset.
    writes.set(`${directory}/${source}/BrandAssets.xcassets/Contents.json`, stringify({info:{author:'xcode',version:1}}));
    writes.set(`${directory}/${source}/BrandAssets.xcassets/AppIcon.appiconset/Contents.json`, stringify(contents));
    for (const entry of contents.images) writes.set(`${directory}/${source}/BrandAssets.xcassets/AppIcon.appiconset/${entry.filename}`, writes.get(`${directory}/${source}/AppIcon.appiconset/${entry.filename}`));
  }
  for (const [relative, value] of writes) { const target=path.join(root,relative); await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,value); }
  console.log(`Applied ${config.projectName}: ${writes.size} files. Android, Windows, iOS and web icons generated. Rebuild native apps; import the generated AppIcon sets into your own Xcode projects.`);
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
