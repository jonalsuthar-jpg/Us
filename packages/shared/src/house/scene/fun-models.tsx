import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { CROPS, type Crop } from '../fun';
import type { PlacedItem } from '../items';
import { B } from './model';

/**
 * The shapes of the things to do together (items.ts: the fire pit, the hot
 * tub, the garden beds…), from boxes and a few spheres like the rest.
 * Each stands on y = 0 facing +z.
 */

/** One plain material per colour, shared by everything drawn here. */
const colours = new Map<string, THREE.MeshLambertMaterial>();
export function colour(c: string, glow = false): THREE.MeshLambertMaterial {
  const key = `${c}${glow ? '!' : ''}`;
  let m = colours.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: c, emissive: glow ? new THREE.Color(c) : undefined, emissiveIntensity: glow ? 1.2 : 0 });
    colours.set(key, m);
  }
  return m;
}

const sphere = new THREE.SphereGeometry(1, 12, 8);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 14);

function Ball({ at, r, c, glow }: { at: [number, number, number]; r: number; c: string; glow?: boolean }) {
  return <mesh geometry={sphere} material={colour(c, glow)} position={at} scale={r} />;
}

function Can({ at, r, h, c, glow }: { at: [number, number, number]; r: number; h: number; c: string; glow?: boolean }) {
  return <mesh geometry={cylinder} material={colour(c, glow)} position={[at[0], at[1] + h / 2, at[2]]} scale={[r, h, r]} />;
}

/** Flames that flicker, for the fire and the candles. */
function Flames({ n, spread, size, y }: { n: number; spread: number; size: number; y: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    g.current?.children.forEach((c, i) => {
      const k = 0.75 + Math.sin(t * 9 + i * 2.3) * 0.18 + Math.sin(t * 23 + i) * 0.08;
      c.scale.set(size * 0.55, size * k * 1.6, size * 0.55);
    });
  });
  return (
    <group ref={g} position={[0, y, 0]}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return <mesh key={i} geometry={sphere} material={colour(i % 2 ? '#FFB43A' : '#FF6A1A', true)} position={[Math.cos(a) * spread, size * 0.8, Math.sin(a) * spread]} />;
      })}
    </group>
  );
}

/** Bubbles rising in the hot tub. */
function Bubbles({ w }: { w: number }) {
  const g = useRef<THREE.Group>(null);
  const seeds = useMemo(() => Array.from({ length: 14 }, (_, i) => [((i * 37) % 17) / 17 - 0.5, ((i * 53) % 13) / 13 - 0.5, i * 0.37] as const), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    g.current?.children.forEach((c, i) => {
      const s = seeds[i]!;
      const k = (t * 0.8 + s[2]) % 1;
      c.position.set(s[0] * w * 1.6, 0.55 + k * 0.08, s[1] * w * 1.6);
      c.scale.setScalar(0.025 + k * 0.02);
    });
  });
  return <group ref={g}>{seeds.map((_, i) => <mesh key={i} geometry={sphere} material={colour('#F4FBFF')} />)}</group>;
}

/** What grows in a bed, by how far it's grown (0…1). */
function Crops({ crop, growth }: { crop: Crop; growth: number }) {
  const c = CROPS[crop].color;
  const s = 0.25 + growth * 0.75;
  const spots: [number, number][] = [[-0.22, -0.42], [0.22, -0.42], [-0.22, 0], [0.22, 0], [-0.22, 0.42], [0.22, 0.42]];
  const tall = crop === 'sunflower' ? 0.9 : crop === 'rose' || crop === 'tulip' ? 0.45 : 0.32;
  return (
    <>
      {spots.map(([x, z], i) => (
        <group key={i} position={[x, 0.28, z]} scale={s}>
          <B a={[-0.04, 0, -0.04]} b={[0.04, tall, 0.04]} m="leaves" />
          <Ball at={[0, tall * 0.6, 0]} r={0.11} c="#5E8F3A" />
          {growth >= 1 ? <Ball at={[0.05, tall + 0.03, 0]} r={crop === 'sunflower' ? 0.12 : 0.06} c={c} /> : growth > 0.5 ? <Ball at={[0.05, tall, 0]} r={0.035} c={c} /> : null}
        </group>
      ))}
    </>
  );
}

/** Lights strung between two posts, glowing. */
function FairyLights() {
  const bulbs = useMemo(() => Array.from({ length: 22 }, (_, i) => {
    const t = i / 21;
    return [-3.5 + t * 7, 2.35 - Math.sin(t * Math.PI) * 0.5, 0] as [number, number, number];
  }), []);
  const tint = ['#FFE7A0', '#FFC4D6', '#BDE3FF'];
  // A bulb right by the camera would fill the screen: those step out of the way.
  const g = useRef<THREE.Group>(null);
  const at = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    g.current?.children.forEach((b) => {
      b.getWorldPosition(at);
      b.visible = at.distanceTo(camera.position) > 1.5;
    });
  });
  return (
    <>
      <B a={[-3.55, 0, -0.05]} b={[-3.45, 2.45, 0.05]} m="bark" />
      <B a={[3.45, 0, -0.05]} b={[3.55, 2.45, 0.05]} m="bark" />
      <group ref={g}>{bulbs.map((p, i) => <Ball key={i} at={p} r={0.04} c={tint[i % 3]!} glow />)}</group>
    </>
  );
}

