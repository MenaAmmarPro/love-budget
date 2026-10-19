"use strict";

/*
 * tools/make-icons.js — generate the site's PNG icons with no image tools.
 *
 * Run once from the project root:  node tools/make-icons.js
 * Writes assets/apple-touch-icon.png, assets/og-image.png and
 * assets/icons/icon-192.png + icon-512.png (a pink heart on a dark tile).
 */

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const ty = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([ty, data])), 0);
  return Buffer.concat([len, ty, data, crc]);
}

function png(size, fn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y += 1) {
    raw[o++] = 0;
    for (let x = 0; x < size; x += 1) {
      const p = fn(x, y, size);
      raw[o++] = p[0];
      raw[o++] = p[1];
      raw[o++] = p[2];
      raw[o++] = p[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// Heart implicit curve (x^2 + y^2 - 1)^3 - x^2 * y^3 <= 0.
function inHeart(x, y, size) {
  const nx = ((x + 0.5) / size) * 2 - 1;
  const ny = 1 - ((y + 0.5) / size) * 2;
  const X = nx * 1.3;
  const Y = ny * 1.3 + 0.1;
  return Math.pow(X * X + Y * Y - 1, 3) - X * X * Math.pow(Y, 3) <= 0;
}

function pixel(x, y, size) {
  if (inHeart(x, y, size)) return [233, 30, 99, 255];
  // Soft rounded dark tile background.
  const m = size * 0.06;
  const r = size * 0.22;
  const cx = Math.min(Math.max(x, m + r), size - m - r);
  const cy = Math.min(Math.max(y, m + r), size - m - r);
  const dx = x - cx;
  const dy = y - cy;
  const inTile = x >= m && x < size - m && y >= m && y < size - m &&
    dx * dx + dy * dy <= r * r;
  return inTile ? [9, 11, 32, 255] : [255, 255, 255, 0];
}

const targets = [
  ["assets/apple-touch-icon.png", 180],
  ["assets/og-image.png", 512],
  ["assets/icons/icon-192.png", 192],
  ["assets/icons/icon-512.png", 512]
];

for (const [file, size] of targets) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png(size, pixel));
}
console.log("icons written");
