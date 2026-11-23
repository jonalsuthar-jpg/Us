#!/usr/bin/env node
/**
 * Isle's card pictures for the apps: takes the painted cards in
 * assets-build/isle/ (whole cards, frame and banner included, 2:3), finds
 * each by a word in its file name, and writes JPEGs to
 * apps/mobile/assets/isle/art/ (bundled with the app) and
 * apps/web/public/isle/art/ as card_<resource>.jpg and dev_<card>.jpg.
 *
 *   node scripts/build-isle-art.mjs
 */
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets-build', 'isle');
const outs = [join(root, 'apps', 'mobile', 'assets', 'isle', 'art'), join(root, 'apps', 'web', 'public', 'isle', 'art')];
for (const o of outs) mkdirSync(o, { recursive: true });

/** Which picture is which card, by words in its file name. */
const CARDS = {
  card_wood: /lumber/i,
  card_brick: /brick.*card/i,
  card_wool: /wool.*card/i,
  card_grain: /wheat.*card|grain.*card/i,
  card_ore: /(minecart|ore).*card/i,
  dev_knight: /knight/i,
  dev_roads: /road building/i,
  dev_plenty: /year of plenty|plenty/i,
  dev_monopoly: /monopoly/i,
  dev_vp: /victory point/i,
};
/** Twice the largest the screens show them (a 2:3 card). */
const [W, H] = [400, 600];

const files = readdirSync(src).filter((f) => /\.png$/i.test(f) && !/hex tile|^tile_|^sea/i.test(f));
for (const [name, test] of Object.entries(CARDS)) {
  const file = files.find((f) => test.test(f));
  if (!file) {
    console.warn(`⚠ no picture for ${name}`);
    continue;
  }
  const img = sharp(join(src, file)).resize(W, H, { fit: 'cover' }).jpeg({ quality: 84, mozjpeg: true });
  for (const o of outs) await img.clone().toFile(join(o, `${name}.jpg`));
  console.log(`🖼  ${name}.jpg ← ${file} ${(statSync(join(outs[0], `${name}.jpg`)).size / 1024).toFixed(0)} KB`);
}