function Balloons() {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.y = Math.sin(clock.elapsedTime * 0.7) * 0.15;
  });
  const cs = ['#E84A6F', '#FFC93C', '#4AA8E8', '#9B5DE5', '#3CCB7F'];
  return (
    <group ref={g}>
      {cs.map((c, i) => {
        const a = (i / cs.length) * Math.PI * 2;
        const x = Math.cos(a) * 0.18;
        const z = Math.sin(a) * 0.18;
        const y = 1.55 + (i % 2) * 0.22;
        return (
          <group key={c}>
            <Ball at={[x, y, z]} r={0.16} c={c} />
            <B a={[x / 3 - 0.004, 0, z / 3 - 0.004]} b={[x / 3 + 0.004, y - 0.15, z / 3 + 0.004]} m="trim" />
          </group>
        );
      })}
      <B a={[-0.06, 0, -0.06]} b={[0.06, 0.08, 0.06]} m="metal" />
    </group>
  );
}

/** The shapes, or null when the model isn't one of these. */
/** (Their light comes from the light pool: scene/lights.tsx.) */
export function funModel(item: PlacedItem, on: boolean, night: boolean): ReactNode | null {
  switch (item.model) {
    case 'firePit':
      return (
        <>
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return <B key={i} a={[Math.cos(a) * 0.5 - 0.1, 0, Math.sin(a) * 0.5 - 0.1]} b={[Math.cos(a) * 0.5 + 0.1, 0.22, Math.sin(a) * 0.5 + 0.1]} m="stone" />;
          })}
          <group rotation={[0, 0.5, 0]}>
            <B a={[-0.3, 0.04, -0.05]} b={[0.3, 0.14, 0.05]} m="bark" />
          </group>
          <group rotation={[0, -0.6, 0]}>
            <B a={[-0.3, 0.06, -0.05]} b={[0.3, 0.16, 0.05]} m="bark" />
          </group>
          {on ? <Flames n={6} spread={0.12} size={0.13} y={0.12} /> : null}
        </>
      );
    case 'logBench':
      return (
        <>
          <group position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
            <mesh geometry={cylinder} material={colour('#6B4A2E')} scale={[0.2, 1.6, 0.2]} />
          </group>
          <B a={[-0.75, 0.36, -0.12]} b={[0.75, 0.4, 0.12]} m="wood" />
        </>
      );
    case 'hotTub':
      return (
        <>
          <B a={[-0.95, 0, -0.95]} b={[0.95, 0.62, 0.95]} m="woodDark" />
          <B a={[-0.82, 0.5, -0.82]} b={[0.82, 0.58, 0.82]} m="water" />
          <B a={[-0.95, 0.62, -0.95]} b={[0.95, 0.66, -0.82]} m="wood" />
          <B a={[-0.95, 0.62, 0.82]} b={[0.95, 0.66, 0.95]} m="wood" />
          <B a={[-0.95, 0.62, -0.82]} b={[-0.82, 0.66, 0.82]} m="wood" />
          <B a={[0.82, 0.62, -0.82]} b={[0.95, 0.66, 0.82]} m="wood" />
          <Bubbles w={0.5} />
        </>
      );
    case 'telescope':
      return (
        <>
          <B a={[-0.02, 0, -0.18]} b={[0.02, 1.0, -0.14]} m="metal" />
          <B a={[-0.17, 0, 0.08]} b={[-0.13, 1.0, 0.12]} m="metal" />
          <B a={[0.13, 0, 0.08]} b={[0.17, 1.0, 0.12]} m="metal" />
          <group position={[0, 1.05, 0]} rotation={[0.7, 0, 0]}>
            <mesh geometry={cylinder} material={colour('#E9E4DA')} rotation={[Math.PI / 2, 0, 0]} scale={[0.07, 0.75, 0.07]} />
            <mesh geometry={cylinder} material={colour('#2E2E38')} position={[0, 0, 0.38]} rotation={[Math.PI / 2, 0, 0]} scale={[0.08, 0.06, 0.08]} />
          </group>
        </>
      );
    case 'gardenBed': {
      const crop = item.state.crop as Crop | undefined;
      const grown = crop && CROPS[crop] ? Math.min(1, (item.state.days?.length ?? 0) / CROPS[crop].days) : 0;
      return (
        <>
          <B a={[-0.5, 0, -0.7]} b={[0.5, 0.25, -0.62]} m="wood" />
          <B a={[-0.5, 0, 0.62]} b={[0.5, 0.25, 0.7]} m="wood" />
          <B a={[-0.5, 0, -0.62]} b={[-0.42, 0.25, 0.62]} m="wood" />
          <B a={[0.42, 0, -0.62]} b={[0.5, 0.25, 0.62]} m="wood" />
          <B a={[-0.42, 0, -0.62]} b={[0.42, 0.22, 0.62]} mat={colour(item.state.watered ? '#3E2A1C' : '#5A3E2A')} />
          {crop && CROPS[crop] ? <Crops crop={crop} growth={grown} /> : null}
        </>
      );
    }
    case 'swing':
      return (
        <>
          <B a={[-1.0, 0, -0.06]} b={[-0.9, 2.2, 0.06]} m="bark" />
          <B a={[0.9, 0, -0.06]} b={[1.0, 2.2, 0.06]} m="bark" />
          <B a={[-1.0, 2.1, -0.07]} b={[1.0, 2.24, 0.07]} m="bark" />
          <B a={[-0.62, 0.5, -0.01]} b={[-0.6, 2.1, 0.01]} m="trim" />
          <B a={[0.6, 0.5, -0.01]} b={[0.62, 2.1, 0.01]} m="trim" />
          <B a={[-0.7, 0.44, -0.2]} b={[0.7, 0.5, 0.2]} m="wood" />
          <B a={[-0.7, 0.5, -0.22]} b={[0.7, 0.9, -0.18]} m="wood" />
        </>
      );
    case 'mailbox':
      return (
        <>
          <B a={[-0.04, 0, -0.04]} b={[0.04, 1.0, 0.04]} m="woodDark" />
          <B a={[-0.15, 1.0, -0.22]} b={[0.15, 1.25, 0.22]} mat={colour('#B5524A')} />
          {/* The flag: up when a letter's waiting. */}
          <group position={[0.16, 1.1, -0.1]} rotation={[on ? 0 : Math.PI / 2, 0, 0]}>
            <B a={[0, 0, -0.01]} b={[0.02, 0.22, 0.01]} m="metal" />
            <B a={[0, 0.14, 0]} b={[0.02, 0.22, 0.12]} mat={colour('#FFC93C', on)} />
          </group>
        </>
      );
    case 'fairyLights':
      return <FairyLights />;
    case 'picnic':
      return (
        <>
          {Array.from({ length: 16 }, (_, i) => {
            const x = (i % 4) * 0.5 - 1;
            const z = Math.floor(i / 4) * 0.4 - 0.8;
            return <B key={i} a={[x, 0, z]} b={[x + 0.5, 0.02, z + 0.4]} mat={colour((i + Math.floor(i / 4)) % 2 ? '#E9E4DA' : '#C8443F')} />;
          })}
          <B a={[-0.2, 0.02, -0.55]} b={[0.2, 0.28, -0.3]} mat={colour('#A8743A')} />
          <B a={[-0.2, 0.28, -0.44]} b={[0.2, 0.36, -0.41]} mat={colour('#8A5A2A')} />
          <Ball at={[0.4, 0.07, -0.45]} r={0.05} c="#D9412B" />
          <Ball at={[0.5, 0.07, -0.4]} r={0.05} c="#7FB24A" />
        </>
      );
    case 'popcorn':
      return (
        <>
          <Can at={[0, 0, 0]} r={0.12} h={0.1} c="#D94F70" />
          {Array.from({ length: 9 }, (_, i) => <Ball key={i} at={[((i * 37) % 9) / 50 - 0.08, 0.11 + (i % 3) * 0.02, ((i * 53) % 9) / 50 - 0.08]} r={0.03} c="#FFF6DD" />)}
        </>
      );
    case 'blanket':
      return <B a={[-0.9, 0, -0.35]} b={[0.9, 0.05, 0.4]} m="blanket" />;
    case 'candles':
      return (
        <>
          {[-0.12, 0, 0.12].map((x, i) => (
            <group key={x} position={[x, 0, (i % 2) * 0.06]}>
              <Can at={[0, 0, 0]} r={0.025} h={0.12 + i * 0.04} c="#F4F1EA" />
              <Ball at={[0, 0.15 + i * 0.04, 0]} r={0.016} c="#FFB43A" glow />
            </group>
          ))}
        </>
      );
    case 'balloons':
      return <Balloons />;
    case 'cake':
      return (
        <>
          <Can at={[0, 0, 0]} r={0.16} h={0.1} c="#F7D9E3" />
          <Can at={[0, 0.1, 0]} r={0.11} h={0.08} c="#FFFFFF" />
          <Can at={[0, 0.18, 0]} r={0.006} h={0.06} c="#4AA8E8" />
          <Ball at={[0, 0.25, 0]} r={0.012} c="#FFB43A" glow />
        </>
      );
  }
  return null;
}

export { Ball as FunBall, sphere as funSphere };
