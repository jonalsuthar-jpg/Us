import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { isOn, type PlacedItem } from '../items';
import type { Materials } from './materials';

/**
 * Every lamp post (the garden's and the village's), drawn together: one
 * instanced mesh per part, so fifty posts cost four draw calls instead of two
 * hundred. Their light comes from the light pool (lights.tsx); they don't do
 * anything when tapped, so they needn't be items on screen.
 */
export function LampPosts({ items, mats, night }: { items: PlacedItem[]; mats: Materials; night: boolean }) {
  const posts = useMemo(() => items.filter((i) => i.model === 'gardenLamp'), [items]);
  const parts = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    // [centre y, size x/z, height] in the post's own frame (as items.tsx drew it).
    const shape: [number, number, number][] = [
      [0.04, 0.24, 0.08],
      [1.115, 0.07, 2.07],
      [2.45, 0.3, 0.06],
    ];
    return { box, shape };
  }, []);
  const meshes = useMemo(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const make = (mat: THREE.Material, list: PlacedItem[], cy: number, w: number, h: number) => {
      const im = new THREE.InstancedMesh(parts.box, mat, Math.max(1, list.length));
      im.count = list.length;
      list.forEach((p, i) => im.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y + cy, p.z), q, new THREE.Vector3(w, h, w))));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.userData.noHit = true;
      return im;
    };
    const black = mats.black;
    const lit = posts.filter((p) => isOn(p) && night);
    const dark = posts.filter((p) => !(isOn(p) && night));
    return [
      ...parts.shape.map(([cy, w, h]) => make(black, posts, cy, w, h)),
      make(mats.lamp, lit, 2.285, 0.24, 0.27),
      make(mats.lampOff, dark, 2.285, 0.24, 0.27),
    ];
  }, [posts, mats, night, parts]);
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);
  useEffect(() => () => parts.box.dispose(), [parts]);
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}
