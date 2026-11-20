import { createContext, useContext, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { FLOOR_H, HOUSE, POOL, STAIRS, WALL_T } from '../layout';
import type { Materials } from './materials';

/**
 * The house, built from boxes for now. Phase 1 swaps this for a modelled,
 * light-baked GLB with the same layout (layout.ts), so where you can walk
 * doesn't change.
 *
 * Three groups the camera rig hides or cuts open (see rig.ts):
 *   ground   always shown
 *   upper    hidden while you're downstairs inside
 *   roof     hidden while you're inside at all
 * Exterior walls carry userData.cut = outward normal, so the wall between
 * the camera and you drops to a low strip.
 */

interface Kit {
  mats: Materials;
  box: THREE.BoxGeometry;
}
const KitContext = createContext<Kit | null>(null);
const useKit = () => useContext(KitContext)!;

type V3 = [number, number, number];
type MatKey = Exclude<keyof Materials, 'dispose'>;

/** A box from corner a to corner b. */
function B({ a, b, m }: { a: V3; b: V3; m: MatKey }) {
  const { mats, box } = useKit();
  return (
    <mesh
      geometry={box}
      material={mats[m]}
      position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]}
      scale={[Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])]}
    />
  );
}

interface Opening {
  /** Along the wall from its start, metres. */
  a: number;
  b: number;
  bottom: number;
  top: number;
}

/**
 * A wall from (x0, z0) to (x1, z1) standing on y, with door and window
 * holes. Windows get glass; a hole that reaches the floor is a door.
 */
function Wall({ x0, z0, x1, z1, y, h = FLOOR_H, holes = [], cut, m = 'plaster' }: { x0: number; z0: number; x1: number; z1: number; y: number; h?: number; holes?: Opening[]; cut?: [number, number]; m?: MatKey }) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const angle = -Math.atan2(z1 - z0, x1 - x0);
  const t = WALL_T / 2;
  const sorted = [...holes].sort((p, q) => p.a - q.a);
  const parts: ReactNode[] = [];
  let at = 0;
  sorted.forEach((o, i) => {
    if (o.a > at) parts.push(<B key={`s${i}`} a={[at, 0, -t]} b={[o.a, h, t]} m={m} />);
    if (o.bottom > 0) parts.push(<B key={`l${i}`} a={[o.a, 0, -t]} b={[o.b, o.bottom, t]} m={m} />);
    if (o.top < h) parts.push(<B key={`u${i}`} a={[o.a, o.top, -t]} b={[o.b, h, t]} m={m} />);
    if (o.bottom > 0) {
      parts.push(<B key={`g${i}`} a={[o.a, o.bottom, -0.02]} b={[o.b, o.top, 0.02]} m="glass" />);
      parts.push(<B key={`f${i}`} a={[o.a - 0.05, o.bottom - 0.06, -t - 0.04]} b={[o.b + 0.05, o.bottom, t + 0.04]} m="trim" />);
    }
    at = o.b;
  });
  if (at < len) parts.push(<B key="end" a={[at, 0, -t]} b={[len, h, t]} m={m} />);
  return (
    <group position={[x0, y, z0]} rotation={[0, angle, 0]} userData={cut ? { cut } : undefined}>
      {parts}
    </group>
  );
}

const W = (a: number, b: number, bottom = 0.9, top = 2.2): Opening => ({ a, b, bottom, top });
const DOOR = (a: number, b: number, top = 2.2): Opening => ({ a, b, bottom: 0, top });

function Floor({ y, upper }: { y: number; upper: boolean }) {
  const { x0, x1, z0, z1 } = HOUSE;
  return (
    <>
      {/* South, north, west, east. */}
      <Wall x0={x0} z0={z1} x1={x1} z1={z1} y={y} cut={[0, 1]} holes={upper ? [W(1.9, 3.1, 0, 2.3), W(4.5, 6.3), W(8.5, 10.5)] : [W(0.6, 1.8), DOOR(2.4, 3.6), W(4.4, 6.4, 0.5, 2.4), W(8, 10.5, 1.0)]} />
      <Wall x0={x1} z0={z0} x1={x0} z1={z0} y={y} cut={[0, -1]} holes={upper ? [W(2, 3.5), W(8.5, 10, 1.0)] : [W(8, 10)]} />
      <Wall x0={x0} z0={z0} x1={x0} z1={z1} y={y} cut={[-1, 0]} holes={[W(3, 5)]} m="plasterWarm" />
      <Wall x0={x1} z0={z1} x1={x1} z1={z0} y={y} cut={[1, 0]} holes={[W(1.5, 3.5, 1.1)]} m="plasterWarm" />
      {/* Between the two rooms, with a doorway. */}
      <Wall x0={1} z0={z0} x1={1} z1={z1} y={y} holes={[DOOR(4.1, 5.1)]} />
    </>
  );
}

