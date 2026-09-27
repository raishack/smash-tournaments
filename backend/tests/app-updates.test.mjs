import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {AndroidAppUpdatesStore} from '../dist/modules/app-updates/android-updates.js';
import {WindowsAppUpdatesStore} from '../dist/modules/app-updates/windows-updates.js';

for (const [platform, Store, entry] of [
  ['android', AndroidAppUpdatesStore, {applicationId:'com.gestortorneos.app', versionCode:11, versionName:'0.1.10', apkFile:'main-manage-0.1.10.apk'}],
  ['windows', WindowsAppUpdatesStore, {applicationId:'com.gestortorneos.desktop', version:'0.1.12', msiFile:'main-desktop-0.1.12.msi'}],
]) {
  test(`${platform}: update API exposes installer integrity while retaining legacy manifests`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'main-app-updates-'));
    try {
      const store = new Store(directory, 'https://your-domain.example');
      const manifest = path.join(directory, 'manifest.json');
      await fs.writeFile(manifest, JSON.stringify({apps:[entry]}));
      const legacy = await store.getUpdate(entry.applicationId);
      assert.equal(legacy.applicationId, entry.applicationId);
      assert.equal(legacy.sha256, undefined);
      assert.equal(await store.getUpdate('other.variant'), null);
      const verified = {...entry, sha256:'ab'.repeat(32), sizeBytes:123456789};
      await fs.writeFile(manifest, JSON.stringify({apps:[verified]}));
      const update = await store.getUpdate(entry.applicationId);
      assert.equal(update.sha256, verified.sha256);
      assert.equal(update.sizeBytes, verified.sizeBytes);
      assert.match(update.apkUrl ?? update.msiUrl, new RegExp(`^https://your-domain.example/downloads/${platform}/`));
    } finally { await fs.rm(directory, {recursive:true, force:true}); }
  });
}
