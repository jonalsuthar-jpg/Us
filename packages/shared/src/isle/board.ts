/**
 * The island's shape: 19 land hexes in rings around the middle, their 54
 * corners (where towns go) and 72 sides (where roads go), worked out once.
 * Every game then shuffles what's on it: the land, the numbers and the
 * harbours (generateBoard), with a few rules so no board is lopsided.
 *
 * Hexes are pointy-topped, one unit from centre to corner; x runs right and
 * y runs down the board, which the 3D scene lays flat on the table.
 */

import { mulberry32, shuffled } from '../rng';

export type Res = 'wood' | 'brick' | 'wool' | 'grain' | 'ore';
export type Terrain = Res | 'desert';
export type PortKind = Res | 'any';

export const RESOURCES: readonly Res[] = ['wood', 'brick', 'wool', 'grain', 'ore'];

export interface Hex {
  q: number;
  r: number;
  x: number;
  y: number;
  /** Its six corners, clockwise from the top. */
  verts: number[];
  /** Its six sides, the same way round (side i joins corners i and i+1). */
  edges: number[];
  /** The land hexes next to it. */
  near: number[];
}

export interface Vert {
  x: number;
  y: number;
  hexes: number[];
  /** Corners one side away. */
  near: number[];
  edges: number[];
}

export interface Edge {
  /** Its two corners. */
  v: [number, number];
  x: number;
  y: number;
  /** Which way it runs, in radians, for laying a road on it. */
  angle: number;
  hexes: number[];
}

export interface Topology {
  hexes: Hex[];
  verts: Vert[];
  edges: Edge[];
  /** The 30 sides on the shore, in order round the island from the east. */
  coast: number[];
}

function buildTopology(): Topology {
  const hexes: Hex[] = [];
  const verts: Vert[] = [];
  const edges: Edge[] = [];
  const vertAt = new Map<string, number>();
  const edgeAt = new Map<string, number>();
  const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;

  for (let r = -2; r <= 2; r++) {
    for (let q = -2; q <= 2; q++) {
      if (Math.abs(q + r) > 2) continue;
      const x = Math.sqrt(3) * (q + r / 2);
      const y = 1.5 * r;
      const h = hexes.length;
      const hex: Hex = { q, r, x, y, verts: [], edges: [], near: [] };
      for (let i = 0; i < 6; i++) {
        const a = ((60 * i - 90) * Math.PI) / 180;
        const vx = x + Math.cos(a);
        const vy = y + Math.sin(a);
        const k = key(vx, vy);
        let v = vertAt.get(k);
        if (v === undefined) {
          v = verts.length;
          vertAt.set(k, v);
          verts.push({ x: vx, y: vy, hexes: [], near: [], edges: [] });
        }
        verts[v]!.hexes.push(h);
        hex.verts.push(v);
      }
      for (let i = 0; i < 6; i++) {
        const a = hex.verts[i]!;
        const b = hex.verts[(i + 1) % 6]!;
        const k = a < b ? `${a}-${b}` : `${b}-${a}`;
        let e = edgeAt.get(k);
        if (e === undefined) {
          e = edges.length;
          edgeAt.set(k, e);
          const va = verts[a]!;
          const vb = verts[b]!;
          edges.push({
            v: a < b ? [a, b] : [b, a],
            x: (va.x + vb.x) / 2,
            y: (va.y + vb.y) / 2,
            angle: Math.atan2(vb.y - va.y, vb.x - va.x),
            hexes: [],
          });
          va.near.push(b);
          vb.near.push(a);
          va.edges.push(e);
          vb.edges.push(e);
        }
        edges[e]!.hexes.push(h);
        hex.edges.push(e);
      }
      hexes.push(hex);
    }
  }
  for (const hex of hexes) {
    hex.near = hexes.flatMap((o, i) =>
      Math.max(Math.abs(o.q - hex.q), Math.abs(o.r - hex.r), Math.abs(o.q + o.r - hex.q - hex.r)) === 1 ? [i] : [],
    );
  }
  const coast = edges
    .flatMap((e, i) => (e.hexes.length === 1 ? [i] : []))
    .sort((a, b) => angleOf(edges[a]!) - angleOf(edges[b]!));
  return { hexes, verts, edges, coast };
}

const angleOf = (e: { x: number; y: number }) => (Math.atan2(e.y, e.x) + 2 * Math.PI) % (2 * Math.PI);

export const TOPOLOGY: Topology = buildTopology();

