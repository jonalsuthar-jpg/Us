import { describe, expect, it } from 'vitest';
import { findPath, OBSTACLES, region, regionAt, REGIONS, walkStep, type RegionId } from '../src/house/layout';
import { BENCHES, BUILDINGS, CAFE_TABLES, FOUNTAIN, LAMPS, POND, TREES, VILLAGE_PORTALS, VILLAGE_REGIONS, ZONES } from '../src/house/village';

const inRect = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

describe('the village: walking', () => {
  it('finds a way from the bedroom to the far side of the pond', () => {
    const path = findPath('bedroom', { region: 'parkS', x: 42, z: 70 });
    expect(path.length).toBeGreaterThan(5);
    const via = path.map((w) => w.via);
    expect(via).toContain('gate');
    expect(via).toContain('lane');
    expect(via).toContain('street');
    expect(path.at(-1)).toMatchObject({ x: 42, z: 70, via: 'parkS' });
  });

  it('goes out through the gate, not through the hedge', () => {
    // Walking south from the garden beside the gate: the hedge stops you.
    expect(walkStep('gardenS', 2.5, 14.9, 2.5, 15.3).z).toBeCloseTo(14.9);
    // At the gate: through (in the gateway itself you're still in the garden, then out).
    const half = walkStep('gardenS', 5, 14.9, 5, 15.3);
    expect(half.z).toBeCloseTo(15.3);
    expect(walkStep(half.at, half.x, half.z, 5, 15.7)).toMatchObject({ at: 'gate' });
  });

  it('enters the café by its door only', () => {
    expect(walkStep('squareE', 11.9, 40, 12.8, 40).at).toBe('squareE');
    const door = walkStep('squareE', 11.9, 44, 12.4, 44);
    expect(walkStep(door.at, door.x, door.z, 13.0, 44).at).toBe('cafe');
  });

  it('walks round a tree trunk standing in the park', () => {
    const t = OBSTACLES.find(([x, z]) => inRect(region('parkW'), x, z));
    expect(t).toBeTruthy();
    const [x, z, r] = t!;
    const out = walkStep('parkW', x - r - 0.05, z, x, z);
    expect(Math.hypot(out.x - x, out.z - z)).toBeGreaterThanOrEqual(r - 1e-9);
  });

  it('knows the floor everywhere you can stand', () => {
    for (const r of VILLAGE_REGIONS) expect(regionAt((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2)?.id).toBe(r.id);
  });
});

describe('the village: the map makes sense', () => {
  it('has every portal between real regions, at a point on both', () => {
    const ids = new Set(REGIONS.map((r) => r.id));
    for (const [a, b, x, z] of VILLAGE_PORTALS) {
      expect(ids.has(a as RegionId) && ids.has(b as RegionId)).toBe(true);
      expect(inRect(region(a as RegionId), x, z, 0.8)).toBe(true);
      expect(inRect(region(b as RegionId), x, z, 0.8)).toBe(true);
    }
  });

  it('keeps the fountain and the pond out of the walkable ground', () => {
    for (const r of VILLAGE_REGIONS) {
      expect(inRect(r, FOUNTAIN.x, FOUNTAIN.z)).toBe(false);
      expect(inRect(r, (POND.x0 + POND.x1) / 2, (POND.z0 + POND.z1) / 2)).toBe(false);
    }
  });

  it('keeps buildings off the paths, except the café, which you go into', () => {
    for (const b of BUILDINGS.filter((b) => !b.inside))
      for (const r of VILLAGE_REGIONS) {
        const overlap = b.x0 < r.x1 && r.x0 < b.x1 && b.z0 < r.z1 && r.z0 < b.z1;
        expect(overlap, `${b.id} on ${r.id}`).toBe(false);
      }
  });

  it('puts benches and café tables where you can walk to them', () => {
    for (const [x, z] of [...BENCHES, ...CAFE_TABLES]) expect(regionAt(x, 0, z), `${x},${z}`).not.toBeNull();
  });

  it('covers every tree, lamp and building with a zone (so each is drawn somewhere)', () => {
    for (const [x, z] of [...TREES, ...LAMPS]) expect(ZONES.some((zone) => inRect(zone, x, z)), `${x},${z}`).toBe(true);
    for (const b of BUILDINGS) expect(ZONES.some((zone) => inRect(zone, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2))).toBe(true);
  });
});

describe('the village: seeing each other there', () => {
  it('takes my partner\'s position anywhere in the village, and not beyond', async () => {
    const { readPose } = await import('../src/house/presence');
    expect(readPose({ x: 42, y: 0, z: 70, h: 0 })).not.toBeNull();
    expect(readPose({ x: -50, y: 0, z: 33, h: 0 })).not.toBeNull();
    expect(readPose({ x: 500, y: 0, z: 0, h: 0 })).toBeNull();
  });
});

describe('the village: its people', () => {
  it('puts each villager in the same place on both phones', async () => {
    const { VILLAGERS, villagerAt } = await import('../src/house/villagers');
    const t = Date.parse('2026-11-22T10:20:00Z');
    for (const v of VILLAGERS) expect(villagerAt(v, t, 'c1')).toEqual(villagerAt(v, t, 'c1'));
  });

  it('keeps the baker at the bakery in working hours, and home at night', async () => {
    const { VILLAGERS, villagerAt } = await import('../src/house/villagers');
    const { WORLD_DAY_MS } = await import('../src/house/sky');
    const baker = VILLAGERS.find((v) => v.id === 'baker')!;
    // With no couple offset, world hour h is at h/24 of a world day.
    const at = (h: number) => (h / 24) * WORLD_DAY_MS;
    expect(villagerAt(baker, at(8))).toMatchObject({ x: baker.post!.x, z: baker.post!.z, moving: false });
    expect(villagerAt(baker, at(23))).toBeNull();
  });

  it('keeps the walkers on the ground you can walk, all day', async () => {
    const { VILLAGERS, villagerAt } = await import('../src/house/villagers');
    const { WORLD_DAY_MS } = await import('../src/house/sky');
    for (const v of VILLAGERS.filter((v) => v.route))
      for (let t = 0; t < WORLD_DAY_MS; t += 37_000) {
        const p = villagerAt(v, t);
        if (p) expect(regionAt(p.x, 0, p.z), `${v.id} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).not.toBeNull();
      }
  });

  it('keeps the ducks on the pond', async () => {
    const { duckAt } = await import('../src/house/villagers');
    for (let i = 0; i < 4; i++)
      for (let t = 0; t < 600_000; t += 7_000) {
        const d = duckAt(i, t, POND);
        expect(inRect(POND, d.x, d.z)).toBe(true);
      }
  });
});
