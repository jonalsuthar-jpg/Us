#!/usr/bin/env node
/**
 * Renders the app icon (the couple's seal: rose + teal circles on plum) and
 * the Android notification small icon as PNGs, with no image dependencies.
 *
 *   node scripts/generate-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4×4 supersampling for smooth edges
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const p = pixel((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
          acc = acc.map((v, i) => v + p[i]);
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      acc.forEach((v, i) => (raw[o + i] = Math.round(v / 16)));
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const plum = hex('#241933');
const rose = hex('#F5547C');
const teal = hex('#0C8F82');
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

// Full-bleed app icon (stores apply their own mask).
const icon = png(1024, (x, y) => {
  const a = inCircle(x, y, 0.39, 0.5, 0.2);
  const b = inCircle(x, y, 0.61, 0.5, 0.2);
  let c = plum;
  if (a) c = rose;
  if (b) c = teal;
  if (a && b) c = rose.map((v, i) => Math.round(255 - ((255 - v) * (255 - teal[i])) / 255)); // screen blend
  return [...c, 255];
});

// Android small icon: white rings on transparent.
const small = png(96, (x, y) => {
  const ring = (cx) => {
    const d = Math.hypot(x - cx, y - 0.5);
    return d <= 0.27 && d >= 0.19;
  };
  return ring(0.38) || ring(0.62) ? [255, 255, 255, 255] : [0, 0, 0, 0];
});

const dir = join(root, 'apps/mobile/assets/images');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'icon.png'), icon);
writeFileSync(join(dir, 'ic_stat_onesignal_default.png'), small);
console.log('✓ apps/mobile/assets/images/icon.png, ic_stat_onesignal_default.png');
