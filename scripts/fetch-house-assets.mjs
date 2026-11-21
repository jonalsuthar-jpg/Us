#!/usr/bin/env node
/**
 * Our House: fetches the free (CC0) source art the realistic house is built
 * from, into assets-src/house/ (not in git). Run again any time: files that
 * are already here with the right checksum are skipped.
 *
 *   models/<id>/…      furniture from Poly Haven (glTF, 1k textures)
 *   textures/<id>/…    surfaces from Poly Haven (colour, normal, AO/rough/metal)
 *   hdri/<id>.hdr      skies from Poly Haven
 *
 * Everything from Poly Haven and ambientCG is CC0: no credit needed, but CREDITS.md lists it anyway.
 *
 *   node scripts/fetch-house-assets.mjs
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets-src', 'house');

/** Catalog model (items.ts) → Poly Haven model. */
export const MODELS = {
  sofa: 'sofa_03',
  armchair: 'modern_arm_chair_01',
  coffeeTable: 'modern_coffee_table_01',
  tv: 'television_02',
  tvCabinet: 'modern_wooden_cabinet',
  bookshelf: 'wooden_bookshelf_worn',
  pendant: 'modern_ceiling_lamp_01',
  deskLamp: 'desk_lamp_arm_01',
  plantPot: 'potted_plant_02',
  plantPotTall: 'potted_plant_04',
  diningTable: 'dining_table',
  chair: 'dining_chair_02',
  nightstand: 'side_table_01',
  desk: 'metal_office_desk',
  wardrobe: 'painted_wooden_cabinet',
  outdoorSet: 'outdoor_table_chair_set_01',
  vase: 'ceramic_vase_01',
  pillow: 'throw_pillows_01',
  ball: 'football',
  wateringCan: 'watering_can_metal_01',
  frame: 'standing_picture_frame_01',
  gardenPot: 'planter_pot_clay',
  stove: 'electric_stove',
  books: 'book_encyclopedia_set_01',
};

/** Surface → Poly Haven texture. */
export const TEXTURES = {
  floorWood: 'laminate_floor_02',
  deck: 'wood_floor_deck',
  plaster: 'painted_plaster_wall',
  plasterOutside: 'white_plaster_02',
  kitchenTile: 'floor_tiles_06',
  bathTile: 'large_floor_tiles_02',
  roof: 'clay_roof_tiles_02',
  grass: 'leafy_grass',
  paving: 'stone_tiles_02',
  brick: 'red_brick_03',
  poolTile: 'granite_tile',
};

/** The village's surfaces → Poly Haven textures (scripts/blender/build_village.py). */
export const VILLAGE_TEXTURES = {
  cobble: 'cobblestone_floor_04',
  squarePaving: 'patterned_cobblestone',
  parkPath: 'stony_dirt_path',
  lanePath: 'grass_path_3',
  sand: 'coast_sand_01',
  plasterYellow: 'yellow_plaster',
  plasterWhite: 'white_stucco',
  plasterRed: 'red_plaster_weathered',
  plasterBlue: 'blue_plaster_weathered',
  plasterClay: 'patterned_clay_plaster',
  stoneBase: 'plaster_stone_wall_01',
  stoneWall: 'old_stone_wall',
  roofSlate: 'red_slate_roof_tiles_01',
  roofGrey: 'grey_roof_tiles',
  shutter: 'wood_shutter',
  door: 'rough_pine_door',
  cafeFloor: 'oak_wood_planks',
  siding: 'weathered_plank_siding',
  pondEdge: 'mossy_cobblestone',
  pondBed: 'brown_mud',
};

/** The village's props → Poly Haven models. */
export const VILLAGE_MODELS = {
  bench: 'painted_wooden_bench',
  picnicTable: 'wooden_picnic_table',
  coffeeCart: 'CoffeeCart_01',
  cafeTable: 'round_wooden_table_02',
  cafeChair: 'painted_wooden_chair_01',
  planter: 'planter_box_01',
  crate: 'wooden_crate_01',
  barrel: 'Barrel_01',
  basket: 'wicker_basket_01',
  shrub: 'shrub_03',
  lantern: 'wooden_lantern_01',
  bin: 'metal_trash_can',
};

/** Surface → ambientCG texture, where Poly Haven has nothing right (a green lawn). */
export const AMBIENTCG = {
  lawn: 'Grass001',
};

/** Sky → Poly Haven HDRI. */
export const SKIES = {
  day: 'kloofendal_48d_partly_cloudy_puresky',
  sunset: 'the_sky_is_on_fire',
  night: 'satara_night_no_lamps',
};

const RES = '1k';