/** Dots under each number: how many of the 36 dice throws make it. */
export const PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export const TERRAIN_BAG: readonly Terrain[] = [
  ...Array<Terrain>(4).fill('wood'),
  ...Array<Terrain>(3).fill('brick'),
  ...Array<Terrain>(4).fill('wool'),
  ...Array<Terrain>(4).fill('grain'),
  ...Array<Terrain>(3).fill('ore'),
  'desert',
];
export const NUMBER_BAG: readonly number[] = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
export const PORT_BAG: readonly PortKind[] = ['any', 'any', 'any', 'any', 'wood', 'brick', 'wool', 'grain', 'ore'];
/** Where the 9 harbours sit along the 30 shore sides: gaps of 3, 3, 4 all round. */
const PORT_SPOTS = [0, 3, 6, 10, 13, 16, 20, 23, 26];

export interface Port {
  edge: number;
  kind: PortKind;
}

export interface Board {
  terrain: Terrain[];
  /** The number on each hex; null for the desert. */
  numbers: (number | null)[];
  ports: Port[];
}

/** How many dots a corner touches: a quick measure of how rich it is. */
export function vertPips(board: Board, v: number): number {
  return TOPOLOGY.verts[v]!.hexes.reduce((sum, h) => sum + (PIPS[board.numbers[h] ?? 0] ?? 0), 0);
}

/** Why a board isn't fair, or null when it's fine. */
export function boardProblem(board: Board): string | null {
  const { hexes } = TOPOLOGY;
  for (let h = 0; h < hexes.length; h++) {
    const n = board.numbers[h];
    if (n == null) continue;
    for (const o of hexes[h]!.near) {
      const m = board.numbers[o];
      if (m == null) continue;
      if (m === n) return 'same number side by side';
      if ((n === 6 || n === 8) && (m === 6 || m === 8)) return 'red numbers side by side';
    }
  }
  for (let v = 0; v < TOPOLOGY.verts.length; v++) {
    if (vertPips(board, v) > 12) return 'one corner too rich';
  }
  for (const res of RESOURCES) {
    const tiles = hexes.flatMap((_, h) => (board.terrain[h] === res ? [h] : []));
    const pips = tiles.reduce((sum, h) => sum + PIPS[board.numbers[h]!]!, 0);
    const each = pips / tiles.length;
    if (each < 2.4 || each > 4.2) return `${res} too ${each < 2.4 ? 'poor' : 'rich'}`;
    // Two of the same land side by side is fine; a clump of three or more is not.
    if (tiles.some((h) => hexes[h]!.near.filter((o) => board.terrain[o] === res).length >= 2)) return `${res} clumped`;
  }
  return null;
}

/** Puts the numbers on the land so no two side by side match and the reds stay apart (null if stuck). */
function placeNumbers(terrain: Terrain[], random: () => number): (number | null)[] | null {
  const { hexes } = TOPOLOGY;
  const nums: (number | null)[] = terrain.map(() => null);
  const land = shuffled(
    hexes.flatMap((_, h) => (terrain[h] === 'desert' ? [] : [h])),
    random,
  );
  const left = new Map<number, number>();
  for (const n of NUMBER_BAG) left.set(n, (left.get(n) ?? 0) + 1);
  const red = (n: number) => n === 6 || n === 8;
  let steps = 0;
  const place = (i: number): boolean => {
    if (i === land.length) return true;
    if (++steps > 5000) return false;
    const h = land[i]!;
    for (const n of shuffled([...left.keys()], random)) {
      if (!left.get(n)) continue;
      const clash = hexes[h]!.near.some((o) => {
        const m = nums[o];
        return m != null && (m === n || (red(m) && red(n)));
      });
      if (clash) continue;
      nums[h] = n;
      left.set(n, left.get(n)! - 1);
      if (place(i + 1)) return true;
      nums[h] = null;
      left.set(n, left.get(n)! + 1);
    }
    return false;
  };
  return place(0) ? nums : null;
}

/** A fresh, fair island from the seed: the same seed gives the same island. */
export function generateBoard(seed: number): Board {
  const random = mulberry32(seed);
  for (let tries = 0; ; tries++) {
    const terrain = shuffled(TERRAIN_BAG, random);
    const numbers = placeNumbers(terrain, random);
    if (!numbers) continue;
    const kinds = shuffled(PORT_BAG, random);
    const turn = Math.floor(random() * TOPOLOGY.coast.length);
    const ports = PORT_SPOTS.map((spot, i) => ({
      edge: TOPOLOGY.coast[(spot + turn) % TOPOLOGY.coast.length]!,
      kind: kinds[i]!,
    }));
    const board: Board = { terrain, numbers, ports };
    // A fair board turns up within a few tries; after that take what comes.
    if (!boardProblem(board) || tries > 2000) return board;
  }
}
