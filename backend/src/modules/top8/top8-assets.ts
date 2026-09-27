import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

type Asset = { path: string; width: number; height: number };
type Manifest = { revision: string; images: Record<string, Asset> };
type Size = 'full' | 'preview' | 'thumb';
const limit = 32 * 1024 * 1024;
const validSize = (size: string): size is Size => ['full', 'preview', 'thumb'].includes(size);

/** Only files in the bundled, revision-pinned catalogue can reach the network. */
export class Top8Assets {
  private manifest: Promise<Manifest>;
  private pending = new Map<string, Promise<string>>();
  private active = 0;
  private queue: Array<() => void> = [];
  private lastCleanup = 0;
  constructor(private catalogue: string, readonly cacheDir: string, private request: typeof fetch = fetch, private maxCacheBytes = 2 * 1024 ** 3) {
    this.manifest = fs.readFile(path.join(catalogue, 'images.json'), 'utf8').then(text => {
      const data = JSON.parse(text) as Manifest;
      if (!/^[a-f0-9]{40}$/.test(data.revision)) throw Error('Invalid image catalog');
      return data;
    });
    // A missing catalogue must not produce an unhandled rejection at startup.
    this.manifest.catch(() => {});
  }
  async lookup(hash: string) {
    if (!/^[a-f0-9]{40}$/.test(hash)) return undefined;
    const manifest = await this.manifest, asset = Object.hasOwn(manifest.images, hash) ? manifest.images[hash] : undefined;
    if (!asset || !/^games\/[a-z0-9]+\//.test(asset.path) || asset.path.split('/').some(p => p === '..' || p === '.' || !p) || /[\\?#\u0000-\u001f]/.test(asset.path) || !/\.(png|jpe?g|webp)$/i.test(asset.path)) return undefined;
    return { ...asset, revision: manifest.revision };
  }
  async file(hash: string, size: Size): Promise<string> {
    const asset = await this.lookup(hash);
    if (!asset || !validSize(size)) throw Error('Image unavailable in the library');
    const extension = size === 'full' ? path.extname(asset.path).toLowerCase() : '.webp';
    const filename = path.join(this.cacheDir, `${hash}-${size}${extension}`);
    try { const stat = await fs.stat(filename); if (stat.isFile() && stat.size > 0) { void fs.utimes(filename, new Date(), new Date()).catch(() => {}); return filename; } } catch { /* Cache miss. */ }
    const key = `${hash}-${size}`;
    if (this.pending.has(key)) return this.pending.get(key)!;
    if (this.pending.size >= 128) throw Error('Library busy; try again');
    const work = (async () => {
      await fs.mkdir(this.cacheDir, { recursive: true });
      if (size !== 'full') {
        const original = await this.file(hash, 'full');
        return this.slot(async () => {
          const output = await sharp(await fs.readFile(original), { limitInputPixels: 64000000 }).resize({ width: size === 'thumb' ? 320 : 1280, height: size === 'thumb' ? 320 : 1280, fit: 'inside', withoutEnlargement: true }).webp({ quality: size === 'thumb' ? 82 : 94 }).toBuffer();
          await this.atomic(filename, output); return filename;
        });
      }
      return this.slot(async () => {
        const url = `https://raw.githubusercontent.com/joaorb64/StreamHelperAssets/${asset.revision}/${asset.path.split('/').map(encodeURIComponent).join('/')}`;
        const response = await this.request(url, { redirect: 'error', signal: AbortSignal.timeout(45000) });
        if (!response.ok || !response.body || Number(response.headers.get('content-length') || 0) > limit) { await response.body?.cancel(); throw Error('Could not download the original library image'); }
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
        try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > limit) throw Error('Image too large'); chunks.push(part.value); } }
        catch (error) { await reader.cancel().catch(() => {}); throw error; }
        finally { reader.releaseLock(); }
        const buffer = Buffer.concat(chunks);
        const actual = createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
        if (actual !== hash) throw Error('The original does not match the catalog');
        const metadata = await sharp(buffer, { limitInputPixels: 64000000 }).metadata();
        if (!['png', 'jpeg', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw Error('Unsupported image format');
        await this.atomic(filename, buffer);
        return filename;
      });
    })();
    this.pending.set(key, work);
    try { return await work; } finally { this.pending.delete(key); if (!this.pending.size) void this.cleanup().catch(() => {}); }
  }
  private async atomic(filename: string, buffer: Buffer) {
    const temp = `${filename}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temp, buffer, { flag: 'wx' }); await fs.rename(temp, filename); }
    finally { await fs.unlink(temp).catch(() => {}); }
  }
  private async slot<T>(action: () => Promise<T>) {
    if (this.active >= 4) await new Promise<void>(resolve => this.queue.push(resolve));
    else this.active++;
    try { return await action(); }
    finally { const next = this.queue.shift(); if (next) next(); else this.active--; }
  }
  private async cleanup() {
    if (Date.now() - this.lastCleanup < 60000) return;
    this.lastCleanup = Date.now();
    const files = await Promise.all((await fs.readdir(this.cacheDir)).filter(name => /^[a-f0-9]{40}-(full|preview|thumb)\.(png|jpe?g|webp)$/.test(name)).map(async name => ({ name, stat: await fs.stat(path.join(this.cacheDir, name)) })));
    let total = files.reduce((sum, file) => sum + file.stat.size, 0);
    for (const file of files.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs)) {
      if (total <= this.maxCacheBytes) break;
      // Keep files that a just-completed response may still be sending.
      if (Date.now() - file.stat.mtimeMs < 60000) continue;
      await fs.unlink(path.join(this.cacheDir, file.name)); total -= file.stat.size;
    }
  }
}

export function createTop8AssetRouter(store: Top8Assets) {
  const router = Router();
  router.get('/:hash/:size', async (req, res) => {
    if (!validSize(req.params.size)) { res.sendStatus(404); return; }
    try {
      if (!await store.lookup(req.params.hash)) { res.sendStatus(404); return; }
      const filename = await store.file(req.params.hash, req.params.size);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.sendFile(filename, error => { if (error && !res.headersSent) res.status(503).end(); });
    } catch {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Retry-After', '5');
      res.status(503).json({ message: 'Could not load this image. Retry or use your own image.' });
    }
  });
  return router;
}
