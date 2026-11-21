import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { walletRef } from '../../api/wallet';
import { WORLD_DAY_MS, worldHours } from '../sky';
import { HILL, LAKE } from '../village';
import { colour, FunBall, funSphere } from './fun-models';
import type { FunHost, FunPanel } from './fun';

/**
 * The lake and the hill: the rowing boat (get in, row out round the lake and
 * back, the same ride on both phones), fishing off the jetty, shells on the
 * beach that fill a jar at home, sandcastles, lanterns on the water at night,
 * waves on the shore, and love locks on the railing up on the hill.
 */

/** How long a row round the lake takes, seconds. */
export const RIDE_S = 70;

/** Where the boat is, s seconds into a ride: out from the dock, once round the loop, back. */
function boatPos(s: number): { x: number; z: number } {
  const { boatDock: d, loop } = LAKE;
  const t = Math.min(1, Math.max(0, s / RIDE_S));
  const leg = 0.12;
  // The loop starts and ends at its north side, nearest the dock.
  const start = { x: loop.x, z: loop.z - loop.rz };
  if (t < leg) return { x: d.x + (start.x - d.x) * (t / leg), z: d.z + (start.z - d.z) * (t / leg) };
  if (t > 1 - leg) {
    const k = (t - (1 - leg)) / leg;
    return { x: start.x + (d.x - start.x) * k, z: start.z + (d.z - start.z) * k };
  }
  const a = ((t - leg) / (1 - 2 * leg)) * Math.PI * 2;
  return { x: loop.x + Math.sin(a) * loop.rx, z: loop.z - Math.cos(a) * loop.rz };
}

/** Where the boat is and which way it faces (the way it's going; out over the lake at the dock). */
export function boatAt(s: number): { x: number; z: number; h: number } {
  const p = boatPos(s);
  if (s <= 0 || s >= RIDE_S) return { ...p, h: Math.PI };
  const n = boatPos(s + 0.5);
  return { ...p, h: Math.atan2(n.x - p.x, n.z - p.z) };
}

/** The world's day, as a number: shells come back, sandcastles wash away. */
const worldDay = (coupleId?: string) => Math.floor((Date.now() + (worldHours(0, coupleId) / 24) * WORLD_DAY_MS) / WORLD_DAY_MS);

/** Today's shells on the beach: [x, z], the same on both phones. */
export function shellsOn(day: number): [number, number][] {
  let seed = (day * 9301 + 49297) % 233280;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const r = LAKE.shells;
  return Array.from({ length: 8 }, () => [r.x0 + rnd() * (r.x1 - r.x0), r.z0 + rnd() * (r.z1 - r.z0)]);
}

const BOAT_KEY = 'boat';
const SHELLS_KEY = 'shells';
const CASTLE_KEY = 'sandcastle';
const LOCKS_KEY = 'locks';
const LOCK_COLOURS = ['#E84A6F', '#FFC93C', '#4AA8E8', '#9B5DE5', '#3CCB7F', '#FF8A3D'];
const FISH = ['a perch', 'a little carp', 'a silver trout', 'a sunfish', 'a lucky goldfish'];

interface Ctx {
  h: FunHost;
  raw: (k: string) => Record<string, unknown> | null;
  set: (k: string, v: Record<string, unknown> | null) => void;
  partnerHere: () => boolean;
  openPanel: (id: string | null) => void;
}

type Focus = { label: string; run: () => void };

