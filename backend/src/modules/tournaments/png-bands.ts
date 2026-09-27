import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createDeflate } from "node:zlib";
import sharp from "sharp";

// Only notification rendering uses sharp in this backend. Avoid retaining many
// distinct SVG band documents in libvips' operation cache.
sharp.cache({ memory: 16, items: 8, files: 0 });

// A PNG is one zlib stream split into IDAT chunks. Writing successive scanlines
// avoids allocating a full RGB bitmap, even for images taller than SVG's limit.
export async function renderPngInBands(
  svg: string, nativeWidth: number, nativeHeight: number,
  width: number, height: number, maxBytes: number,
): Promise<Uint8Array> {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8 bits per channel
  header[9] = 2; // RGB, no interlacing
  const chunks = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header)];
  let bytes = chunks.reduce((sum, chunk) => sum + chunk.length, 12); // IEND
  const scale = width / nativeWidth;
  const rowsPerBand = Math.max(1, Math.min(2048, Math.floor(4_000_000 / width)));
  const rowBytes = width * 3;
  const previousRow = Buffer.alloc(rowBytes);
  // Percent-based page backgrounds must retain the full canvas dimensions.
  const content = svg.replace('width="100%" height="100%"', `width="${nativeWidth}" height="${nativeHeight}"`);

  async function* scanlines(): AsyncGenerator<Buffer> {
    for (let y = 0; y < height; y += rowsPerBand) {
      const rows = Math.min(rowsPerBand, height - y);
      // Include neighbouring pixels before cropping, preserving shadows at seams.
      const top = Math.max(0, y - 64);
      const bottom = Math.min(height, y + rows + 64);
      const band = content.replace(/<svg\b[^>]*>/,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${bottom - top}" viewBox="0 ${top / scale} ${nativeWidth} ${(bottom - top) / scale}" preserveAspectRatio="none">`);
      const raw = await sharp(Buffer.from(band), { limitInputPixels: 9_000_000 })
        .flatten({ background: "#07111f" })
        .extract({ left: 0, top: y - top, width, height: rows }).raw().toBuffer();
      const filtered = Buffer.allocUnsafe(rows * (rowBytes + 1));
      for (let row = 0; row < rows; row++) {
        const source = row * rowBytes;
        const target = row * (rowBytes + 1);
        filtered[target] = 2; // PNG Up filter; retain previous row across bands.
        for (let x = 0; x < rowBytes; x++) {
          filtered[target + 1 + x] = raw[source + x] - (row ? raw[source - rowBytes + x] : previousRow[x]);
        }
      }
      raw.copy(previousRow, 0, raw.length - rowBytes);
      yield filtered;
    }
  }

  await pipeline(Readable.from(scanlines(), { objectMode: false, highWaterMark: 64 * 1024 }), createDeflate({ level: 6 }), new Writable({
    write(data: Buffer, _encoding, callback) {
      bytes += data.length + 12;
      if (bytes > maxBytes) {
        callback(new Error("The full PNG exceeds the 49 MB notification limit."));
        return;
      }
      chunks.push(pngChunk("IDAT", data));
      callback();
    },
  }));
  chunks.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

// PNG CRC-32 (IEEE). Node 20 in production does not provide zlib.crc32.
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : value >>> 1;
  return value >>> 0;
});

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.allocUnsafe(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  let crc = 0xffffffff;
  for (let index = 4; index < chunk.length - 4; index++) crc = crcTable[(crc ^ chunk[index]) & 255] ^ (crc >>> 8);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return chunk;
}
