#!/usr/bin/env node
/**
 * Our House: puts the two of us as ourselves (scripts/blender/build_likeness.py)
 * with our private files, in our memories on R2, where only the two of us can
 * get a link to them (the media function signs only our own couple's paths).
 * They never go in the house pack, which anyone can read.
 *
 *   node scripts/upload-likeness.mjs <couple id>      (wrangler, logged in)
 *
 * The path and version match likenessPath and LIKENESS_VERSION in
 * packages/shared/src/house/items.ts.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const couple = (process.argv[2] ?? '').toLowerCase();
if (!/^[0-9a-f-]{36}$/.test(couple)) throw new Error('usage: node scripts/upload-likeness.mjs <couple id>');
const items = readFileSync(join(root, 'packages/shared/src/house/items.ts'), 'utf8');
const version = Number(/LIKENESS_VERSION = (\d+)/.exec(items)?.[1]);
if (!version) throw new Error('LIKENESS_VERSION not found');

for (const who of ['jonal', 'parul']) {
  const abs = join(root, 'assets-build/house/characters', `body_${who}.glb`);
  if (!existsSync(abs)) throw new Error(`body_${who}.glb not built: run build_likeness.py`);
  const key = `memories/${couple}/house/body_${who}_v${version}.glb`;
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync('npx', ['--yes', 'wrangler@4', 'r2', 'object', 'put', `us-media/${key}`, '--file', abs, '--content-type', 'model/gltf-binary', '--remote'], {
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
      break;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.log(`  retrying ${who} (${attempt})`);
    }
  }
  console.log(`↑ ${key} (${(statSync(abs).size / 1e6).toFixed(1)} MB)`);
}
