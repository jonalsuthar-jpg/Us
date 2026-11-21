#!/usr/bin/env node
/**
 * The village map (packages/shared/src/house/village.ts) as JSON for the
 * Blender build (scripts/blender/build_village.py): one source for both, so
 * the art stands where the app lets you walk.
 *
 *   node scripts/export-village-layout.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const v = await import('../packages/shared/src/house/village.ts');
const out = join(root, 'assets-build', 'house', 'village_layout.json');
mkdirSync(dirname(out), { recursive: true });
const { GATE, VILLAGE_REGIONS, BUILDINGS, GROUNDS, FOUNTAIN, POND, STALL, LAMPS, BENCHES, CAFE_TABLES, TREES, ZONES } = v;
writeFileSync(out, JSON.stringify({ GATE, VILLAGE_REGIONS, BUILDINGS, GROUNDS, FOUNTAIN, POND, STALL, LAMPS, BENCHES, CAFE_TABLES, TREES, ZONES }, null, 1));
console.log(`wrote ${out}`);
