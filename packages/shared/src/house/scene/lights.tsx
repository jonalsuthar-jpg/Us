import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { isOn, toWorld, type PlacedItem } from '../items';
import { FLOOR_H } from '../layout';

/**
 * The lamps' light. Every lamp, ceiling light, lamp post, fire and candle is
 * a light source, but only a handful of real lights exist (POOL_SIZE): each
 * moment they sit on the lit sources nearest to me. Shaders cost per light,
 * so the count never changes (no recompiling when a lamp goes on) and phones
 * stay fast however many lamps there are. Every lit source also gets a soft
 * pool of light on the floor under it, which costs almost nothing.
 */

export interface LightSource {
  key: string;
  /** Where the light comes from, and the floor under it. */
  x: number;
  y: number;
  z: number;
  floor: number;
  color: string;
  /** Point light strength, and how far it reaches. */
  power: number;
  range: number;
  /** The glow's radius on the floor. */
  pool: number;
}

/** Lamps lighting the room, from the item (in its own frame). */
const LAMPS: Record<string, { at: [number, number, number]; day: number; night: number; range: number; pool: number; color?: string }> = {
  floor_lamp: { at: [0, 1.65, 0], day: 1.1, night: 3.2, range: 7, pool: 1.6 },
  pendant: { at: [0, 2.15, 0], day: 1.1, night: 3.2, range: 7, pool: 1.8 },
  bed_lamp: { at: [0, 0.35, 0], day: 0.6, night: 1.8, range: 5, pool: 1.1 },
  desk_lamp: { at: [0, 0.35, 0.1], day: 0.6, night: 1.8, range: 5, pool: 1.1 },
};

/** The light each lit thing gives, at night or by day. */
export function lightSources(items: PlacedItem[], night: boolean, carried: ReadonlySet<string>): LightSource[] {
  const out: LightSource[] = [];
  const add = (it: PlacedItem, at: [number, number, number], power: number, range: number, pool: number, color = '#FFD9A0') => {
    if (power <= 0) return;
    const [x, z] = toWorld(it, at[0], at[2]);
    // The glow goes on the floor of its storey, not on the table or nightstand the lamp stands on.
    const floor = it.y >= FLOOR_H - 0.6 ? FLOOR_H : 0;
    out.push({ key: it.key, x, y: it.y + at[1], z, floor, color, power, range, pool });
  };
  for (const it of items) {
    if (carried.has(it.key)) continue;
    const lamp = LAMPS[it.key];
    if (lamp && isOn(it)) add(it, lamp.at, night ? lamp.night : lamp.day, lamp.range, lamp.pool, lamp.color);
    else if (it.model === 'ceilingLight' && isOn(it)) add(it, it.light ?? [0, 2.8, 0], night ? 3.6 : 0.8, 8, 2.2);
    else if (it.model === 'gardenLamp' && isOn(it) && night) add(it, it.light ?? [0, 2.3, 0], 4, 9, 2.6, '#FFC98A');
    else if (it.model === 'firePit' && isOn(it)) add(it, [0, 0.6, 0], night ? 6 : 1.5, 8, 2.4, '#FF9A4A');
    else if (it.model === 'hotTub' && night) add(it, [0, 0.45, 0], 1.6, 3, 1.4, '#7FD4FF');
    else if (it.model === 'candles') add(it, [0, 0.35, 0], night ? 2.2 : 0.6, 4, 1, '#FFB060');
  }
  return out;
}

/** How many real lights, by quality. Phones keep it small. */
export function poolSize(quality: 'low' | 'medium' | 'high', phone: boolean): number {
  if (quality === 'low') return 2;
  if (phone) return 4;
  return quality === 'high' ? 10 : 6;
}

/**
 * The real lights, moved each few frames onto the lit sources nearest to
 * `near` (me). Their number is fixed for the life of the house.
 */
export function LightPool({ sources, size, near }: { sources: LightSource[]; size: number; near: THREE.Vector3 }) {
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const src = useRef(sources);
  src.current = sources;
  const frame = useRef(0);
  useFrame(() => {
    if (frame.current++ % 6) return;
    const all = src.current;
    const order = all
      .map((s, i) => ({ i, d: (s.x - near.x) ** 2 + (s.y - near.y) ** 2 * 4 + (s.z - near.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, size);
    for (let k = 0; k < size; k++) {
      const l = lights.current[k];
      if (!l) continue;
      const s = order[k] ? all[order[k]!.i]! : null;
      if (!s) {
        l.intensity = 0;
        continue;
      }
      l.position.set(s.x, s.y, s.z);
      l.intensity = s.power;
      l.distance = s.range;
      l.color.set(s.color);
    }
  });
  return (
    <>
      {Array.from({ length: size }, (_, k) => (
        <pointLight key={k} ref={(l) => void (lights.current[k] = l)} intensity={0} distance={7} decay={2} color="#FFD9A0" />
      ))}
    </>
  );
}

/** A soft round glow, white in the middle fading out, drawn in code (no image to load). */
function glowTexture(): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
      const a = Math.max(0, 1 - d) ** 2;
      const i = (y * n + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

/** The pools of light on the floor under each lit source. */
export function LightPools({ sources, night }: { sources: LightSource[]; night: boolean }) {
  const tex = useMemo(glowTexture, []);
  const geo = useMemo(() => new THREE.PlaneGeometry(2, 2), []);
  const mats = useRef(new Map<string, THREE.MeshBasicMaterial>());
  useEffect(
    () => () => {
      tex.dispose();
      geo.dispose();
      for (const m of mats.current.values()) m.dispose();
      mats.current.clear();
    },
    [tex, geo],
  );
  const matFor = (color: string) => {
    let m = mats.current.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      mats.current.set(color, m);
    }
    return m;
  };
  if (!night) return null;
  return (
    <>
      {sources.map((s) => (
        <mesh key={s.key} geometry={geo} material={matFor(s.color)} position={[s.x, s.floor + 0.03, s.z]} rotation={[-Math.PI / 2, 0, 0]} scale={s.pool} userData={{ noHit: true }} renderOrder={1} />
      ))}
    </>
  );
}
