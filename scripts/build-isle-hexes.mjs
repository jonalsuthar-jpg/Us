#!/usr/bin/env node
/**
 * The board's hex pictures: takes the six tile pictures in assets-build/isle/
 * (one per land, a pointy-topped hex on any background), finds the hex in
 * each, crops it so its top and bottom corners touch the picture's edges,
 * and writes 512 px square PNGs (transparent around the hex) to
 * apps/mobile/assets/isle/hex/ (bundled with the app) and
 * apps/web/public/isle/hex/.
 *
 *   node scripts/build-isle-hexes.mjs
 */
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets-build', 'isle');
const outs = [join(root, 'apps', 'mobile', 'assets', 'isle', 'hex'), join(root, 'apps', 'web', 'public', 'isle', 'hex')];
for (const o of outs) mkdirSync(o, { recursive: true });

/** Which picture is which land, by a word in its file name. */
const LANDS = { forest: /\bforest\b/i, pasture: /\b(sheep|pasture|meadow)\b/i, fields: /\b(wheat|wheatfield|fields?)\b/i, hills: /\b(brick|quarry|hills?|clay)\b/i, mountains: /\b(mountains?|mine)\b/i, desert: /\bdesert\b/i };
const SIZE = 512;

/**
 * Makes the background around the hex see-through: a flood from the picture's
 * edges through anything near-black or already clear. Dark parts inside the
 * hex (a mine's mouth) aren't reached, the cream rim stops the flood.
 */
function clearBackground(data, width, height) {
  const seen = new Uint8Array(width * height);
  const stack = [];
  const bg = (p) => data[p * 4 + 3] < 40 || data[p * 4] + data[p * 4 + 1] + data[p * 4 + 2] < 90;
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !bg(p)) continue;
    seen[p] = 1;
    data[p * 4 + 3] = 0;
    const x = p % width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (p >= width) stack.push(p - width);
    if (p < width * (height - 1)) stack.push(p + width);
  }
}

const files = readdirSync(src).filter((f) => /\.(png|jpe?g|webp)$/i.test(f) && !/^(tile|card|dev|sea)_/.test(f));
for (const [land, test] of Object.entries(LANDS)) {
  const file = files.find((f) => test.test(f));
  if (!file) {
    console.warn(`⚠ no picture for ${land}`);
    continue;
  }
  const { data, info } = await sharp(join(src, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  clearBackground(data, info.width, info.height);
  // The hex: everything that isn't see-through or the near-black background.
  let top = info.height;
  let bottom = -1;
  let left = info.width;
  let right = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const solid = data[i + 3] > 40 && data[i] + data[i + 1] + data[i + 2] > 60;
      if (!solid) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  const h = bottom - top + 1;
  const w = right - left + 1;
  // A pointy-topped hex is √3/2 as wide as it is tall; centre it in a square as tall as the hex.
  const pad = Math.round((h - w) / 2);
  const hex = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left, top, width: w, height: h })
    .extend({ left: Math.max(0, pad), right: Math.max(0, h - w - pad), top: 0, bottom: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(SIZE, SIZE, { fit: 'fill' })
    // A palette keeps each picture small with no visible loss.
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toBuffer();
  for (const o of outs) await sharp(hex).toFile(join(o, `${land}.png`));
  console.log(`⬡ ${land}.png from "${file}" (hex ${w}×${h}, width/height ${(w / h).toFixed(3)}, ${(statSync(join(outs[0], `${land}.png`)).size / 1024).toFixed(0)} KB)`);
}
