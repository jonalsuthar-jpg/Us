import { useLoader } from '@react-three/fiber';
import { Component, useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The realistic house (scripts/blender/build_house.py): three layers, each a
 * GLB with its baked bounce light. The same groups as the box house, with
 * the same cut-away walls (their glTF extras carry `cut`), so the camera,
 * the dollhouse and the taps don't know the difference.
 */

export const HOUSE_LAYERS = ['ground', 'upper', 'roof'] as const;
export type HouseLayer = (typeof HOUSE_LAYERS)[number];

/** What lies flat: it catches shadows but casts none worth drawing. */
const FLOORS = new Set(['floor', 'tile', 'grass', 'paving', 'deck', 'pool']);

/** The light maps are stored at half strength so bright spots aren't clipped. */
const STORED_AT = 0.5;

export interface RealHouseProps {
  /** Where ground.glb, ground_light.png, … are: a URL, or a folder on the device. */
  base: string;
  /** How much of the baked light to use: 1 by day, less at night. */
  light: number;
  /** Each layer goes into the group the camera rig looks after. */
  into: Record<HouseLayer, THREE.Group | null>;
  /** It's in the groups: time to swap out the box house and look for the cut-away walls. */
  onReady: () => void;
}

export function RealHouse({ base, light, into, onReady }: RealHouseProps) {
  const gltfs = useLoader(
    GLTFLoader,
    HOUSE_LAYERS.map((l) => `${base}/${l}.glb`),
  );
  const maps = useLoader(
    THREE.TextureLoader,
    HOUSE_LAYERS.map((l) => `${base}/${l}_light.png`),
  );

  // Each layer's materials take its light map through the second UV set.
  const layers = useMemo(
    () =>
      HOUSE_LAYERS.map((layer, i) => {
        // Its own copy: the loader caches one scene per file, and an object can only be in one place.
        const scene = gltfs[i]!.scene.clone(true);
        const map = maps[i]!;
        // The phone's texture loader turns images upside down after loading, so this is set here, after.
        map.flipY = false;
        map.needsUpdate = true;
        map.channel = 1;
        map.colorSpace = THREE.SRGBColorSpace;
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = plainGlass(mesh.material as THREE.MeshStandardMaterial);
          if (mesh.geometry.attributes.uv1 && !mat.transparent) {
            mat.lightMap = map;
            mat.lightMapIntensity = light / STORED_AT;
          }
          if (mat.transparent) mat.depthWrite = false;
          mesh.castShadow = !mat.transparent && !FLOORS.has(mat.name.split('.')[0]!);
          mesh.receiveShadow = true;
        });
        mergeStatic(scene);
        return { layer, scene };
      }),
    [gltfs, maps], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Dusk and night turn the baked light down.
  useEffect(() => {
    for (const { scene } of layers) {
      scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mat?.lightMap) mat.lightMapIntensity = light / STORED_AT;
      });
    }
  }, [layers, light]);

  // Put each layer in its group; take it out again on the way out.
  useEffect(() => {
    const added: [THREE.Group, THREE.Object3D][] = [];
    for (const { layer, scene } of layers) {
      const g = into[layer];
      if (!g) continue;
      g.add(scene);
      added.push([g, scene]);
    }
    onReady();
    return () => {
      for (const [g, s] of added) g.remove(s);
    };
  }, [layers, into, onReady]);

  return null;
}

/**
 * Fewer draw calls: every piece of a layer that never moves and shares a
 * material is merged into one mesh. On a phone each draw call crosses from
 * JavaScript to native code, so hundreds of them cost more than the drawing.
 * Walls that drop away in the dollhouse (userData.cut) stay as they are.
 */
function mergeStatic(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; meshes: THREE.Mesh[] }>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    for (let at: THREE.Object3D | null = o; at && at !== scene; at = at.parent) if (at.userData.cut) return;
    const attrs = Object.keys(mesh.geometry.attributes).sort().join(',');
    const key = `${(mesh.material as THREE.Material).uuid}|${attrs}|${mesh.geometry.index ? 1 : 0}`;
    const g = groups.get(key) ?? { mat: mesh.material as THREE.Material, meshes: [] };
    g.meshes.push(mesh);
    groups.set(key, g);
  });
  for (const { mat, meshes } of groups.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((m) => m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld)));
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    if (!merged) continue;
    const one = new THREE.Mesh(merged, mat);
    one.castShadow = meshes.some((m) => m.castShadow);
    one.receiveShadow = true;
    scene.add(one);
    for (const m of meshes) m.removeFromParent();
  }
}

/**
 * Glass from Blender comes as "transmission" glass, which three.js draws with
 * an extra pass over the whole scene: costly everywhere, and on phones it
 * needs multisampled render buffers expo-gl doesn't have (it crashed opening
 * the house). Plain see-through glass looks the same here.
 */
export function plainGlass<T extends THREE.Material>(mat: T): T {
  const m = mat as unknown as THREE.MeshPhysicalMaterial;
  if (m.transmission > 0) {
    m.transmission = 0;
    m.transparent = true;
    m.opacity = Math.min(m.opacity, 0.3);
    m.depthWrite = false;
    m.needsUpdate = true;
  }
  return mat;
}

/**
 * Around the parts that load files (the real house, the sky): if one fails,
 * it's left out and the box house and plain sky stay, instead of the house
 * stopping.
 */
export class Optional extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn('[house] left out:', error.message);
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
