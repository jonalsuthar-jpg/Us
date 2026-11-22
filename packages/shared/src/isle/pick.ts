/**
 * Which corner, side or hex a tap means, from where it lands on the board
 * (board units: one from a hex's centre to its corner). Taps on a phone are
 * rough, so a spot within reach counts, and when only some spots can be
 * chosen (where a town may go) the nearest of those wins.
 */
import { TOPOLOGY } from './board';

export interface Marks {
  verts?: number[];
  edges?: number[];
  hexes?: number[];
}

export type Picked = { kind: 'vert' | 'edge' | 'hex'; i: number };

const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;

function nearest<T extends { x: number; y: number }>(list: readonly T[], only: number[] | undefined, x: number, y: number, reach: number) {
  let best = -1;
  let top = reach * reach;
  for (const i of only ?? list.map((_, j) => j)) {
    const p = list[i];
    if (!p) continue;
    const d = dist2(p.x, p.y, x, y);
    if (d < top) {
      top = d;
      best = i;
    }
  }
  return best;
}

export const nearestVert = (x: number, y: number, only?: number[], reach = 0.45) =>
  nearest(TOPOLOGY.verts, only, x, y, reach);
export const nearestEdge = (x: number, y: number, only?: number[], reach = 0.4) =>
  nearest(TOPOLOGY.edges, only, x, y, reach);
export const nearestHex = (x: number, y: number, only?: number[], reach = 0.95) =>
  nearest(TOPOLOGY.hexes, only, x, y, reach);

/** The marked spot a tap means, if any: corners first, then sides, then hexes. */
export function pickMark(marks: Marks, x: number, y: number): Picked | null {
  if (marks.verts?.length) {
    const i = nearestVert(x, y, marks.verts, 0.5);
    if (i >= 0) return { kind: 'vert', i };
  }
  if (marks.edges?.length) {
    const i = nearestEdge(x, y, marks.edges, 0.45);
    if (i >= 0) return { kind: 'edge', i };
  }
  if (marks.hexes?.length) {
    const i = nearestHex(x, y, marks.hexes);
    if (i >= 0) return { kind: 'hex', i };
  }
  return null;
}
