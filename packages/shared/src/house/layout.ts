/**
 * Our House: where you can stand, and how to get from one place to another.
 *
 * Metres, y up, +z towards the garden (south). The house is 12 × 8 with two
 * 3 m floors; the stairs climb along the north wall of the kitchen.
 *
 * Every walkable place is a rectangle (a region) at a height, or a ramp for
 * the stairs. Neighbouring regions meet at a portal: a point you pass through
 * (a doorway, the foot of the stairs). A walk is the fewest regions from here
 * to there, through their portals. No physics: furniture doesn't block you.
 *
 * Out through the garden gate, the village (village.ts) adds its own regions:
 * one network, so a walk from the bedroom to the pond is one walk.
 */
import { obstacles, VILLAGE_PORTALS, VILLAGE_REGIONS, type VillageRegionId } from './village';

export const FLOOR_H = 3;
export const WALL_T = 0.2;
export const HOUSE = { x0: -6, x1: 6, z0: -4, z1: 4 } as const;
export const STAIRS = { x0: 1.6, x1: 5.0, z0: -3.8, z1: -2.8, steps: 12 } as const;
export const POOL = { x0: 2, x1: 8, z0: 7, z1: 11, depth: 1.2 } as const;
/** Where your head is when you're swimming: water is up to your shoulders. */
export const SWIM_Y = -1.05;

export type RegionId =
  | 'living' | 'kitchen' | 'stairFoot' | 'stairs' | 'stairHead' | 'landing' | 'bedroom' | 'balcony'
  | 'gardenN' | 'gardenW' | 'gardenE' | 'gardenS' | 'pool'
  | VillageRegionId;

export interface Region {
  id: RegionId;
  x0: number; x1: number; z0: number; z1: number;
  /** 0 ground, 1 upstairs. The garden and pool count as ground. */
  floor: 0 | 1;
  /** Under the roof: being here cuts the house open so you can see in. */
  inside: boolean;
  label: string;
}

export const REGIONS: Region[] = [
  { id: 'living', x0: -5.8, x1: 0.8, z0: -3.8, z1: 3.8, floor: 0, inside: true, label: 'Living room' },
  { id: 'kitchen', x0: 1.2, x1: 5.8, z0: -2.7, z1: 3.8, floor: 0, inside: true, label: 'Kitchen' },
  { id: 'stairFoot', x0: 1.2, x1: 1.6, z0: -3.8, z1: -2.7, floor: 0, inside: true, label: 'Stairs' },
  { id: 'stairs', x0: STAIRS.x0, x1: STAIRS.x1, z0: STAIRS.z0, z1: STAIRS.z1, floor: 0, inside: true, label: 'Stairs' },
  { id: 'stairHead', x0: 5.0, x1: 5.8, z0: -3.8, z1: -2.7, floor: 1, inside: true, label: 'Stairs' },
  { id: 'landing', x0: 1.2, x1: 5.8, z0: -2.7, z1: 3.8, floor: 1, inside: true, label: 'Landing' },
  { id: 'bedroom', x0: -5.8, x1: 0.8, z0: -3.8, z1: 3.8, floor: 1, inside: true, label: 'Bedroom' },
  { id: 'balcony', x0: -5.8, x1: -1.2, z0: 4.2, z1: 5.6, floor: 1, inside: false, label: 'Balcony' },
  { id: 'pool', x0: POOL.x0 + 0.2, x1: POOL.x1 - 0.2, z0: POOL.z0 + 0.2, z1: POOL.z1 - 0.2, floor: 0, inside: false, label: 'Pool' },
  { id: 'gardenN', x0: -14, x1: 14, z0: 4.2, z1: 7, floor: 0, inside: false, label: 'Garden' },
  { id: 'gardenW', x0: -14, x1: 2, z0: 7, z1: 15, floor: 0, inside: false, label: 'Garden' },
  { id: 'gardenE', x0: 8, x1: 14, z0: 7, z1: 15, floor: 0, inside: false, label: 'Garden' },
  { id: 'gardenS', x0: 2, x1: 8, z0: 11, z1: 15, floor: 0, inside: false, label: 'Garden' },
  // The village. (Inside the café isn't 'inside' here: that's the house's own cutaway.)
  ...VILLAGE_REGIONS.map((r): Region => ({ ...r, floor: 0, inside: false })),
];

const byId = new Map(REGIONS.map((r) => [r.id, r]));
export const region = (id: RegionId): Region => byId.get(id)!;

/** [a, b, x, z]: a and b meet at (x, z). */
const PORTALS: [RegionId, RegionId, number, number][] = [
  ['living', 'kitchen', 1.0, 0.6],
  ['kitchen', 'stairFoot', 1.4, -2.7],
  ['stairFoot', 'stairs', 1.6, -3.3],
  ['stairs', 'stairHead', 5.0, -3.3],
  ['stairHead', 'landing', 5.4, -2.7],
  ['landing', 'bedroom', 1.0, 0.6],
  ['bedroom', 'balcony', -3.5, 4.0],
  // The front door.
  ['living', 'gardenN', -3.0, 4.0],
  ['gardenN', 'gardenW', 0, 7],
  ['gardenN', 'gardenE', 10, 7],
  ['gardenW', 'gardenS', 2, 13],
  ['gardenE', 'gardenS', 8, 13],
  // Down the pool steps.
  ['gardenW', 'pool', 2.0, 9.0],
  ...(VILLAGE_PORTALS as [RegionId, RegionId, number, number][]),
];

