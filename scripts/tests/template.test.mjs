import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(path.join(root,'backend/package.json'))('sharp');

test('Fresh install, custom identities/icons, repeat configuration and rejected input preserve secrets and sources', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'smash-template-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  for (const name of ['scripts/configure.mjs','branding','.env.example','backend/package.json','docker-compose.yml','android','ios-manage','ios-player','display-web']) {
    await fs.cp(path.join(root,name),path.join(temp,name),{recursive:true,filter:source=>!path.relative(root,source).split(path.sep).some(part=>['build','node_modules','.gradle','.kotlin','.git','assets','roa2-stock-icons','smash-icons'].includes(part))&&!/(google-services\.json|GoogleService-Info\.plist|keystore\.properties|\.jks)$/.test(source)});
  }
  await fs.symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),process.platform==='win32'?'junction':'dir');
  const run = (...args) => spawnSync(process.execPath,['scripts/configure.mjs',...args],{cwd:temp,encoding:'utf8'});
  const first = run('--init'); assert.equal(first.status,0,first.stderr);
  const initialEnv = await fs.readFile(path.join(temp,'.env'),'utf8');
  assert.match(initialEnv,/MANAGEMENT_BOOTSTRAP_PASSWORD=[a-f0-9]{36}/);
  assert(!first.stdout.includes(initialEnv.match(/MANAGEMENT_BOOTSTRAP_PASSWORD=(.*)/)[1]));
  assert.notEqual(run('--init').status,0);
  const configFile=path.join(temp,'branding.local.json');
  const config=JSON.parse(await fs.readFile(configFile,'utf8'));
  Object.assign(config,{projectName:'North League',manageAppTitle:'North Admin',playerAppTitle:'North Players',desktopAppTitle:'North Desk',desktopPackageName:'NorthDesk',vendor:'North Club',publicBaseUrl:'https://north.example',androidManageAppId:'org.north.manage',androidPlayerAppId:'org.north.player',iosManageBundleId:'org.north.manage.ios',iosPlayerBundleId:'org.north.player.ios',desktopApplicationId:'org.north.desktop',playerCallbackScheme:'north-player',manageCallbackScheme:'north-admin'});
  await fs.writeFile(configFile,JSON.stringify(config));
  await sharp({create:{width:1024,height:1024,channels:4,background:'#2266bb'}}).png().toFile(path.join(temp,'custom.png'));
  const applied=run('--logo','custom.png');assert.equal(applied.status,0,applied.stderr);
  const read = p=>fs.readFile(path.join(temp,p),'utf8');
  assert.match(await read('android/app/src/main/AndroidManifest.xml'),/android:label="North Admin"/);
  assert.match(await read('android/app-player/src/main/AndroidManifest.xml'),/android:label="North Players"/);
  assert.match(await read('android/app-player/src/main/java/com/gestortorneos/player/MainActivity.kt'),/north-player/);
  assert.match(await read('ios-manage/TournamentManagerIOS/BackendConfig.swift'),/org.north.manage.ios/);
  assert.match(await read('ios-player/TournamentPlayerIOS/BackendConfig.swift'),/north-player:\/\/auth\/callback/);
  assert.match(await read('ios-player/TournamentPlayerIOS/BackendConfig.swift'),/North Players/);
  assert.match(await read('ios-player/project.yml'),/org.north.player.ios/);
  assert.match(await read('android/desktop/build.gradle.kts'),/packageName = "NorthDesk"/);
  assert((await read('android/desktop/build.gradle.kts')).includes(config.windowsUpgradeUuid));
  assert.match(await read('display-web/top8/index.html'),/North League/);
  assert.match(await read('display-web/config.js'),new RegExp(config.appClientKey));
  for(const p of ['android/app/src/main/res/drawable/ic_logo.png','android/app-player/src/main/res/drawable/ic_logo.png','display-web/brand-logo.png','ios-player/TournamentPlayerIOS/AppIcon.appiconset/appicon-1024-1x.png']) {
    const m=await sharp(path.join(temp,p)).metadata();assert.equal(m.width,m.height);assert.equal(m.hasAlpha,false);
  }
  assert.match(await read('.env'),/PUBLIC_BASE_URL=https:\/\/north.example/);
  assert.equal((await read('.env')).match(/POSTGRES_PASSWORD=(.*)/)[1],initialEnv.match(/POSTGRES_PASSWORD=(.*)/)[1]);
  assert.equal((await read('.env')).match(/MANAGEMENT_BOOTSTRAP_PASSWORD=(.*)/)[1],initialEnv.match(/MANAGEMENT_BOOTSTRAP_PASSWORD=(.*)/)[1]);
  const oldSource=await read('android/app/build.gradle.kts');
  config.manageAppTitle='North Next';config.publicBaseUrl='https://new.north.example';await fs.writeFile(configFile,JSON.stringify(config));
  const priorLogo=await fs.readFile(path.join(temp,'display-web/brand-logo.png'));
  assert.equal(run().status,0);
  assert.deepEqual(await fs.readFile(path.join(temp,'display-web/brand-logo.png')),priorLogo,'Repeated configuration preserves the chosen logo');
  assert.match(await read('android/app/src/main/AndroidManifest.xml'),/North Next/);
  assert.match(await read('android/app/build.gradle.kts'),/https:\/\/new.north.example/);
  const before=await read('android/app/build.gradle.kts');
  config.publicBaseUrl='https://north.example/?token=unsafe';await fs.writeFile(configFile,JSON.stringify(config));
  assert.notEqual(run().status,0);assert.equal(await read('android/app/build.gradle.kts'),before);
  assert.notEqual(oldSource,before);
  assert(!await read('docker-compose.yml').then(s=>s.includes(initialEnv.match(/POSTGRES_PASSWORD=(.*)/)[1])));
});