function Stairs() {
  const run = (STAIRS.x1 - STAIRS.x0) / STAIRS.steps;
  const rise = FLOOR_H / STAIRS.steps;
  return (
    <>
      {Array.from({ length: STAIRS.steps }, (_, i) => (
        <B key={i} a={[STAIRS.x0 + i * run, 0, STAIRS.z0 - 0.05]} b={[STAIRS.x0 + (i + 1) * run, (i + 1) * rise, STAIRS.z1 + 0.05]} m="wood" />
      ))}
      {/* Handrail on the open side. */}
      <group>
        {Array.from({ length: 5 }, (_, i) => {
          const x = STAIRS.x0 + 0.2 + i * 0.8;
          const y = ((x - STAIRS.x0) / (STAIRS.x1 - STAIRS.x0)) * FLOOR_H;
          return <B key={i} a={[x - 0.03, y, STAIRS.z1 + 0.02]} b={[x + 0.03, y + 0.95, STAIRS.z1 + 0.08]} m="woodDark" />;
        })}
      </group>
    </>
  );
}

function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  const { mats } = useKit();
  const geo = useMemo(() => ({ trunk: new THREE.CylinderGeometry(0.14, 0.2, 1, 8), crown: new THREE.IcosahedronGeometry(1, 1) }), []);
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh geometry={geo.trunk} material={mats.bark} position={[0, 1.1, 0]} scale={[1, 2.2, 1]} />
      <mesh geometry={geo.crown} material={mats.leaves} position={[0, 2.9, 0]} scale={[1.5, 1.3, 1.5]} />
      <mesh geometry={geo.crown} material={mats.leavesLight} position={[0.5, 3.6, 0.3]} scale={0.9} />
    </group>
  );
}

function Living() {
  return (
    <>
      <B a={[-4.6, 0.001, -1.6]} b={[-1.0, 0.012, 1.6]} m="rug" />
      {/* Sofa, facing the TV on the west wall. */}
      <B a={[-2.0, 0.1, -1.1]} b={[-1.05, 0.45, 1.1]} m="fabric" />
      <B a={[-1.3, 0.45, -1.1]} b={[-1.05, 0.95, 1.1]} m="fabric" />
      <B a={[-2.0, 0.1, -1.3]} b={[-1.05, 0.7, -1.1]} m="fabric" />
      <B a={[-2.0, 0.1, 1.1]} b={[-1.05, 0.7, 1.3]} m="fabric" />
      <B a={[-1.95, 0.45, -1.0]} b={[-1.35, 0.58, -0.02]} m="cushion" />
      <B a={[-1.95, 0.45, 0.02]} b={[-1.35, 0.58, 1.0]} m="cushion" />
      <B a={[-3.3, 0.38, -0.55]} b={[-2.6, 0.43, 0.55]} m="wood" />
      <B a={[-3.25, 0, -0.5]} b={[-2.65, 0.38, 0.5]} m="woodDark" />
      {/* TV. */}
      <B a={[-5.8, 0, -1.1]} b={[-5.35, 0.5, 1.1]} m="woodDark" />
      <B a={[-5.75, 0.8, -0.95]} b={[-5.66, 1.75, 0.95]} m="black" />
      <B a={[-5.66, 0.85, -0.9]} b={[-5.655, 1.7, 0.9]} m="screen" />
      {/* Floor lamp and a plant. */}
      <B a={[-0.65, 0, -3.25]} b={[-0.55, 1.5, -3.15]} m="metal" />
      <B a={[-0.85, 1.5, -3.45]} b={[-0.35, 1.85, -2.95]} m="lamp" />
      <B a={[0.15, 0, 3.15]} b={[0.65, 0.45, 3.65]} m="potTerracotta" />
      <B a={[0.1, 0.45, 3.1]} b={[0.7, 1.3, 3.7]} m="leaves" />
      {/* Bookshelf. */}
      <B a={[-5.6, 0, -3.8]} b={[-4.2, 1.9, -3.4]} m="wood" />
    </>
  );
}