export function useOutdoors({ h, raw, set, partnerHere, openPanel }: Ctx) {
  const { meId } = h;
  const st = useRef({ fishUntil: 0, biteAt: 0, biteEnd: 0, fishing: false, sunsetDay: -1 }).current;
  const swing = useRef(0);

  const ride = () => {
    const v = raw(BOAT_KEY);
    const start = typeof v?.start === 'string' ? Date.parse(v.start) : NaN;
    const s = (Date.now() - start) / 1000;
    return Number.isFinite(s) && s >= 0 && s < RIDE_S ? s : null;
  };
  const inBoat = () => h.me.seat?.key === 'boat';
  const shellState = () => {
    const v = raw(SHELLS_KEY);
    const day = worldDay(h.coupleId);
    const taken = v?.day === day && Array.isArray(v.taken) ? (v.taken as number[]) : [];
    const total = typeof v?.n === 'number' ? v.n : 0;
    return { day, taken, total };
  };
  const castle = () => {
    const v = raw(CASTLE_KEY);
    return v && typeof v.x === 'number' && typeof v.z === 'number' && v.day === worldDay(h.coupleId) ? { x: v.x, z: v.z } : null;
  };
  const locks = (): { t: string; c: number; at: string }[] => {
    const v = raw(LOCKS_KEY);
    return Array.isArray(v?.list) ? (v!.list as { t: string; c: number; at: string }[]).filter((l) => typeof l?.t === 'string').slice(0, 30) : [];
  };
  const near = (x: number, z: number, r: number) => Math.hypot(x - h.me.pos.x, z - h.me.pos.z) < r;

  /** The boat's seats (front and back), wherever the boat is. */
  function seat(key: string, i: number): { x: number; y: number; z: number; h: number; lie: boolean } | null {
    if (key !== 'boat') return null;
    const s = ride();
    const b = boatAt(s ?? 0);
    const off = i === 0 ? 0.55 : -0.55;
    return { x: b.x + Math.sin(b.h) * off, y: LAKE.surface + 0.12, z: b.z + Math.cos(b.h) * off, h: b.h + (i === 0 ? Math.PI : 0), lie: false };
  }

  /** Getting out of the boat: back onto the jetty. */
  function seatExit(key: string): { at: 'jetty'; x: number; y: number; z: number } | null {
    if (key !== 'boat') return null;
    return { at: 'jetty', x: LAKE.jettyEnd.x, y: 0.3, z: LAKE.jettyEnd.z - 1 };
  }

  /** Out on the lake you can't step off. */
  const locked = () => inBoat() && ride() !== null;

  function focus(): Focus | null {
    const me = h.me;
    if (inBoat()) {
      if (ride() !== null) return { label: 'Rowing round the lake…', run: () => {} };
      return {
        label: 'Row out',
        run: () => {
          set(BOAT_KEY, { start: new Date().toISOString(), by: meId });
          h.moment(`row:${Date.now()}`, partnerHere() && h.them.pose?.a?.startsWith('sit:boat') ? 'Rowing out together 🚣' : 'Out on the lake 🚣', partnerHere());
        },
      };
    }
    if (me.seat) return null;
    // Fishing off the end of the jetty.
    if (st.fishing) {
      const now = h.now();
      if (now >= st.biteAt && now < st.biteEnd)
        return {
          label: 'Reel it in!',
          run: () => {
            st.fishing = false;
            me.doing = null;
            const fish = FISH[Math.floor(Math.random() * FISH.length)]!;
            h.sound?.play('splash', 0.4);
            h.moment(`fish:${Date.now()}`, `You caught ${fish}! 🎣`, false);
            h.wallet?.earn('fish', walletRef('fish', meId, Date.now()));
          },
        };
      return { label: 'Waiting for a bite…', run: () => {} };
    }
    if (me.at === 'jetty' && near(LAKE.boatDock.x, LAKE.boatDock.z, 2.6) && ride() === null) {
      const taken = h.them.pose?.a === 'sit:boat:0';
      return {
        label: 'Get in the boat',
        run: () => {
          me.path = [];
          me.seat = { key: 'boat', i: taken ? 1 : 0, lie: false };
        },
      };
    }
    if (me.at === 'jetty' && near(LAKE.jettyEnd.x, LAKE.jettyEnd.z, 1.4))
      return {
        label: 'Cast a line',
        run: () => {
          const now = h.now();
          st.fishing = true;
          st.biteAt = now + 4 + Math.random() * 8;
          st.biteEnd = st.biteAt + 2.2;
          me.heading = Math.PI * 0.95;
          me.doing = { act: 'water', until: st.biteEnd + 0.2 };
          h.sound?.play('splash', 0.25);
        },
      };
    // Shells on the beach.
    if (me.at === 'beach') {
      const { day, taken, total } = shellState();
      const i = shellsOn(day).findIndex(([x, z], k) => !taken.includes(k) && near(x, z, 1.0));
      if (i >= 0)
        return {
          label: 'Pick up a shell',
          run: () => {
            set(SHELLS_KEY, { day, taken: [...taken, i], n: total + 1 });
            h.sound?.play('click', 0.4);
            h.say(total + 1 === 1 ? 'A shell for the jar at home 🐚' : `${total + 1} shells in the jar at home 🐚`);
            if ((total + 1) % 3 === 0) h.wallet?.earn('shells', walletRef('shells', day, total + 1));
          },
        };
    }
    // The love locks, on the railing up on the hill.
    if (me.at === 'hillTop' && Math.abs(me.pos.x - HILL.railing.x) < 2) return { label: 'Our love locks', run: () => openPanel('locks') };
    return null;
  }

  function frame(): { banner?: string } {
    const now = h.now();
    // Fishing: a bite comes, and if it isn't reeled in quickly, it's gone.
    if (st.fishing) {
      if (now >= st.biteEnd) {
        st.fishing = false;
        h.say('It got away…');
      } else if (now >= st.biteAt && Math.floor(now * 4) % 4 === 0 && swing.current < 0.5) {
        swing.current = 1;
        h.sound?.play('splash', 0.2);
      }
    }
    swing.current = Math.max(0, swing.current - 0.02);
    // The sunset from the hill bench, together.
    const hr = worldHours(Date.now(), h.coupleId);
    const p = h.them.pose;
    if (h.me.seat?.key === 'hill_bench' && p?.a?.startsWith('sit:hill_bench') && hr > 17 && hr < 19.6) {
      const day = worldDay(h.coupleId);
      if (st.sunsetDay !== day) {
        st.sunsetDay = day;
        h.moment(`sunset:${day}`, 'Watching the sunset from the hill 🌅');
      }
    }
    if (st.fishing) return { banner: now >= st.biteAt ? 'A bite! Reel it in! 🎣' : 'Waiting for a bite… 🎣' };
    if (locked()) return { banner: 'Rowing round the lake 🚣' };
    return {};
  }

  function panel(id: string): FunPanel | null {
    if (id !== 'locks') return null;
    const list = locks();
    return {
      id,
      title: 'Our love locks',
      text: list.length ? list.map((l) => `🔒 ${l.t}  (${new Date(l.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })})`).join('\n') : 'Leave a lock on the railing: your initials, and it stays here, looking over the village.',
      options: [{ id: 'close', label: 'Close' }],
      input: list.length < 30 ? { placeholder: 'Your initials, like A ♥ B', max: 12, send: 'Lock it' } : undefined,
    };
  }

  /** A pick in one of our cards (or the dates card's sandcastle). True when it was ours. */
  function pick(id: string, text: string, panelId: string | null): boolean {
    if (panelId === 'locks' && id === 'send') {
      if (!text) return true;
      const list = locks();
      set(LOCKS_KEY, { list: [...list, { t: text.slice(0, 12), c: list.length % LOCK_COLOURS.length, at: new Date().toISOString() }] });
      h.sound?.play('click', 0.6);
      h.moment(`lock:${Date.now()}`, 'Locked, for always 🔒');
      openPanel(null);
      return true;
    }
    if (id === 'sandcastle') {
      openPanel(null);
      if (h.me.at !== 'beach') {
        h.say('Go down to the beach to build one');
        return true;
      }
      set(CASTLE_KEY, { x: h.me.pos.x + Math.sin(h.me.heading) * 1.2, z: h.me.pos.z + Math.cos(h.me.heading) * 1.2, day: worldDay(h.coupleId), by: meId });
      h.moment(`castle:${Date.now()}`, 'A sandcastle! 🏰', partnerHere());
      return true;
    }
    return false;
  }

  const { day, taken, total } = shellState();
  const c = castle();
  const scene: ReactNode = (
    <>
      <Boat ride={ride} />
      {shellsOn(day).map(([x, z], i) => (taken.includes(i) ? null : <Shell key={i} x={x} z={z} i={i} />))}
      {total > 0 ? <ShellJar n={total} /> : null}
      {c ? <Sandcastle x={c.x} z={c.z} /> : null}
      <Waves />
      {h.night ? <Lanterns /> : null}
      <Locks list={locks()} />
    </>
  );

  return { focus, frame, panel, pick, seat, seatExit, locked, scene };
}

