import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/**
 * The real sky (Poly Haven HDRIs in the house pack): it's what you see past
 * the hedges, and what the glass, the metal and the pool reflect. Day and
 * night are both loaded, so switching is instant.
 *
 * Making the reflection map needs float render targets; a phone without them
 * still gets the sky as a background, and the lights do the rest.
 */
export function Sky({ base, night, onReady }: { base: string; night: boolean; onReady: () => void }) {
  const { gl, scene } = useThree();
  const [day, dark] = useLoader(HDRLoader, [`${base}/sky_day.hdr`, `${base}/sky_night.hdr`]);

  const skies = useMemo(() => {
    const make = (t: THREE.DataTexture) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      let env: THREE.WebGLRenderTarget | null = null;
      try {
        const pmrem = new THREE.PMREMGenerator(gl);
        env = pmrem.fromEquirectangular(t);
        pmrem.dispose();
      } catch {
        env = null;
      }
      return { background: t, env };
    };
    return { day: make(day!), night: make(dark!) };
  }, [gl, day, dark]);

  useEffect(
    () => () => {
      skies.day.env?.dispose();
      skies.night.env?.dispose();
    },
    [skies],
  );

  useEffect(() => {
    const s = night ? skies.night : skies.day;
    scene.background = s.background;
    scene.backgroundIntensity = night ? 0.6 : 1;
    scene.environment = s.env?.texture ?? null;
    scene.environmentIntensity = night ? 0.15 : 0.6;
    onReady();
  }, [scene, skies, night, onReady]);

  return null;
}

/** A gently moving normal map for the pool, drawn in code (no file to load). */
function rippleTexture(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const h = (x: number, y: number) =>
    Math.sin((x / size) * Math.PI * 6) * 0.5 + Math.sin(((x + y) / size) * Math.PI * 10) * 0.3 + Math.sin(((y - x * 0.5) / size) * Math.PI * 14) * 0.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  t.needsUpdate = true;
  return t;
}

/** The pool's water: clear, reflecting the sky, with ripples that drift. */
/** The water's look: rippling, see-through; shared by the pool, the fountain and the pond. */
export function useWaterMaterial(quality: 'low' | 'medium' | 'high'): THREE.Material {
  const { normal, mat } = useMemo(() => {
    const normal = rippleTexture();
    const mat =
      quality === 'low'
        ? new THREE.MeshLambertMaterial({ color: '#2F9FC4', transparent: true, opacity: 0.8 })
        : new THREE.MeshStandardMaterial({ color: '#2A8DB3', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.82, normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35) });
    return { normal, mat };
  }, [quality]);
  useEffect(
    () => () => {
      normal.dispose();
      mat.dispose();
    },
    [normal, mat],
  );
  useFrame((_, dt) => {
    normal.offset.x += dt * 0.012;
    normal.offset.y += dt * 0.007;
  });
  return mat;
}

export function Water({ material }: { material: THREE.Material }) {
  return (
    <mesh position={[5, -0.175, 9]} material={material}>
      <boxGeometry args={[5.96, 0.05, 3.96]} />
    </mesh>
  );
}