function Kitchen() {
  return (
    <>
      <B a={[1.0, 0.001, -4]} b={[6, 0.006, 4]} m="tile" />
      <B a={[5.2, 0, -1.8]} b={[5.8, 0.86, 2.8]} m="woodDark" />
      <B a={[5.15, 0.86, -1.85]} b={[5.85, 0.92, 2.85]} m="counter" />
      <B a={[5.1, 0, -2.65]} b={[5.85, 2.0, -1.9]} m="fridge" />
      {/* Table for two, and two more chairs. */}
      <B a={[2.4, 0.72, 0.8]} b={[3.8, 0.78, 2.4]} m="wood" />
      <B a={[2.5, 0, 0.9]} b={[2.58, 0.72, 0.98]} m="woodDark" />
      <B a={[3.62, 0, 0.9]} b={[3.7, 0.72, 0.98]} m="woodDark" />
      <B a={[2.5, 0, 2.22]} b={[2.58, 0.72, 2.3]} m="woodDark" />
      <B a={[3.62, 0, 2.22]} b={[3.7, 0.72, 2.3]} m="woodDark" />
      {[1.25, 1.95].map((z) => (
        <group key={z}>
          <B a={[1.85, 0.42, z - 0.22]} b={[2.25, 0.47, z + 0.22]} m="wood" />
          <B a={[1.85, 0, z - 0.2]} b={[1.9, 0.95, z + 0.2]} m="woodDark" />
          <B a={[3.95, 0.42, z - 0.22]} b={[4.35, 0.47, z + 0.22]} m="wood" />
          <B a={[4.3, 0, z - 0.2]} b={[4.35, 0.95, z + 0.2]} m="woodDark" />
        </group>
      ))}
      <B a={[3.0, 2.2, 1.5]} b={[3.2, 2.4, 1.7]} m="lamp" />
      <B a={[3.08, 2.4, 1.58]} b={[3.12, 3.0, 1.62]} m="black" />
    </>
  );
}

function Bedroom({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <B a={[-4.6, 0.001, -1.8]} b={[-1.4, 0.01, 1.8]} m="rug" />
      <B a={[-5.8, 0, -1.0]} b={[-3.6, 0.3, 1.0]} m="wood" />
      <B a={[-5.75, 0.3, -0.95]} b={[-3.65, 0.55, 0.95]} m="bedding" />
      <B a={[-4.6, 0.55, -0.97]} b={[-3.6, 0.6, 0.97]} m="blanket" />
      <B a={[-5.6, 0.55, -0.85]} b={[-5.15, 0.7, -0.1]} m="cushion" />
      <B a={[-5.6, 0.55, 0.1]} b={[-5.15, 0.7, 0.85]} m="cushion" />
      <B a={[-5.82, 0, -1.05]} b={[-5.7, 1.2, 1.05]} m="woodDark" />
      <B a={[-5.8, 0, -1.6]} b={[-5.3, 0.55, -1.1]} m="wood" />
      <B a={[-5.8, 0, 1.1]} b={[-5.3, 0.55, 1.6]} m="wood" />
      <B a={[-5.65, 0.55, -1.45]} b={[-5.45, 0.85, -1.25]} m="lamp" />
      <B a={[-2.6, 0, -3.8]} b={[-0.4, 2.1, -3.2]} m="woodDark" />
      {/* Landing: a desk and a plant. */}
      <B a={[4.9, 0.72, 0.9]} b={[5.8, 0.77, 2.6]} m="wood" />
      <B a={[4.95, 0, 0.95]} b={[5.75, 0.72, 1.0]} m="woodDark" />
      <B a={[4.95, 0, 2.5]} b={[5.75, 0.72, 2.55]} m="woodDark" />
      <B a={[1.4, 0, 3.2]} b={[1.85, 0.4, 3.65]} m="potTerracotta" />
      <B a={[1.35, 0.4, 3.15]} b={[1.9, 1.2, 3.7]} m="leavesLight" />
      {/* Railing round the stairwell. */}
      <B a={[STAIRS.x0, 0, -2.78]} b={[STAIRS.x1, 1.0, -2.72]} m="glass" />
      <B a={[STAIRS.x0, 1.0, -2.8]} b={[STAIRS.x1, 1.05, -2.7]} m="woodDark" />
    </group>
  );
}

