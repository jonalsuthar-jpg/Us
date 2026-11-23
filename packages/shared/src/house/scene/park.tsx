import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { RegionId } from '../layout';
import { CYCLE, KITES, SWINGS } from '../village';
import { colour, Near } from './fun-models';
import type { FunHost } from './fun';

/**
 * Play in the park: the tandem cycle (get on, ride along the street and once
 * round the park, the same ride on both phones, worked out from when it
 * started), the two-seat swing set, and kites to fly: pick one up from the
 * post and walk or run, and it climbs.
 */

/** How long a ride on the cycle takes, seconds. */
export const CYCLE_S = 75;
const CYCLE_KEY = 'cycle';
/** The kites' keys (items.ts): one each. */
export const KITE_KEYS = ['kite_1', 'kite_2'] as const;
/** Each kite's colour, the same on both phones (and on the post). */
const KITE_COLOURS = ['#E84A6F', '#4AA8E8'];
const SWING_KEY = 'park_swing';

const legs = CYCLE.route.slice(1).map(([x, z], i) => {
  const [px, pz] = CYCLE.route[i]!;
  return { x0: px, z0: pz, x1: x, z1: z, len: Math.hypot(x - px, z - pz) };
});
const ROUTE_M = legs.reduce((a, l) => a + l.len, 0);

/** Where the cycle is, s seconds into a ride, and which way it faces. At the stand before and after. */
export function cycleAt(s: number): { x: number; z: number; h: number } {
  if (s <= 0 || s >= CYCLE_S) return { x: CYCLE.stand.x, z: CYCLE.stand.z, h: CYCLE.stand.h };
  let d = (s / CYCLE_S) * ROUTE_M;
  for (const l of legs) {
    if (d <= l.len) {
      const k = l.len ? d / l.len : 0;
      return { x: l.x0 + (l.x1 - l.x0) * k, z: l.z0 + (l.z1 - l.z0) * k, h: Math.atan2(l.x1 - l.x0, l.z1 - l.z0) };
    }
    d -= l.len;
  }
  return { x: CYCLE.stand.x, z: CYCLE.stand.z, h: CYCLE.stand.h };
}

/** A swing's angle now (each seat its own rhythm). */
const swingAngle = (i: number, t: number) => Math.sin(t * 1.7 + i * 1.3) * 0.38;

interface Ctx {
  h: FunHost;
  raw: (k: string) => Record<string, unknown> | null;
  set: (k: string, v: Record<string, unknown> | null) => void;
  partnerHere: () => boolean;
}

type Seat = { x: number; y: number; z: number; h: number; lie: boolean };

