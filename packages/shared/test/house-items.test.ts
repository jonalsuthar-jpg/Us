import { describe, expect, it } from 'vitest';
import { actionFor, addedKey, avatarKey, cleanLook, cleanState, doorFor, HAIRS, ITEMS, PANTS, placeItems, restingY, seatPose, SHIRTS, SKINS, toLocal, toWorld, water } from '../src/house/items';
import { FLOOR_H, walkStep, type RegionId } from '../src/house/layout';
import { holdLoses, KEY, readItemOp, readPose } from '../src/house/presence';
import { HouseStore, StaleHouseError, type HouseApi } from '../src/house/store';

describe('house: walking with the stick', () => {
  it('stays in the room and slides along a wall', () => {
    // Straight into the west wall of the living room: stops at the edge, keeps sliding north.
    expect(walkStep('living', -5.75, 0, -5.9, -0.1)).toEqual({ at: 'living', x: -5.75, z: -0.1 });
  });

  it('passes a doorway only near its middle', () => {
    let at: RegionId = 'living';
    let x = 0.7;
    for (let i = 0; i < 20; i++) ({ at, x } = walkStep(at, x, 0.6, x + 0.05, 0.6));
    expect(at).toBe('kitchen');
    // Into the wall beside it: no.
    expect(walkStep('living', 0.79, -2, 0.85, -2)).toMatchObject({ at: 'living', x: 0.79 });
  });

  it('walks straight across the garden, which is several regions', () => {
    let at: RegionId = 'gardenN';
    let z = 6.8;
    for (let i = 0; i < 10; i++) ({ at, z } = walkStep(at, -6, z, -6, z + 0.05));
    expect(at).toBe('gardenW');
  });

  it('goes up the stairs and arrives upstairs', () => {
    let at: RegionId = 'kitchen';
    let x = 1.4;
    let z = -2.4;
    for (let i = 0; i < 20; i++) ({ at, x, z } = walkStep(at, x, z, x, z - 0.05));
    expect(at).toBe('stairFoot');
    for (let i = 0; i < 100; i++) ({ at, x, z } = walkStep(at, x, z, x + 0.05, -3.3));
    expect(['stairs', 'stairHead']).toContain(at);
  });
});