function Balcony({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <B a={[-6, -0.2, 4]} b={[-1, 0, 5.8]} m="stone" />
      <B a={[-6, 0, 5.72]} b={[-1, 1.0, 5.78]} m="glass" />
      <B a={[-6, 0, 4.1]} b={[-5.94, 1.0, 5.78]} m="glass" />
      <B a={[-1.06, 0, 4.1]} b={[-1, 1.0, 5.78]} m="glass" />
      <B a={[-6.02, 1.0, 5.7]} b={[-0.98, 1.05, 5.8]} m="metal" />
      <B a={[-3.0, 0.45, 4.7]} b={[-2.4, 0.5, 5.3]} m="metal" />
      <B a={[-2.75, 0, 4.95]} b={[-2.65, 0.45, 5.05]} m="metal" />
      <B a={[-4.0, 0.4, 4.7]} b={[-3.4, 0.45, 5.3]} m="fabricWarm" />
      <B a={[-2.0, 0.4, 4.7]} b={[-1.4, 0.45, 5.3]} m="fabricWarm" />
    </group>
  );
}

function Roof() {
  const { mats } = useKit();
  const geo = useMemo(() => {
    const rise = 1.9;
    const shape = new THREE.Shape([new THREE.Vector2(-4.1, 0), new THREE.Vector2(4.1, 0), new THREE.Vector2(0, rise)]);
    return new THREE.ExtrudeGeometry(shape, { depth: WALL_T, bevelEnabled: false });
  }, []);
  const top = FLOOR_H * 2;
  const eave = 4.6;
  const ridge = top + 2.0;
  const angle = Math.atan2(ridge - (top - 0.15), eave);
  const slope = Math.hypot(eave, ridge - (top - 0.15));
  return (
    <>
      <mesh geometry={geo} material={mats.plaster} position={[HOUSE.x0 - 0.1, top, 0]} rotation={[0, Math.PI / 2, 0]} />
      <mesh geometry={geo} material={mats.plaster} position={[HOUSE.x1 - 0.1, top, 0]} rotation={[0, Math.PI / 2, 0]} />
      {[1, -1].map((side) => (
        <group key={side} position={[0, (ridge + top - 0.15) / 2, (side * eave) / 2]} rotation={[side * angle, 0, 0]}>
          <B a={[-6.5, -0.08, -slope / 2 - 0.05]} b={[6.5, 0.08, slope / 2 + 0.05]} m="roof" />
          <B a={[-6.55, -0.12, side * (slope / 2) - 0.06]} b={[6.55, 0.1, side * (slope / 2) + 0.06]} m="roofEdge" />
        </group>
      ))}
      <B a={[-6.55, ridge - 0.05, -0.12]} b={[6.55, ridge + 0.12, 0.12]} m="roofEdge" />
      <B a={[-4.4, top + 0.6, -1.9]} b={[-3.6, ridge + 0.9, -1.1]} m="stone" />
    </>
  );
}

