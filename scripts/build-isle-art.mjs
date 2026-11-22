#!/usr/bin/env node
/**
 * Isle's art for the apps: takes the Blender renders in assets-build/isle/
 * (scripts/blender/build_isle_art.py), gives each land its final colour, and
 * writes small JPEGs to apps/mobile/assets/isle/art/ (bundled with the app)
 * and apps/web/public/isle/art/.
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

/** Final colour per picture: the renders are lit for a sunny table; some lands want more depth. */
const GRADE = {
  hills: { saturation: 1.25, brightness: 0.9, contrast: 1.12 },
  mountains: { saturation: 1.05, brightness: 0.86, contrast: 1.18 },
  desert: { saturation: 1.2, brightness: 0.94, contrast: 1.08 },
  fields: { saturation: 1.12, brightness: 0.96, contrast: 1.06 },
  default: { saturation: 1.08, brightness: 1, contrast: 1.04 },
};

const SIZE = { tile: [640, 640], card: [360, 480], dev: [360, 480], sea: [512, 512] };

for (const file of readdirSync(src).filter((f) => f.endsWith('.png'))) {
  const name = file.replace(/\.png$/, '');
  const [kind, land] = name.split('_');
  const g = GRADE[land] ?? GRADE.default;
  const [w, h] = SIZE[kind] ?? [512, 512];
  const img = sharp(join(src, file))
    .resize(w, h)
    .modulate({ saturation: g.saturation, brightness: g.brightness })
    .linear(g.contrast, -(128 * g.contrast - 128))
    .jpeg({ quality: 82, mozjpeg: true });
  for (const o of outs) await img.clone().toFile(join(o, `${name}.jpg`));
  console.log(`🖼  ${name}.jpg ${(statSync(join(outs[0], `${name}.jpg`)).size / 1024).toFixed(0)} KB`);
}