describe('house: things in it', () => {
  it('puts saved changes over the catalog, and adds what we added', () => {
    const placed = placeItems(
      new Map([
        ['sofa', { x: 1, z: 2, color: '#4E6E8E' }],
        [addedKey('plantPot', 'abcd1234'), { x: 3, z: 1 }],
        ['add:nonsense:abcd', { x: 0, z: 0 }],
      ]),
    );
    expect(placed.find((i) => i.key === 'sofa')).toMatchObject({ x: 1, z: 2, y: 0, state: { color: '#4E6E8E' } });
    expect(placed.find((i) => i.key === 'add:plantpot:abcd1234')).toMatchObject({ model: 'plantPot', x: 3, z: 1, movable: true });
    expect(placed.some((i) => i.key.startsWith('add:nonsense'))).toBe(false);
    // Things that come with our days together (or a date) wait until they're unlocked.
    expect(placed.length).toBe(ITEMS.filter((i) => !i.unlock).length + 1);
    expect(placed.some((i) => i.key === 'hot_tub')).toBe(false);
    expect(placeItems(new Map(), new Set(['hot_tub'])).some((i) => i.key === 'hot_tub')).toBe(true);
  });

  it('keeps every key acceptable to the database', () => {
    for (const i of ITEMS) expect(KEY.test(i.key)).toBe(true);
    expect(KEY.test(avatarKey('3F2A9C1E-0000-4000-8000-000000000000'))).toBe(true);
    expect(KEY.test(addedKey('coffeeTable', 'x1y2z3w4'))).toBe(true);
  });

  it('turns local points to the world and back', () => {
    const it = { x: 2, z: -1, ry: 0.7 };
    const [wx, wz] = toWorld(it, 0.3, -0.4);
    const [lx, lz] = toLocal(it, wx, wz);
    expect(lx).toBeCloseTo(0.3);
    expect(lz).toBeCloseTo(-0.4);
  });

  it('seats you facing the way the sofa faces', () => {
    const sofa = placeItems(new Map()).find((i) => i.key === 'sofa')!;
    const s = seatPose(sofa, 0)!;
    expect(s.h).toBeCloseTo(-Math.PI / 2);
    expect(s.y).toBeCloseTo(0.45);
    expect(Math.abs(s.x - sofa.x)).toBeLessThan(0.2);
  });

  it('puts things down on a table, or on the floor', () => {
    const all = placeItems(new Map());
    expect(restingY(all, 3.1, 0, 1.6)).toBeCloseTo(0.78);
    expect(restingY(all, -3, 0, 6)).toBe(0);
    expect(restingY(all, -5.55, FLOOR_H, -1.35)).toBeCloseTo(FLOOR_H + 0.55);
  });

  it('grows a plant a step a day, however often it is watered', () => {
    const once = water({}, '2026-11-22');
    expect(once).toEqual({ watered: '2026-11-22', growth: 1 });
    expect(water(once, '2026-11-22')).toBe(once);
    expect(water({ growth: 4, watered: '2026-11-21' }, '2026-11-22').growth).toBe(4);
  });

  it('cleans what comes off the wire', () => {
    expect(cleanState({ on: true, x: 1.23456, color: 'red', growth: 9, extra: 1 })).toEqual({ on: true, x: 1.235 });
    expect(cleanState([1])).toBeNull();
    expect(cleanLook({ skin: SKINS[0], hair: HAIRS[0], shirt: SHIRTS[0], pants: PANTS[0] })).not.toBeNull();
    expect(cleanLook({ skin: '#000000', hair: HAIRS[0], shirt: SHIRTS[0], pants: PANTS[0] })).toBeNull();
  });

  it('labels the action button', () => {
    const all = placeItems(new Map([['tv', { on: true }]]));
    const get = (k: string) => all.find((i) => i.key === k)!;
    expect(actionFor(get('floor_lamp'), null, false)).toBe('Turn off lamp');
    expect(actionFor(get('tv'), null, false)).toBe('Turn off the TV');
    expect(actionFor(get('front_door'), null, false)).toBe('Open front door');
    expect(actionFor(get('mug'), null, false)).toBe('Pick up mug');
    expect(actionFor(get('mug'), 'book', false)).toBeNull();
    expect(actionFor(get('garden_plant_1'), null, false)).toBeNull();
    expect(actionFor(get('garden_plant_1'), 'watering_can', false)).toBe('Water the plant');
    expect(actionFor(get('bed'), null, false)).toBe('Lie on the bed');
  });

  it('finds the door in a doorway', () => {
    const all = placeItems(new Map());
    expect(doorFor('gardenN', 'living', all)?.key).toBe('front_door');
    expect(doorFor('living', 'kitchen', all)).toBeUndefined();
  });
});

describe('house: holding the same thing', () => {
  it('lets whoever picked it up first keep it', () => {
    expect(holdLoses({ since: 200, me: 'a' }, { since: 100, them: 'b' })).toBe(true);
    expect(holdLoses({ since: 100, me: 'a' }, { since: 200, them: 'b' })).toBe(false);
    // The same moment: the lower id keeps it, on both sides.
    expect(holdLoses({ since: 100, me: 'b' }, { since: 100, them: 'a' })).toBe(true);
    expect(holdLoses({ since: 100, me: 'a' }, { since: 100, them: 'b' })).toBe(false);
  });

  it('carries what I do and hold in the pose', () => {
    expect(readPose({ x: 0, y: 0, z: 0, h: 0, a: 'sit:sofa:0', hk: 'mug', hs: 5 })).toMatchObject({ a: 'sit:sofa:0', hk: 'mug', hs: 5 });
    expect(readPose({ x: 0, y: 0, z: 0, h: 0, a: 'DROP TABLE', hk: 'mug' })).toEqual({ x: 0, y: 0, z: 0, h: 0, m: 0 });
  });

  it('reads item changes, and refuses broken ones', () => {
    expect(readItemOp({ op: 'item', k: 'sofa', s: { color: '#4E6E8E' }, v: 2 })).toMatchObject({ k: 'sofa', v: 2 });
    expect(readItemOp({ op: 'item', k: 'sofa', s: null, v: 3 })).toMatchObject({ s: null });
    expect(readItemOp({ op: 'item', k: 'Sofa!', s: {}, v: 1 })).toBeNull();
    expect(readItemOp({ op: 'item', k: 'sofa', s: [1], v: 1 })).toBeNull();
    expect(readItemOp({ op: 'item', k: 'sofa', s: { x: 'y'.repeat(3000) }, v: 1 })).toBeNull();
  });
});