function Garden() {
  const p = POOL;
  return (
    <>
      {/* Grass around the pool deck, and the deck around the pool. */}
      <B a={[-16, -0.2, -8]} b={[16, -0.02, 5.8]} m="grass" />
      <B a={[-16, -0.2, 5.8]} b={[0.8, -0.02, 12.2]} m="grass" />
      <B a={[9.2, -0.2, 5.8]} b={[16, -0.02, 12.2]} m="grass" />
      <B a={[-16, -0.2, 12.2]} b={[16, -0.02, 16]} m="grass" />
      <B a={[0.8, -0.2, 5.8]} b={[9.2, 0.02, p.z0]} m="stone" />
      <B a={[0.8, -0.2, p.z1]} b={[9.2, 0.02, 12.2]} m="stone" />
      <B a={[0.8, -0.2, p.z0]} b={[p.x0, 0.02, p.z1]} m="stone" />
      <B a={[p.x1, -0.2, p.z0]} b={[9.2, 0.02, p.z1]} m="stone" />
      {/* The pool: tiled basin, steps on the west side, water. */}
      <B a={[p.x0, -p.depth - 0.1, p.z0]} b={[p.x1, -p.depth, p.z1]} m="poolTile" />
      <B a={[p.x0, -p.depth, p.z0]} b={[p.x1, -0.2, p.z0 + 0.05]} m="poolTile" />
      <B a={[p.x0, -p.depth, p.z1 - 0.05]} b={[p.x1, -0.2, p.z1]} m="poolTile" />
      <B a={[p.x1 - 0.05, -p.depth, p.z0]} b={[p.x1, -0.2, p.z1]} m="poolTile" />
      <B a={[p.x0, -p.depth, p.z0]} b={[p.x0 + 0.05, -0.2, p.z1]} m="poolTile" />
      {[0, 1, 2].map((i) => (
        <B key={i} a={[p.x0, -p.depth, 8.4]} b={[p.x0 + 0.3 * (i + 1), -0.35 - i * 0.3, 9.6]} m="poolTile" />
      ))}
      <B a={[p.x0 + 0.02, -0.2, p.z0 + 0.02]} b={[p.x1 - 0.02, -0.15, p.z1 - 0.02]} m="water" />
      {/* Path from the door to the deck. */}
      {[4.5, 5.2].map((z) => (
        <B key={z} a={[-3.45, -0.02, z]} b={[-2.55, 0.015, z + 0.5]} m="path" />
      ))}
      {[-2.4, -1.4, -0.4].map((x) => (
        <B key={x} a={[x, -0.02, 5.95]} b={[x + 0.6, 0.015, 6.55]} m="path" />
      ))}
      {/* Porch posts under the balcony, and the front step. */}
      <B a={[-5.95, 0, 5.55]} b={[-5.75, 2.8, 5.75]} m="trim" />
      <B a={[-1.25, 0, 5.55]} b={[-1.05, 2.8, 5.75]} m="trim" />
      <B a={[-3.8, 0, 4.0]} b={[-2.2, 0.06, 4.45]} m="stone" />
      {/* Loungers and an umbrella. */}
      {[3.2, 5.0].map((x) => (
        <group key={x}>
          <B a={[x, 0.25, 11.35]} b={[x + 0.7, 0.32, 12.1]} m="lounger" />
          <B a={[x, 0.32, 11.3]} b={[x + 0.7, 0.75, 11.42]} m="lounger" />
        </group>
      ))}
      <B a={[7.15, 0, 11.65]} b={[7.25, 2.3, 11.75]} m="metal" />
      <B a={[6.2, 2.3, 10.7]} b={[8.2, 2.42, 12.7]} m="umbrella" />
      {/* Hedges round the garden, and trees. */}
      <B a={[-15.5, 0, 15]} b={[15.5, 1.1, 15.8]} m="hedge" />
      <B a={[-15.8, 0, -7.5]} b={[-15, 1.1, 15.8]} m="hedge" />
      <B a={[15, 0, -7.5]} b={[15.8, 1.1, 15.8]} m="hedge" />
      <B a={[-15.5, 0, -7.8]} b={[15.5, 1.1, -7]} m="hedge" />
      <Tree x={-10} z={9} />
      <Tree x={-12} z={-3} s={1.2} />
      <Tree x={11} z={-4} s={1.1} />
      <Tree x={12} z={13} s={0.9} />
      <Tree x={-8} z={13} s={1.05} />
      {[-8, -6.5].map((x) => (
        <group key={x}>
          <B a={[x, 0, 7.8]} b={[x + 0.5, 0.4, 8.3]} m="potTerracotta" />
          <B a={[x - 0.05, 0.4, 7.75]} b={[x + 0.55, 1.0, 8.35]} m="leavesLight" />
        </group>
      ))}
    </>
  );
}

export interface HouseGroups {
  upper: THREE.Group | null;
  roof: THREE.Group | null;
  ground: THREE.Group | null;
}

/** The whole place. The rig gets the three groups through refs. */
export function HouseModel({ mats, groups }: { mats: Materials; groups: HouseGroups }) {
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const kit = useMemo(() => ({ mats, box }), [mats, box]);
  return (
    <KitContext.Provider value={kit}>
      <group ref={(g) => void (groups.ground = g)}>
        <B a={[HOUSE.x0, -0.15, HOUSE.z0]} b={[HOUSE.x1, 0, HOUSE.z1]} m="wood" />
        <Floor y={0} upper={false} />
        <Stairs />
        <Living />
        <Kitchen />
        <Garden />
      </group>
      <group ref={(g) => void (groups.upper = g)}>
        <B a={[HOUSE.x0, FLOOR_H - 0.15, -2.7]} b={[HOUSE.x1, FLOOR_H, HOUSE.z1]} m="wood" />
        <B a={[HOUSE.x0, FLOOR_H - 0.15, HOUSE.z0]} b={[STAIRS.x0, FLOOR_H, -2.7]} m="wood" />
        <B a={[STAIRS.x1, FLOOR_H - 0.15, HOUSE.z0]} b={[HOUSE.x1, FLOOR_H, -2.7]} m="wood" />
        <Floor y={FLOOR_H} upper />
        <Bedroom y={FLOOR_H} />
        <Balcony y={FLOOR_H} />
      </group>
      <group ref={(g) => void (groups.roof = g)}>
        <Roof />
      </group>
    </KitContext.Provider>
  );
}