export type Outdoors = ReturnType<typeof useOutdoors>;

// ------------------------------------------------------------------ drawing

const box = new THREE.BoxGeometry(1, 1, 1);
const cone = new THREE.ConeGeometry(1, 1, 10);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);

/** The rowing boat: a wooden hull with two thwarts and oars. */
function Boat({ ride }: { ride: () => number | null }) {
  const g = useRef<THREE.Group>(null);
  const oars = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const s = ride();
    const b = boatAt(s ?? 0);
    g.current.position.set(b.x, LAKE.surface + Math.sin(clock.elapsedTime * 1.3) * 0.02, b.z);
    g.current.rotation.y = b.h;
    g.current.rotation.z = Math.sin(clock.elapsedTime * 0.9) * 0.02;
    if (oars.current) oars.current.rotation.x = s !== null ? Math.sin(clock.elapsedTime * 2.2) * 0.5 : 0;
  });
  const wood = colour('#8B5A33');
  const dark = colour('#5A3A24');
  return (
    <group ref={g}>
      <mesh geometry={box} material={wood} position={[0, 0.05, 0]} scale={[1.0, 0.1, 2.6]} />
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} geometry={box} material={wood} position={[x, 0.22, 0]} scale={[0.06, 0.36, 2.5]} />
      ))}
      <mesh geometry={box} material={wood} position={[0, 0.22, 1.28]} scale={[1.0, 0.36, 0.06]} />
      <mesh geometry={box} material={wood} position={[0, 0.22, -1.28]} scale={[1.0, 0.36, 0.06]} />
      <mesh geometry={cone} material={wood} position={[0, 0.2, 1.55]} rotation={[Math.PI / 2, 0, 0]} scale={[0.5, 0.5, 0.18]} />
      {[0.55, -0.55].map((z) => (
        <mesh key={z} geometry={box} material={dark} position={[0, 0.3, z]} scale={[1.0, 0.05, 0.3]} />
      ))}
      <group ref={oars} position={[0, 0.36, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={box} material={dark} position={[s * 0.85, 0, 0]} rotation={[0, 0, s * 0.35]} scale={[1.2, 0.04, 0.08]} />
        ))}
      </group>
    </group>
  );
}

