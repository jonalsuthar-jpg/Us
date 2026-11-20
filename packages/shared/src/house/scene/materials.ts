import * as THREE from 'three';

export type Quality = 'low' | 'medium' | 'high';
export const QUALITIES: Quality[] = ['low', 'medium', 'high'];

/**
 * Every surface in the house, made once per visit and freed on the way out.
 * Low quality uses Lambert (no specular, cheap on older phones); the others
 * are physically based so the sun, the sky and the pool read as real.
 */
export function makeMaterials(quality: Quality) {
  const pbr = quality !== 'low';
  const m = (color: string, roughness = 0.85, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    pbr
      ? new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
      : new THREE.MeshLambertMaterial({ color, transparent: extra.transparent, opacity: extra.opacity, side: extra.side });
  const set = {
    plaster: m('#EFE8DE', 0.92),
    plasterWarm: m('#E7D6C3', 0.9),
    trim: m('#FAF8F4', 0.6),
    wood: m('#9A6A44', 0.55),
    woodDark: m('#5E3B24', 0.5),
    tile: m('#DAD5CD', 0.35),
    roof: m('#7B3F2F', 0.8),
    roofEdge: m('#5C2E22', 0.75),
    stone: m('#BEB6A9', 0.95),
    path: m('#CFC6B6', 0.95),
    grass: m('#5E8E3D', 1),
    grassDark: m('#4C7731', 1),
    hedge: m('#3F6B2C', 0.95),
    bark: m('#6A4A33', 1),
    leaves: m('#4E8A3A', 0.9),
    leavesLight: m('#6DA548', 0.9),
    poolTile: m('#DCEFF2', 0.3),
    water: m('#2F9FC4', 0.05, 0.1, { transparent: true, opacity: 0.78 }),
    glass: m('#A9CFE0', 0.05, 0.3, { transparent: true, opacity: 0.32 }),
    metal: m('#8C9196', 0.35, 0.8),
    black: m('#1D1D22', 0.35, 0.2),
    screen: m('#0E1420', 0.15, 0.1),
    fabric: m('#4E6E8E', 0.95),
    fabricWarm: m('#C9885E', 0.95),
    cushion: m('#E9D8B8', 0.95),
    rug: m('#B5524A', 1),
    bedding: m('#F4F1EA', 0.95),
    blanket: m('#7C9A8A', 0.95),
    counter: m('#F2EFEA', 0.25),
    fridge: m('#D8DCDF', 0.3, 0.5),
    potTerracotta: m('#B4643F', 0.9),
    umbrella: m('#E8B14A', 0.9),
    lounger: m('#F5F2EC', 0.6),
    lamp: pbr ? new THREE.MeshStandardMaterial({ color: '#FFF3D6', emissive: '#FFD9A0', emissiveIntensity: 0.9, roughness: 0.6 }) : new THREE.MeshBasicMaterial({ color: '#FFE6B8' }),
  };
  return {
    ...set,
    dispose() {
      for (const mat of Object.values(set)) mat.dispose();
    },
  };
}

export type Materials = ReturnType<typeof makeMaterials>;