export function usePark({ h, raw, set, partnerHere }: Ctx) {
  const { meId } = h;
  const ride = () => {
    const v = raw(CYCLE_KEY);
    const start = typeof v?.start === 'string' ? Date.parse(v.start) : NaN;
    const s = (Date.now() - start) / 1000;
    return Number.isFinite(s) && s >= 0 && s < CYCLE_S ? s : null;
  };
  const onCycle = () => h.me.seat?.key === 'cycle';
  const near = (x: number, z: number, r: number) => Math.hypot(x - h.me.pos.x, z - h.me.pos.z) < r;
  const theirSeat = () => h.them.pose?.a ?? '';

  /** Seats that move: the cycle's two saddles, the swings. */
  function seat(key: string, i: number): Seat | null {
    if (key === 'cycle') {
      const c = cycleAt(ride() ?? 0);
      const off = i === 0 ? 0.42 : -0.42;
      return { x: c.x + Math.sin(c.h) * off, y: 0.6, z: c.z + Math.cos(c.h) * off, h: c.h, lie: false };
    }
    if (key === SWING_KEY) {
      const a = swingAngle(i, h.now());
      return { x: SWINGS.x + Math.sin(a) * 1.56, y: 2.15 - Math.cos(a) * 1.56 - 0.15, z: SWINGS.seats[i] ?? SWINGS.z, h: Math.PI / 2, lie: false };
    }
    return null;
  }

  /** Off the cycle at the stand; off a swing, a step in front of it. */
  function seatExit(key: string): { at: RegionId; x: number; y: number; z: number } | null {
    if (key === 'cycle') return { at: 'street' as RegionId, x: CYCLE.stand.x, y: 0, z: CYCLE.stand.z + 1.3 };
    if (key === SWING_KEY) return { at: 'parkW' as RegionId, x: SWINGS.x + 1.3, y: 0, z: h.me.pos.z };
    return null;
  }

  /** Riding, you can't step off. */
  const locked = () => onCycle() && ride() !== null;

  function focus(): { label: string; run: () => void } | null {
    const me = h.me;
    if (onCycle()) {
      if (ride() !== null) return { label: 'Riding round the park…', run: () => {} };
      return {
        label: 'Ride round the park',
        run: () => {
          set(CYCLE_KEY, { start: new Date().toISOString(), by: meId });
          const both = partnerHere() && theirSeat().startsWith('sit:cycle');
          h.moment(`cycle:${Date.now()}`, both ? 'Riding together 🚲' : 'Out on the cycle 🚲', both);
        },
      };
    }
    if (me.seat || me.hold) return null;
    if (near(CYCLE.stand.x, CYCLE.stand.z, 2.2) && ride() === null) {
      const taken = theirSeat() === 'sit:cycle:0';
      return {
        label: 'Get on the cycle',
        run: () => {
          me.path = [];
          me.seat = { key: 'cycle', i: taken ? 1 : 0, lie: false };
        },
      };
    }
    if (near(SWINGS.x + 0.8, SWINGS.z, 2)) {
      const free = [0, 1].filter((i) => theirSeat() !== `sit:${SWING_KEY}:${i}`);
      const i = free.sort((a, b) => Math.abs(SWINGS.seats[a]! - me.pos.z) - Math.abs(SWINGS.seats[b]! - me.pos.z))[0];
      if (i !== undefined)
        return {
          label: 'Sit on the swing',
          run: () => {
            me.path = [];
            me.seat = { key: SWING_KEY, i, lie: false };
          },
        };
    }
    return null;
  }

  // Kites: how high each of ours is (climbing while its holder walks or runs, sinking when they stop).
  const kites = useRef({ mine: 2, theirs: 2, last: new THREE.Vector3(), lastThem: new THREE.Vector3(), told: '' }).current;

  function frame(dt: number): { banner?: string } {
    const mineUp = !!h.me.hold && (KITE_KEYS as readonly string[]).includes(h.me.hold.key);
    const theirsUp = !!h.them.pose?.hk && (KITE_KEYS as readonly string[]).includes(h.them.pose.hk);
    const step = (holding: boolean, now: THREE.Vector3, last: THREE.Vector3, height: number) => {
      const speed = dt > 0 ? now.distanceTo(last) / dt : 0;
      last.copy(now);
      if (!holding) return 2;
      return Math.max(1.5, Math.min(7, height + dt * (speed > 0.6 ? 1.6 : -0.35)));
    };
    kites.mine = step(mineUp, h.me.pos, kites.last, kites.mine);
    kites.theirs = step(theirsUp, h.them.pos, kites.lastThem, kites.theirs);
    if (mineUp && theirsUp && kites.mine > 5 && kites.theirs > 5 && kites.told !== 'up') {
      kites.told = 'up';
      h.moment(`kites:${Math.floor(Date.now() / 600_000)}`, 'Kites together 🪁');
    }
    if (!mineUp || !theirsUp) kites.told = '';
    // Both on the swings.
    if (h.me.seat?.key === SWING_KEY && theirSeat().startsWith(`sit:${SWING_KEY}`)) h.moment(`swings:${Math.floor(Date.now() / 600_000)}`, 'On the swings together');
    if (locked()) return { banner: 'Riding round the park 🚲' };
    return {};
  }

  const scene = (
    <>
      <Near near={h.me.pos} x={42} z={55} r={60}>
        <SwingSet h={h} />
        <KitePost hidden={(i) => h.me.hold?.key === KITE_KEYS[i] || h.them.pose?.hk === KITE_KEYS[i]} />
      </Near>
      <Tandem ride={ride} />
      {KITE_KEYS.map((key, i) => (
        <Kite
          key={key}
          colour={KITE_COLOURS[i]!}
          who={() => {
            if (h.me.hold?.key === key) return { pos: h.me.pos, heading: h.me.heading, height: kites.mine };
            const p = h.them.pose;
            return p?.hk === key && h.them.shown ? { pos: h.them.pos, heading: p.h, height: kites.theirs } : null;
          }}
        />
      ))}
    </>
  );

  return { focus, frame, seat, seatExit, locked, scene };
}

