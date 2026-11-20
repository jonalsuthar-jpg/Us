import { useLoader } from '@react-three/fiber';
import { Component, useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * The realistic house (scripts/blender/build_house.py): three layers, each a
 * GLB with its baked bounce light. The same groups as the box house, with
 * the same cut-away walls (their glTF extras carry `cut`), so the camera,
 * the dollhouse and the taps don't know the difference.
 */

export const HOUSE_LAYERS = ['ground', 'upper', 'roof'] as const;
export type HouseLayer = (typeof HOUSE_LAYERS)[number];

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
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mesh.geometry.attributes.uv1 && !mat.transparent) {
            mat.lightMap = map;
            mat.lightMapIntensity = light / STORED_AT;
          }
          if (mat.transparent) mat.depthWrite = false;
          mesh.castShadow = !mat.transparent;
          mesh.receiveShadow = true;
        });
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
