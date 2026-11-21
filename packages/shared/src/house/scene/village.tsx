import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BUILDINGS, groundY, TREES, ZONE_DRAW_DISTANCE, ZONE_DRAW_DISTANCE_HIGH, ZONES, type Rect } from '../village';
import { plainGlass } from './real-house';

/**
 * The village (scripts/blender/build_village.py): its zones, each a GLB with
 * its baked light, and the trees, drawn instanced. It all loads once with the
 * house, so walking anywhere in the village never waits; a zone far from me
 * just isn't drawn, and the haze hides where it stops.
 */

export const VILLAGE_FILES = ['village.glb', ...ZONES.map((z) => `village_${z.id}_light.png`), 'village_trees.glb'];

/** Stored at half strength, like the house's. */
const STORED_AT = 0.5;

/** How far (x, z) is from a rectangle (0 inside it). */
const distanceTo = (r: Rect, x: number, z: number) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

/** Shrubs along the fronts of the buildings and round the square: [x, z, size]. */
export const SHRUBS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const b of BUILDINGS) {
    if (b.inside) continue;
    // Either side of the door, a little out from the wall.
    const { side, at } = b.door;
    for (const d of [-1.6, 1.6, -3.2, 3.2]) {
      if (side === 'n') out.push([at + d, b.z0 - 0.5, 0.6 + rnd() * 0.4]);
      if (side === 's') out.push([at + d, b.z1 + 0.5, 0.6 + rnd() * 0.4]);
      if (side === 'e') out.push([b.x1 + 0.5, at + d, 0.6 + rnd() * 0.4]);
      if (side === 'w') out.push([b.x0 - 0.5, at + d, 0.6 + rnd() * 0.4]);
    }
  }
  for (let k = 0; k < 10; k++) out.push([-12.6, 50 + k * 0.8, 0.5 + rnd() * 0.3], [12.6, 51 + k * 0.7, 0.5 + rnd() * 0.3]);
  return out;
})();

export interface RealVillageProps {
  base: string;
  /** How much of the baked light to use: 1 by day, less at night. */
  light: number;
  /** Where I am: zones far from here aren't drawn. */
  near: THREE.Vector3;
  water: THREE.Material;
  /** After dark the windows glow, lamps lit inside. */
  night: boolean;
  /** Everything's in and drawable. */
  onReady?: () => void;
}

export function RealVillage({ base, light, near, water, night, onReady }: RealVillageProps) {
  const gltf = useLoader(GLTFLoader, `${base}/village.glb`);
  const maps = useLoader(
    THREE.TextureLoader,
    ZONES.map((z) => `${base}/village_${z.id}_light.png`),
  );
  const trees = useLoader(GLTFLoader, `${base}/village_trees.glb`);

  const zones = useMemo(
    () =>
      ZONES.map((zone, i) => {
        // This zone's meshes (named <zone>_<material>), in a group of their own to show or hide.
        const scene = new THREE.Group();
        scene.name = zone.id;
        const all = gltf.scene.clone(true);
        all.updateMatrixWorld(true);
        const mine: THREE.Mesh[] = [];
        all.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && o.name.startsWith(`${zone.id}_`)) mine.push(o as THREE.Mesh);
        });
        for (const m of mine) {
          m.applyMatrix4(m.parent ? m.parent.matrixWorld : new THREE.Matrix4());
          scene.add(m);
        }
        const map = maps[i]!;
        map.flipY = false;
        map.needsUpdate = true;
        map.channel = 1;
        map.colorSpace = THREE.SRGBColorSpace;
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          if (mesh.name.includes('water')) {
            mesh.material = water;
            mesh.receiveShadow = true;
            return;
          }
          // Each zone has its own light map, so its meshes get their own copy of a material they share with other zones.
          const mat = plainGlass((mesh.material as THREE.MeshStandardMaterial).clone());
          mesh.material = mat;
          if (mesh.geometry.attributes.uv1 && !mat.transparent) {
            mat.lightMap = map;
            mat.lightMapIntensity = light / STORED_AT;
          }
          // The ground catches shadows; the rest casts them too.
          const flat = /grass|Path|cobble|Paving|cafeFloor|pond/.test(mesh.name);
          mesh.castShadow = !flat;
          mesh.receiveShadow = true;
        });
        return { zone, scene };
      }),
    [gltf, maps, water], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // After dark the windows glow warm, as if the lamps were lit inside.
  useEffect(() => {
    for (const { scene } of zones)
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.name.endsWith('_window')) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat.emissive) return;
        mat.emissive.set('#FFC27A');
        mat.emissiveIntensity = night ? 0.6 : 0;
      });
  }, [zones, night]);

  // Dusk and night turn the baked light down (with the house's).
  useEffect(() => {
    for (const { scene } of zones)
      scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mat?.lightMap) mat.lightMapIntensity = light / STORED_AT;
      });
  }, [zones, light]);

  // The trees and shrubs: one instanced mesh per part, a few draw calls for all of them.
  const instanced = useMemo(() => {
    const parts = new Map<string, THREE.Mesh>();
    trees.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) parts.set(o.name, o as THREE.Mesh);
    });
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const add = (name: string, spots: [number, number, number][]) => {
      const src = parts.get(name);
      if (!src || !spots.length) return;
      const im = new THREE.InstancedMesh(src.geometry, src.material, spots.length);
      spots.forEach(([x, z, s], i) => {
        q.setFromAxisAngle(up, (x * 12.9898 + z * 78.233) % (Math.PI * 2));
        // Each a little taller or shorter than the next, the same every time.
        const jitter = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
        im.setMatrixAt(i, m.compose(new THREE.Vector3(x, groundY(x, z) - 0.1, z), q, new THREE.Vector3(s, s * (0.9 + jitter * 0.25), s)));
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      out.push(im);
    };
    for (const kind of [0, 1, 2]) {
      const spots = TREES.filter((t) => t[2] === kind).map(([x, z, , s]): [number, number, number] => [x, z, s]);
      add(`tree${kind}_trunk`, spots);
      add(`tree${kind}_leaves`, spots);
    }
    add('shrub', SHRUBS);
    return out;
  }, [trees]);
  useEffect(() => () => instanced.forEach((im) => im.dispose()), [instanced]);

  useEffect(() => onReady?.(), [onReady]);

  // Far zones aren't drawn; checked a few times a second.
  const tick = useRef(0);
  useFrame(() => {
    if (tick.current++ % 10) return;
    const reach = near.y > 3 ? ZONE_DRAW_DISTANCE_HIGH : ZONE_DRAW_DISTANCE;
    for (const { zone, scene } of zones) scene.visible = distanceTo(zone, near.x, near.z) < reach;
  });

  return (
    <>
      {zones.map(({ zone, scene }) => (
        <primitive key={zone.id} object={scene} />
      ))}
      {instanced.map((im, i) => (
        <primitive key={i} object={im} />
      ))}
    </>
  );
}