function Shell({ x, z, i }: { x: number; z: number; i: number }) {
  return <mesh geometry={funSphere} material={colour(i % 2 ? '#F7D9E3' : '#FFF6DD')} position={[x, 0.03, z]} rotation={[0, i, 0]} scale={[0.07, 0.03, 0.05]} />;
}

/** The shells we've found, in a jar on the coffee table at home. */
function ShellJar({ n }: { n: number }) {
  const shown = Math.min(n, 24);
  return (
    <group position={[-3.35, 0.43, 0.25]}>
      <mesh geometry={cyl} material={colour('#D8EEF2')} position={[0, 0.11, 0]} scale={[0.07, 0.22, 0.07]} />
      {Array.from({ length: shown }, (_, k) => (
        <mesh key={k} geometry={funSphere} material={colour(k % 3 ? '#F7D9E3' : '#FFF6DD')} position={[Math.sin(k * 2.4) * 0.04, 0.02 + k * 0.008, Math.cos(k * 2.4) * 0.04]} scale={[0.022, 0.012, 0.018]} />
      ))}
    </group>
  );
}

function Sandcastle({ x, z }: { x: number; z: number }) {
  const sand = colour('#E2C99A');
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={box} material={sand} position={[0, 0.12, 0]} scale={[0.7, 0.24, 0.7]} />
      {[[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].map(([dx, dz]) => (
        <group key={`${dx}${dz}`} position={[dx!, 0, dz!]}>
          <mesh geometry={cyl} material={sand} position={[0, 0.2, 0]} scale={[0.1, 0.4, 0.1]} />
          <mesh geometry={cone} material={sand} position={[0, 0.48, 0]} scale={[0.12, 0.16, 0.12]} />
        </group>
      ))}
      <mesh geometry={cyl} material={sand} position={[0, 0.38, 0]} scale={[0.14, 0.28, 0.14]} />
      <mesh geometry={cone} material={sand} position={[0, 0.6, 0]} scale={[0.16, 0.18, 0.16]} />
      <FunBall at={[0, 0.72, 0]} r={0.03} c="#E84A6F" />
    </group>
  );
}

/** Foam lapping the shore. */
function Waves() {
  const m = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.5, depthWrite: false }), []);
  useFrame(({ clock }) => {
    if (!m.current) return;
    const t = clock.elapsedTime;
    m.current.position.z = 97.6 + Math.sin(t * 0.8) * 0.45;
    mat.opacity = 0.25 + (Math.sin(t * 0.8) * 0.5 + 0.5) * 0.35;
  });
  return <mesh ref={m} geometry={box} material={mat} position={[5, -0.05, 97.6]} scale={[72, 0.01, 0.5]} />;
}

/** Paper lanterns floating on the lake at night. */
function Lanterns() {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    g.current?.children.forEach((c, i) => {
      const a = i * 1.7 + t * 0.02;
      c.position.set(LAKE.loop.x + Math.cos(a) * (6 + (i % 4) * 3), LAKE.surface + 0.12 + Math.sin(t * 1.4 + i) * 0.02, LAKE.loop.z + Math.sin(a * 1.3) * (4 + (i % 3) * 2.5));
    });
  });
  return (
    <group ref={g}>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} geometry={box} material={colour(i % 3 ? '#FFB43A' : '#FF8A3D', true)} scale={[0.16, 0.2, 0.16]} />
      ))}
    </group>
  );
}

/** Our locks on the hill's railing, in the colours we got. */
function Locks({ list }: { list: { t: string; c: number }[] }) {
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    for (const [za, zb] of HILL.railing.spans) for (let z = za + 0.3; z < zb - 0.2; z += 0.45) out.push([z, out.length % 2 ? 6.5 : 6.95]);
    return out;
  }, []);
  return (
    <>
      {list.slice(0, spots.length).map((l, i) => (
        <mesh key={i} geometry={box} material={colour(LOCK_COLOURS[l.c % LOCK_COLOURS.length]!)} position={[HILL.railing.x - 0.05, spots[i]![1], spots[i]![0]]} scale={[0.05, 0.09, 0.07]} />
      ))}
    </>
  );
}
