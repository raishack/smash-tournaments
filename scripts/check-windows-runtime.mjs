import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Use the actual distribution, not the developer JDK's modules or dependency cache.
// jlink strips launchers: copy the matching java.exe into an isolated runtime copy.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const javaHome = process.argv[2] || process.env.JAVA_HOME;
const appRoot = path.resolve(process.argv[3] || path.join(root, 'android/desktop/build/compose/binaries/main/app'));
assert.equal(process.platform, 'win32', 'This check exercises the Windows runtime and DPAPI');
assert.ok(javaHome, 'Set JAVA_HOME or pass the JDK used to package this application');
const apps = fs.readdirSync(appRoot).map(name => path.join(appRoot, name))
  .filter(dir => fs.existsSync(path.join(dir, 'app')) && fs.existsSync(path.join(dir, 'runtime')));
assert.equal(apps.length, 1, 'Expected exactly one packaged application');
const app = apps[0];
const release = directory => fs.readFileSync(path.join(directory, 'release'), 'utf8').match(/^JAVA_VERSION="([^"]+)"/m)?.[1];
assert.equal(release(javaHome), release(path.join(app, 'runtime')), 'The launcher must match the packaged JDK version');
const tempParent = fs.realpathSync(os.tmpdir());
const temporary = fs.mkdtempSync(path.join(tempParent, 'tournament-runtime-check-'));
const server = http.createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    response.setHeader('Content-Type', 'application/json');
    assert.equal(request.headers['x-admin-key'], undefined);
    if (request.url === '/api/management-auth/login') {
      assert.equal(request.method, 'POST');
      assert.deepEqual(JSON.parse(body), { username: 'fixture', password: ' fixture-password ' });
      response.end(JSON.stringify({ token: 'a'.repeat(64), expiresAt: Date.now() + 600_000,
        user: { id: 'u1', username: 'fixture', role: 'SUPER_ADMIN' } }));
    } else {
      assert.equal(request.headers.authorization, `Bearer ${'a'.repeat(64)}`);
      const match = request.url?.match(/^\/status\/(200|403|503|401)$/);
      assert.ok(match || request.url === '/api/management-auth/logout', 'Unexpected fixture request');
      response.statusCode = match ? Number(match[1]) : 204;
      response.end('{}');
    }
  } catch (error) {
    server.fixtureError = error;
    response.statusCode = 500;
    response.end('{"message":"Fixture assertion failed"}');
  }
});
function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Runtime check timed out')); }, 60_000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Runtime check exited ${code}`)); });
  });
}
try {
  const runtime = path.join(temporary, 'runtime'), classes = path.join(temporary, 'classes');
  fs.cpSync(path.join(app, 'runtime'), runtime, { recursive: true });
  fs.copyFileSync(path.join(javaHome, 'bin/java.exe'), path.join(runtime, 'bin/java.exe'));
  fs.mkdirSync(classes);
  const classpath = path.join(app, 'app/*');
  await run(path.join(javaHome, 'bin/javac.exe'), ['-encoding', 'UTF-8', '-cp', classpath, '-d', classes,
    path.join(root, 'android/desktop/src/runtimeTest/java/PackagedManagementSessionChecks.java')]);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const backend = `http://127.0.0.1:${server.address().port}`;
  for (const phase of ['login', 'restore']) {
    await run(path.join(runtime, 'bin/java.exe'), ['-cp', classes + path.delimiter + classpath,
      'PackagedManagementSessionChecks', phase, backend, path.join(temporary, 'session.bin')]);
    if (server.fixtureError) throw server.fixtureError;
  }
  console.log(`PASS: ${path.basename(app)} shipped runtime; two independent processes; local fixtures only`);
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  // Only remove the unique temporary directory created by this invocation.
  assert.equal(path.dirname(fs.realpathSync(temporary)), tempParent);
  assert.ok(path.basename(temporary).startsWith('tournament-runtime-check-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