describe('house: the store', () => {
  /** house_items in memory, with the version check. */
  function server() {
    const rows = new Map<string, { state: Record<string, unknown>; version: number }>();
    const api: HouseApi = {
      load: async () => [...rows].map(([key, r]) => ({ key, state: r.state, version: r.version })),
      save: async (key, state, version) => {
        if ((rows.get(key)?.version ?? 0) !== version) throw new StaleHouseError();
        if (!state) {
          rows.delete(key);
          return 0;
        }
        rows.set(key, { state, version: version + 1 });
        return version + 1;
      },
    };
    return { rows, api };
  }

  /** Two of us, the wire between us delivering at once. */
  function two() {
    const db = server();
    const pair: { a?: HouseStore; b?: HouseStore } = {};
    pair.a = new HouseStore(db.api, (op) => pair.b!.receive({ op: 'item', ...op }));
    pair.b = new HouseStore(db.api, (op) => pair.a!.receive({ op: 'item', ...op }));
    return { db, a: pair.a, b: pair.b };
  }
  const settle = async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  };

  it('shows a change at once on both sides, then saves it', async () => {
    const { db, a, b } = two();
    await Promise.all([a.load(), b.load()]);
    a.set('floor_lamp', { on: false });
    expect(a.items().get('floor_lamp')).toEqual({ on: false });
    expect(b.items().get('floor_lamp')).toEqual({ on: false });
    await settle();
    expect(db.rows.get('floor_lamp')).toEqual({ state: { on: false }, version: 1 });
    b.set('floor_lamp', { on: true });
    await settle();
    expect(db.rows.get('floor_lamp')?.version).toBe(2);
    expect(a.items().get('floor_lamp')).toEqual({ on: true });
  });

  it('saves quick changes to one thing one after another', async () => {
    const { db, a } = two();
    await a.load();
    a.set('sofa', { x: 1 });
    a.set('sofa', { x: 2 });
    a.set('sofa', { x: 3 });
    await settle();
    expect(db.rows.get('sofa')).toEqual({ state: { x: 3 }, version: 3 });
  });

  it('reloads after losing a race', async () => {
    const { db, a } = two();
    await a.load();
    // My partner's save landed but its message never reached me.
    db.rows.set('tv', { state: { on: true }, version: 1 });
    a.set('tv', { on: false });
    await settle();
    expect(db.rows.get('tv')).toEqual({ state: { on: true }, version: 1 });
    expect(a.items().get('tv')).toEqual({ on: true });
  });

  it('takes things away for both of us', async () => {
    const { db, a, b } = two();
    await Promise.all([a.load(), b.load()]);
    a.set('add:rug:ab12cd34', { x: 1, z: 1 });
    await settle();
    b.set('add:rug:ab12cd34', null);
    await settle();
    expect(a.items().has('add:rug:ab12cd34')).toBe(false);
    expect(db.rows.has('add:rug:ab12cd34')).toBe(false);
  });

  it('ignores an old change arriving late', async () => {
    const { a } = two();
    await a.load();
    a.receive({ op: 'item', k: 'sofa', s: { x: 5 }, v: 3 });
    a.receive({ op: 'item', k: 'sofa', s: { x: 1 }, v: 2 });
    expect(a.items().get('sofa')).toEqual({ x: 5 });
  });
});