const md5 = (buf) => createHash('md5').update(buf).digest('hex');

async function fetchTo(path, url, sum) {
  if (existsSync(path) && (!sum || md5(readFileSync(path)) === sum)) return 'kept';
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (sum && md5(buf) !== sum) throw new Error(`checksum ${url}`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, buf);
      return buf.length;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function files(id) {
  const res = await fetch(`https://api.polyhaven.com/files/${id}`);
  if (!res.ok) throw new Error(`no such asset: ${id}`);
  return res.json();
}

let bytes = 0;
const note = (what, r) => {
  if (typeof r === 'number') bytes += r;
  console.log(`${r === 'kept' ? '·' : '↓'} ${what}`);
};

for (const id of new Set([...Object.values(MODELS), ...Object.values(VILLAGE_MODELS)])) {
  const g = (await files(id)).gltf?.[RES]?.gltf;
  if (!g) throw new Error(`${id}: no ${RES} glTF`);
  const dir = join(out, 'models', id);
  note(`${id}.gltf`, await fetchTo(join(dir, `${id}.gltf`), g.url, g.md5));
  for (const [rel, f] of Object.entries(g.include ?? {})) note(`  ${rel}`, await fetchTo(join(dir, rel), f.url, f.md5));
}

for (const id of new Set([...Object.values(TEXTURES), ...Object.values(VILLAGE_TEXTURES)])) {
  const f = await files(id);
  const dir = join(out, 'textures', id);
  for (const [map, key] of [['diff', 'Diffuse'], ['nor_gl', 'nor_gl'], ['arm', 'arm']]) {
    const file = f[key]?.[RES]?.jpg ?? f[key]?.[RES]?.png;
    if (!file) continue;
    note(`${id}_${map}`, await fetchTo(join(dir, `${map}.${file.url.endsWith('.png') ? 'png' : 'jpg'}`), file.url, file.md5));
  }
}

// ambientCG comes as a zip; we keep its colour, normal and roughness under our names.
for (const id of new Set(Object.values(AMBIENTCG))) {
  const dir = join(out, 'textures', id);
  if (existsSync(join(dir, 'diff.jpg'))) {
    note(id, 'kept');
    continue;
  }
  const zip = join(out, 'tmp', `${id}.zip`);
  note(`${id}.zip`, await fetchTo(zip, `https://ambientcg.com/get?file=${id}_1K-JPG.zip`));
  const unzipped = join(out, 'tmp', id);
  mkdirSync(unzipped, { recursive: true });
  // Windows' own tar reads zips (Git Bash's would take E: for a host).
  if (process.platform === 'win32') execFileSync(join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', unzipped]);
  else execFileSync('unzip', ['-q', zip, '-d', unzipped]);
  mkdirSync(dir, { recursive: true });
  for (const [from, to] of [['Color', 'diff.jpg'], ['NormalGL', 'nor_gl.jpg'], ['Roughness', 'rough.jpg']]) {
    const f = readdirSync(unzipped).find((n) => n.includes(`_${from}.`));
    if (f) copyFileSync(join(unzipped, f), join(dir, to));
  }
  rmSync(join(out, 'tmp'), { recursive: true, force: true });
}

for (const [name, id] of Object.entries(SKIES)) {
  const h = (await files(id)).hdri?.[RES]?.hdr;
  note(`sky ${name}`, await fetchTo(join(out, 'hdri', `${name}.hdr`), h.url, h.md5));
}

writeFileSync(
  join(out, 'CREDITS.md'),
  [
    '# Our House: source art',
    '',
    'All from Poly Haven (https://polyhaven.com), CC0. No attribution required; listed with thanks.',
    '',
    ...Object.entries(MODELS).map(([k, id]) => `- ${k}: https://polyhaven.com/a/${id}`),
    ...Object.entries(TEXTURES).map(([k, id]) => `- ${k}: https://polyhaven.com/a/${id}`),
    ...Object.entries(VILLAGE_MODELS).map(([k, id]) => `- village ${k}: https://polyhaven.com/a/${id}`),
    ...Object.entries(VILLAGE_TEXTURES).map(([k, id]) => `- village ${k}: https://polyhaven.com/a/${id}`),
    ...Object.entries(SKIES).map(([k, id]) => `- sky ${k}: https://polyhaven.com/a/${id}`),
    '',
    'From ambientCG (https://ambientcg.com), CC0:',
    '',
    ...Object.entries(AMBIENTCG).map(([k, id]) => `- ${k}: https://ambientcg.com/view?id=${id}`),
    '',
  ].join('\n'),
);
console.log(`\n${(bytes / 1e6).toFixed(1)} MB downloaded into assets-src/house`);
