#!/usr/bin/env node
/**
 * Our House: packs what scripts/blender built (assets-build/house) into the
 * art pack the apps download, with a manifest of every file's size and hash.
 *
 *   node scripts/build-house-assets.mjs           write assets-build/house/manifest.json
 *   node scripts/build-house-assets.mjs --dev     …and copy the pack to apps/web/public/house for the lab
 *   node scripts/build-house-assets.mjs --upload  …and upload it to R2 under house/v<version>/ (wrangler, logged in)
 *
 * Building the art first:
 *   node scripts/fetch-house-assets.mjs
 *   D:\blender.exe -b --factory-startup -P scripts/blender/build_house.py -- --samples 256 --size 1024
 *   D:\blender.exe -b --factory-startup -P scripts/blender/convert_models.py -- <ids in scene/furniture.ts>
 *   D:\blender.exe -b --factory-startup -P scripts/blender/build_characters.py   (Quaternius zips unpacked in assets-src/house/characters)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const built = join(root, 'assets-build', 'house');
const version = Number(/HOUSE_PACK_VERSION = (\d+)/.exec(readFileSync(join(root, 'packages/shared/src/house/pack.ts'), 'utf8'))?.[1]);
if (!version) throw new Error('HOUSE_PACK_VERSION not found');

// Only the models the app uses (scene/furniture.ts).
const furniture = readFileSync(join(root, 'packages/shared/src/house/scene/furniture.ts'), 'utf8');
const used = new Set([...furniture.matchAll(/asset: '([a-z0-9_]+)'/g)].map((m) => m[1]));

const files = [];
for (const layer of ['ground', 'upper', 'roof']) files.push(`${layer}.glb`, `${layer}_light.png`);
// The village (scripts/blender/build_village.py): its zones, their light, the trees.
// Every zone in ZONES (the lines like { id: 'west', x0: -62, x1: -13, z0: 14, z1: 86 }).
const zones = [...readFileSync(join(root, 'packages/shared/src/house/village.ts'), 'utf8').matchAll(/\{ id: '([a-z]+)', x0: -?[\d.]+, x1: -?[\d.]+, z0: -?[\d.]+, z1: -?[\d.]+ \}/g)].map((m) => m[1]);
if (!zones.length) throw new Error('village zones not found');
files.push('village.glb', 'village_trees.glb');
for (const z of zones) files.push(`village_${z}_light.png`);
// The real sky, straight from the downloaded HDRIs.
for (const sky of ['day', 'night']) {
  cpSync(join(root, 'assets-src/house/hdri', `${sky}.hdr`), join(built, `sky_${sky}.hdr`));
  files.push(`sky_${sky}.hdr`);
}
for (const f of readdirSync(join(built, 'models'))) if (used.has(f.replace(/\.glb$/, ''))) files.push(`models/${f}`);
// The two of us (scripts/blender/build_characters.py).
for (const f of ['body_m.glb', 'body_f.glb', 'moves.glb']) files.push(`characters/${f}`);
// The sounds (scripts/generate-house-sounds.mjs).
for (const f of readdirSync(join(built, 'sounds')).filter((f) => f.endsWith('.wav')).sort()) files.push(`sounds/${f}`);
for (const id of used) if (!files.includes(`models/${id}.glb`)) throw new Error(`models/${id}.glb not built: run convert_models.py`);

const manifest = { version, bytes: 0, files: [] };
for (const path of files) {
  const abs = join(built, path);
  if (!existsSync(abs)) throw new Error(`${path} not built`);
  const buf = readFileSync(abs);
  manifest.files.push({ path, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
  manifest.bytes += buf.length;
}
writeFileSync(join(built, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`house pack v${version}: ${manifest.files.length} files, ${(manifest.bytes / 1e6).toFixed(1)} MB`);

if (process.argv.includes('--dev')) {
  const dev = join(root, 'apps/web/public/house');
  rmSync(dev, { recursive: true, force: true });
  for (const path of [...files, 'manifest.json']) cpSync(join(built, path), join(dev, path));
  console.log(`copied to ${relative(root, dev)}`);
}

if (process.argv.includes('--upload')) {
  const type = (p) => (p.endsWith('.glb') ? 'model/gltf-binary' : p.endsWith('.png') ? 'image/png' : p.endsWith('.hdr') ? 'image/vnd.radiance' : p.endsWith('.wav') ? 'audio/wav' : 'application/json');
  for (const path of [...files, 'manifest.json']) {
    const abs = join(built, path);
    // R2 now and then answers a 500: try again a few times before giving up.
    for (let attempt = 1; ; attempt++) {
      try {
        execFileSync('npx', ['--yes', 'wrangler@4', 'r2', 'object', 'put', `us-media/house/v${version}/${path}`, '--file', abs, '--content-type', type(path), '--remote'], {
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        console.log(`  retrying ${path} (${attempt})`);
      }
    }
    console.log(`↑ house/v${version}/${path} (${(statSync(abs).size / 1e6).toFixed(1)} MB)`);
  }
}
