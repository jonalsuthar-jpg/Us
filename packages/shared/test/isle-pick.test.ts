import { describe, expect, it } from 'vitest';
import { nearestEdge, nearestHex, nearestVert, pickMark, TOPOLOGY } from '../src/isle';

describe('isle taps', () => {
  it('finds the corner, side and hex under a tap', () => {
    const v = TOPOLOGY.verts[20]!;
    expect(nearestVert(v.x + 0.1, v.y - 0.1)).toBe(20);
    const e = TOPOLOGY.edges[30]!;
    expect(nearestEdge(e.x - 0.05, e.y + 0.08)).toBe(30);
    const h = TOPOLOGY.hexes[7]!;
    expect(nearestHex(h.x + 0.3, h.y + 0.2)).toBe(7);
    expect(nearestVert(40, 40)).toBe(-1);
  });

  it('a rough tap still lands on the only spot on offer', () => {
    const v = TOPOLOGY.verts[11]!;
    expect(pickMark({ verts: [11] }, v.x + 0.4, v.y)).toEqual({ kind: 'vert', i: 11 });
    expect(pickMark({ verts: [11] }, v.x + 2, v.y)).toBeNull();
    const h = TOPOLOGY.hexes[3]!;
    expect(pickMark({ hexes: [3, 4] }, h.x, h.y + 0.5)).toEqual({ kind: 'hex', i: 3 });
  });
});