const box = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.TorusGeometry(0.33, 0.03, 6, 20);

/** The tandem: two wheels, a long frame, two saddles and handlebars; the wheels turn as it goes. */
function Tandem({ ride }: { ride: () => number | null }) {
  const g = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group[]>([]);
  useFrame(() => {
    if (!g.current) return;
    const s = ride();
    const c = cycleAt(s ?? 0);
    g.current.position.set(c.x, 0, c.z);
    g.current.rotation.y = c.h;
    const turn = s === null ? 0 : (s / CYCLE_S) * ROUTE_M / 0.33;
    for (const w of wheels.current) if (w) w.rotation.x = turn;
  });
  const red = colour('#C8102E');
  const black = colour('#1D1D22');
  return (
    <group ref={g}>
      {[0.85, -0.85].map((z, i) => (
        <group key={z} position={[0, 0.34, z]} ref={(w) => void (wheels.current[i] = w!)}>
          <mesh geometry={wheelGeo} material={black} rotation={[0, Math.PI / 2, 0]} />
          <mesh geometry={box} material={colour('#BEB6A9')} scale={[0.02, 0.62, 0.02]} />
        </group>
      ))}
      <mesh geometry={box} material={red} position={[0, 0.62, 0]} scale={[0.05, 0.05, 1.7]} />
      <mesh geometry={box} material={red} position={[0, 0.48, 0]} scale={[0.05, 0.05, 1.5]} rotation={[0.25, 0, 0]} />
      {[0.42, -0.42].map((z) => (
        <group key={z}>
          <mesh geometry={box} material={red} position={[0, 0.55, z]} scale={[0.04, 0.4, 0.04]} />
          <mesh geometry={box} material={black} position={[0, 0.78, z]} scale={[0.16, 0.05, 0.24]} />
        </group>
      ))}
      <mesh geometry={box} material={red} position={[0, 0.75, 0.82]} scale={[0.04, 0.5, 0.04]} />
      <mesh geometry={box} material={black} position={[0, 1.0, 0.82]} scale={[0.55, 0.04, 0.04]} />
    </group>
  );
}

/** Two swings on an A-frame, each swinging when someone's on it (and a little when not). */
function SwingSet({ h }: { h: FunHost }) {
  const seats = useRef<THREE.Group[]>([]);
  useFrame(() => {
    const t = h.now();
    seats.current.forEach((s, i) => {
      if (!s) return;
      const busy = h.me.seat?.key === SWING_KEY && h.me.seat.i === i ? 1 : h.them.pose?.a === `sit:${SWING_KEY}:${i}` ? 1 : 0.12;
      s.rotation.z = swingAngle(i, t) * busy;
    });
  });
  const wood = colour('#8B5A33');
  const rope = colour('#D9D2C0');
  return (
    <group position={[SWINGS.x, 0, SWINGS.z]}>
      {[-1.25, 1.25].map((z) =>
        [-0.55, 0.55].map((x) => <mesh key={`${z}${x}`} geometry={box} material={wood} position={[x * 0.5, 1.1, z]} rotation={[0, 0, x * 0.45]} scale={[0.09, 2.35, 0.09]} />),
      )}
      <mesh geometry={box} material={wood} position={[0, 2.2, 0]} scale={[0.1, 0.1, 2.7]} />
      {SWINGS.seats.map((z, i) => (
        <group key={z} position={[0, 2.15, z - SWINGS.z]} ref={(s) => void (seats.current[i] = s!)}>
          {[-0.18, 0.18].map((dz) => (
            <mesh key={dz} geometry={box} material={rope} position={[0, -0.78, dz]} scale={[0.02, 1.55, 0.02]} />
          ))}
          <mesh geometry={box} material={wood} position={[0, -1.56, 0]} scale={[0.32, 0.04, 0.46]} />
        </group>
      ))}
    </group>
  );
}

