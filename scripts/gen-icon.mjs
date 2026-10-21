#!/usr/bin/env node
/**
 * Generates the desktop icon assets with the Node standard library only.
 *
 *   node scripts/gen-icon.mjs
 *
 * Writes:
 *   assets/icon.ico   16/32/48/256 px PNG-compressed entries for the exe
 *   assets/icon.rgba  64x64 raw RGBA for the tao window icon
 *
 * The mark is deliberately geometric: a dark `#0a1113` field, an amber
 * `#f0c050` 2:1 isometric diamond outline (right angles, no rounded corners)
 * and one cyan `#88d8e8` square at its centre. No text, no gradients.
 *
 * Both products are committed so `cargo build` never depends on Node. The PNG
 * encoder and ICO container are hand written here on purpose: the project has
 * no image dependencies, and this script is the only place that needs them.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'assets');

const BACKGROUND = [0x0a, 0x11, 0x13, 0xff];
const AMBER = [0xf0, 0xc0, 0x50, 0xff];
const CYAN = [0x88, 0xd8, 0xe8, 0xff];

/** Render at 4x and average down so diagonal edges do not alias. */
const SUPERSAMPLE = 4;

/** ICO entries: classic Windows sizes. 256 is stored with a zero width byte. */
const ICO_SIZES = [16, 32, 48, 256];

/** Distance from `(px, py)` to segment `(ax, ay)-(bx, by)`. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + clamped * dx), py - (ay + clamped * dy));
}

/** Set one high-resolution pixel. */
function put(pixels, width, x, y, color) {
  const offset = (y * width + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

/**
 * Draw the mark at `size` final pixels and return raw RGBA.
 *
 * The diamond is the project's core shape: `screen_x = 2 * screen_y` on every
 * edge. The cyan centre is a hard square, not a dot with rounded corners.
 */
function render(size) {
  const scale = size * SUPERSAMPLE;
  const high = new Uint8Array(scale * scale * 4);
  for (let y = 0; y < scale; y += 1) {
    for (let x = 0; x < scale; x += 1) put(high, scale, x, y, BACKGROUND);
  }

  const cx = scale / 2;
  const cy = scale / 2;
  const halfWidth = scale * 0.4;
  const halfHeight = scale * 0.2;
  const stroke = Math.max(1.25, size * 0.028) * SUPERSAMPLE;
  const vertices = [
    [cx, cy - halfHeight],
    [cx + halfWidth, cy],
    [cx, cy + halfHeight],
    [cx - halfWidth, cy],
  ];

  for (let y = 0; y < scale; y += 1) {
    for (let x = 0; x < scale; x += 1) {
      let nearest = Infinity;
      for (let i = 0; i < 4; i += 1) {
        const a = vertices[i];
        const b = vertices[(i + 1) % 4];
        nearest = Math.min(nearest, segmentDistance(x + 0.5, y + 0.5, a[0], a[1], b[0], b[1]));
      }
      if (nearest <= stroke / 2) put(high, scale, x, y, AMBER);
    }
  }

  // Hard-edged cyan marker at the centre: the "one data light" of the mark.
  const marker = Math.max(2, Math.round(size * 0.05)) * SUPERSAMPLE;
  const start = Math.round(cx - marker / 2);
  for (let y = start; y < start + marker; y += 1) {
    for (let x = start; x < start + marker; x += 1) put(high, scale, x, y, CYAN);
  }

  // Box filter down to the requested size.
  const rgba = Buffer.alloc(size * size * 4);
  const samples = SUPERSAMPLE * SUPERSAMPLE;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const offset = ((y * SUPERSAMPLE + sy) * scale + x * SUPERSAMPLE + sx) * 4;
          r += high[offset];
          g += high[offset + 1];
          b += high[offset + 2];
          a += high[offset + 3];
        }
      }
      const offset = (y * size + x) * 4;
      rgba[offset] = Math.round(r / samples);
      rgba[offset + 1] = Math.round(g / samples);
      rgba[offset + 2] = Math.round(b / samples);
      rgba[offset + 3] = Math.round(a / samples);
    }
  }
  return rgba;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

/** CRC-32 as required by the PNG chunk format. */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: length, type, payload, CRC. */
function pngChunk(type, payload) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])), 0);
  return Buffer.concat([length, typeBytes, payload, crc]);
}

/** Encode RGBA pixels as an 8-bit truecolour-with-alpha PNG. */
function encodePng(rgba, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Pack PNG entries into an ICO container (PNG-in-ICO, Vista and later). */
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = 6 + directory.length;
  entries.forEach(({ size, png }, index) => {
    const entry = directory.subarray(index * 16, (index + 1) * 16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // palette colours
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

mkdirSync(outDir, { recursive: true });

const entries = ICO_SIZES.map((size) => ({ size, png: encodePng(render(size), size, size) }));
const ico = encodeIco(entries);
const rgba = render(64);
if (rgba.length !== 64 * 64 * 4) throw new Error('64x64 RGBA has the wrong length');

writeFileSync(join(outDir, 'icon.ico'), ico);
writeFileSync(join(outDir, 'icon.rgba'), rgba);
console.log(`[icon] assets/icon.ico   ${ico.length} bytes  (${ICO_SIZES.join('/')} px)`);
console.log(`[icon] assets/icon.rgba  ${rgba.length} bytes  (64x64 RGBA)`);
