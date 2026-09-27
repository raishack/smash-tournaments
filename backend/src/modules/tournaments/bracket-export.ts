import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Match, Tournament } from "../../shared/types.js";
import { renderBracketSvg } from "./bracket-svg.js";
import { renderPngInBands } from "./png-bands.js";

// Leave headroom below Telegram's 50 MB document limit.
const MAX_FILE_BYTES = 49_000_000;
const cache = new Map<string, Promise<Uint8Array>>();
let renderQueue: Promise<unknown> = Promise.resolve();

// Both notification channels share the same render, including concurrent sends.
export function renderBracketExport(tournament: Tournament, matches: Match[]): Promise<Uint8Array> {
  const key = createHash("sha256").update(JSON.stringify([tournament, matches])).digest("hex");
  const cached = cache.get(key);
  if (cached) return cached;
  const work = renderSvgPng(renderBracketSvg(tournament, matches));
  cache.set(key, work);
  while (cache.size > 2) cache.delete(cache.keys().next().value!);
  const evict = () => { if (cache.get(key) === work) cache.delete(key); };
  void work.then(() => { setTimeout(evict, 30000).unref(); }, evict);
  return work;
}

export function svgDimensions(svg: string): { width: number; height: number } {
  const root = svg.match(/<svg\b[^>]*>/)?.[0] ?? "";
  const width = Number(root.match(/\bwidth="([\d.]+)"/)?.[1]);
  const height = Number(root.match(/\bheight="([\d.]+)"/)?.[1]);
  if (!(width > 0 && height > 0) || !Number.isFinite(width * height)) throw new Error("Invalid bracket image dimensions");
  return { width, height };
}

export function renderSvgPng(svg: string): Promise<Uint8Array> {
  // Serialize different exports as well as sharing identical ones. A large PNG
  // must not compete for raster memory with another tournament or a ladder.
  const work = renderQueue.then(() => rasterize(svg));
  renderQueue = work.catch(() => {});
  return work;
}

async function rasterize(svg: string): Promise<Uint8Array> {
  const { width, height } = svgDimensions(svg);
  // Up to 2x for smaller brackets. Keep at least native resolution on large
  // ones, so participant names never shrink below their original 18px size.
  const scale = Math.max(1, Math.min(2, Math.sqrt(64_000_000 / (width * height))));
  const outputWidth = Math.ceil(width * scale);
  const outputHeight = Math.ceil(height * outputWidth / width);
  if (outputWidth > 32767 || outputHeight > 1_000_000 || outputWidth * outputHeight > 1_000_000_000) {
    throw new Error("La bracket supera el tamaño máximo de un PNG legible; no se ha reducido ni recortado.");
  }
  if (outputWidth * outputHeight > 16_000_000 || outputHeight > 32767) {
    return renderPngInBands(svg, width, height, outputWidth, outputHeight, MAX_FILE_BYTES);
  }
  const png = await sharp(Buffer.from(svg), { density: 72 * scale, limitInputPixels: 17_000_000 })
    .png({ compressionLevel: 6 }).toBuffer();
  if (png.length > MAX_FILE_BYTES) throw new Error("El PNG completo supera el límite de 49 MB para los avisos.");
  return png;
}