/** Height of the floor under (x, z) in a region. The stairs are a ramp. */
export function floorY(id: RegionId, x: number): number {
  if (id === 'stairs') return (Math.min(Math.max(x, STAIRS.x0), STAIRS.x1) - STAIRS.x0) / (STAIRS.x1 - STAIRS.x0) * FLOOR_H;
  if (id === 'pool') return SWIM_Y;
  return region(id).floor * FLOOR_H;
}

const within = (r: Region, x: number, z: number, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

/**
 * The floor under (x, y, z): the highest region there whose floor isn't
 * above y. Or null if you can't stand there. A tap on the sofa or a wall
 * finds the floor it stands on, never the one above it.
 */
export function regionAt(x: number, y: number, z: number): Region | null {
  let best: Region | null = null;
  let top = -Infinity;
  for (const r of REGIONS) {
    if (!within(r, x, z)) continue;
    const fy = floorY(r.id, x);
    if (fy <= y + 0.35 && fy > top) {
      top = fy;
      best = r;
    }
  }
  return best;
}

/** Moves (x, z) just inside a region. */
export function clampTo(r: Region, x: number, z: number): [number, number] {
  return [Math.min(Math.max(x, r.x0), r.x1), Math.min(Math.max(z, r.z0), r.z1)];
}

export interface Waypoint {
  x: number;
  z: number;
  /** The region you walk through to get here. */
  via: RegionId;
}

/**
 * The way from one spot to another: portals in order, then the spot. Empty
 * when there's no way (there always is, but a bad region id gets nothing).
 */
export function findPath(from: RegionId, to: { region: RegionId; x: number; z: number }): Waypoint[] {
  const prev = new Map<RegionId, { id: RegionId; x: number; z: number } | null>([[from, null]]);
  const queue: RegionId[] = [from];
  while (queue.length && !prev.has(to.region)) {
    const at = queue.shift()!;
    for (const [a, b, x, z] of PORTALS) {
      const next = a === at ? b : b === at ? a : null;
      if (next && !prev.has(next)) {
        prev.set(next, { id: at, x, z });
        queue.push(next);
      }
    }
  }
  if (!prev.has(to.region)) return [];
  const path: Waypoint[] = [];
  let id = to.region;
  const [tx, tz] = clampTo(region(id), to.x, to.z);
  path.push({ x: tx, z: tz, via: id });
  for (let step = prev.get(id); step; step = prev.get(id)) {
    path.unshift({ x: step.x, z: step.z, via: step.id });
    id = step.id;
  }
  return path;
}

/** How close to a doorway's middle you can be while passing through it. */
export const PORTAL_R = 0.58;

/** Two regions that share an edge, with no wall between. */
function touching(a: RegionId, b: RegionId) {
  const p = region(a);
  const q = region(b);
  return p.x0 <= q.x1 + 0.01 && q.x0 <= p.x1 + 0.01 && p.z0 <= q.z1 + 0.01 && q.z0 <= p.z1 + 0.01;
}

const near = (x: number, z: number, px: number, pz: number, r = PORTAL_R) => (x - px) ** 2 + (z - pz) ** 2 <= r * r;

/** Tree trunks and lamp posts standing where you walk: you go round them. */
export const OBSTACLES = obstacles((x, z) => REGIONS.some((r) => within(r, x, z)));
const blocked = (x: number, z: number) => OBSTACLES.some(([ox, oz, r]) => (x - ox) ** 2 + (z - oz) ** 2 < r * r);

/** The portals out of a region: [neighbour, x, z]. */
export function portalsOf(id: RegionId): [RegionId, number, number][] {
  const out: [RegionId, number, number][] = [];
  for (const [a, b, x, z] of PORTALS) {
    if (a === id) out.push([b, x, z]);
    else if (b === id) out.push([a, x, z]);
  }
  return out;
}

/**
 * One step of free walking (the joystick): from (x, z) in region `at`
 * towards (nx, nz). You stay inside your room, pass through a doorway only
 * near its middle, and slide along a wall rather than stop dead.
 * Returns where you end up and which region that is.
 */
export function walkStep(at: RegionId, x: number, z: number, nx: number, nz: number): { at: RegionId; x: number; z: number } {
  const ok = (tx: number, tz: number): RegionId | null => {
    // Into a trunk or a post (unless already in one: then out is fine).
    if (blocked(tx, tz) && !blocked(x, z)) return null;
    if (within(region(at), tx, tz)) return at;
    for (const [next, px, pz] of portalsOf(at)) {
      // In the doorway itself you're still where you came from.
      if (near(tx, tz, px, pz)) return at;
      if (!within(region(next), tx, tz)) continue;
      // Regions that touch (the garden, the stairs) are open between them;
      // past a wall you need the doorway.
      if (near(x, z, px, pz, PORTAL_R + 0.25) || touching(at, next)) return next;
    }
    return null;
  };
  const full = ok(nx, nz);
  if (full) return { at: full, x: nx, z: nz };
  const alongX = ok(nx, z);
  if (alongX) return { at: alongX, x: nx, z };
  const alongZ = ok(x, nz);
  if (alongZ) return { at: alongZ, x, z: nz };
  return { at, x, z };
}

/** Where you start: on the front path, facing the door. */
export const SPAWN = { x: -3, z: 6.2, region: 'gardenN' as RegionId };
