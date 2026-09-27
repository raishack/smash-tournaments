// Run after copying rebuilt installers and updating their manifest versions/filenames.
// No network requests, secret reads, deployments or changes to app identities.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const changes = [];
for (const platform of ['android','windows']) {
  const directory = path.join(root, 'data', platform+'-updates');
  const target = path.join(directory, 'manifest.json');
  const before = fs.readFileSync(target, 'utf8');
  const manifest = JSON.parse(before);
  for (const entry of manifest.apps ?? []) {
    const extension = platform === 'android' ? 'apk' : 'msi';
    const filename = entry[platform === 'android' ? 'apkFile' : 'msiFile'];
    assert(typeof filename === 'string' && filename === path.basename(filename) && filename.endsWith('.'+extension), 'Invalid installer filename');
    assert(!entry[platform === 'android' ? 'apkUrl' : 'msiUrl'], 'Remove the external URL override before preparing a local installer');
    const bytes = fs.readFileSync(path.join(directory, 'files', filename));
    const magic = Buffer.from(platform === 'android' ? '504b0304' : 'd0cf11e0a1b11ae1', 'hex');
    assert(bytes.subarray(0, magic.length).equals(magic), 'Wrong installer format: '+filename);
    assert(bytes.length > 8 && bytes.length <= 1073741824, 'Unsupported installer size');
    entry.sha256 = createHash('sha256').update(bytes).digest('hex');
    entry.sizeBytes = bytes.length;
    console.log(`Verified ${entry.applicationId}: ${filename} (${bytes.length} bytes)`);
  }
  changes.push({target, before, after:JSON.stringify(manifest, null, 2)+'\n'});
}
for (const {target, before, after} of changes) {
  assert.equal(fs.readFileSync(target,'utf8'), before, 'Manifest changed concurrently');
  if (before === after) continue;
  const temporary = target+'.'+randomBytes(6).toString('hex')+'.tmp';
  try { fs.writeFileSync(temporary, after, {flag:'wx'}); fs.renameSync(temporary, target); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
console.log('Installer integrity metadata ready. Verify signatures/IDs, then publish with your normal deployment process.');