/** The kite post: the two kites hanging on it, until someone takes one. */
function KitePost({ hidden }: { hidden: (i: number) => boolean }) {
  const ks = useRef<THREE.Mesh[]>([]);
  useFrame(() => ks.current.forEach((k, i) => k && (k.visible = !hidden(i))));
  return (
    <group position={[KITES.x, 0, KITES.z]}>
      <mesh geometry={box} material={colour('#5E3B24')} position={[0, 0.9, 0]} scale={[0.08, 1.8, 0.08]} />
      {KITE_COLOURS.map((c, i) => (
        <mesh key={c} ref={(k) => void (ks.current[i] = k!)} geometry={kiteGeo} material={kiteMat(c)} position={[i ? -0.2 : 0.2, 1.45, 0.06]} scale={0.45} />
      ))}
    </group>
  );
}

const kiteGeo = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0, -0.4, 0, 0, 0, -0.75, 0, 0, 0.6, 0, 0, -0.75, 0, 0.4, 0, 0], 3));
  g.computeVertexNormals();
  return g;
})();
const kiteMats = new Map<string, THREE.Material>();
const kiteMat = (c: string) => {
  let m = kiteMats.get(c);
  if (!m) kiteMats.set(c, (m = new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide })));
  return m;
};

/** Which way the wind blows the kites (x, z): out over the pond, towards the hill. */
const WIND: [number, number] = [0.8, -0.6];

/** A kite in the sky above whoever holds one, its string down to their hand. */
function Kite({ who, colour: c }: { who: () => { pos: THREE.Vector3; heading: number; height: number } | null; colour: string }) {
  const g = useRef<THREE.Group>(null);
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#F4F1EA' }));
  }, []);
  useFrame(({ clock }) => {
    const k = who();
    if (!g.current) return;
    g.current.visible = !!k;
    line.visible = !!k;
    if (!k) return;
    const t = clock.elapsedTime;
    // Downwind of whoever holds it (one wind for the whole park, so two kites fly side by side).
    const out = 4 + k.height * 1.15;
    const x = k.pos.x + WIND[0] * out + Math.sin(t * 0.7) * 0.6;
    const y = k.pos.y + 1.5 + k.height + Math.sin(t * 1.3) * 0.3;
    const z = k.pos.z + WIND[1] * out;
    g.current.position.set(x, y, z);
    g.current.rotation.set(0, Math.atan2(WIND[0], WIND[1]), Math.sin(t * 1.1) * 0.25);
    const p = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    p.setXYZ(0, k.pos.x + Math.sin(k.heading) * 0.3, k.pos.y + 1.2, k.pos.z + Math.cos(k.heading) * 0.3);
    p.setXYZ(1, x, y - 0.5, z);
    p.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  });
  return (
    <>
      <group ref={g} visible={false}>
        <mesh geometry={kiteGeo} material={kiteMat(c)} />
        <mesh geometry={box} material={kiteMat('#FFC93C')} position={[0, -1.1, 0]} scale={[0.04, 0.7, 0.02]} />
      </group>
      <primitive object={line} />
    </>
  );
}
