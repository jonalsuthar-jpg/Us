import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLOOR_H, findPath, floorY, REGIONS, regionAt, SPAWN, SWIM_Y } from '../src/house/layout';
import { HousePresence, IDLE_POSE_EVERY_MS, POSE_EVERY_MS, POSE_TTL_MS, readPose, type HouseEvent } from '../src/house/presence';

describe('house layout', () => {
  it('finds the floor under a spot, never the one above it', () => {
    expect(regionAt(-3, 0, 0)?.id).toBe('living');
    expect(regionAt(-3, FLOOR_H, 0)?.id).toBe('bedroom');
    // A tap on a ground-floor wall at head height is still downstairs.
    expect(regionAt(-3, 2.5, 0)?.id).toBe('living');
    expect(regionAt(3, 0.5, 1)?.id).toBe('kitchen');
    expect(regionAt(5, SWIM_Y, 9)?.id).toBe('pool');
    // Off the map (out past the village).
    expect(regionAt(90, 0, 90)).toBeNull();
    expect(regionAt(30, 0, 30)?.id).toBe('street');
  });

  it('climbs the stairs as a ramp', () => {
    expect(floorY('stairs', 1.6)).toBe(0);
    expect(floorY('stairs', 5.0)).toBe(FLOOR_H);
    expect(floorY('stairs', 3.3)).toBeCloseTo(FLOOR_H / 2);
    expect(regionAt(3.3, 1.5, -3.3)?.id).toBe('stairs');
  });

  it('walks from the garden to the bedroom through the door and up the stairs', () => {
    const path = findPath(SPAWN.region, { region: 'bedroom', x: -4, z: 0 });
    expect(path.map((w) => w.via)).toEqual(['gardenN', 'living', 'kitchen', 'stairFoot', 'stairs', 'stairHead', 'landing', 'bedroom']);
    expect(path.at(-1)).toMatchObject({ x: -4, z: 0 });
  });

  it('keeps the end of a walk inside the room', () => {
    const path = findPath('living', { region: 'living', x: -20, z: 0 });
    expect(path).toEqual([{ x: -5.8, z: 0, via: 'living' }]);
  });

  it('reaches every region from the front path', () => {
    for (const r of REGIONS) expect(findPath(SPAWN.region, { region: r.id, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 }).length).toBeGreaterThan(0);
  });
});

describe('house presence', () => {
  let now = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    now = 1_000_000;
  });
  afterEach(() => vi.useRealTimers());

  /** Two of us on one pretend channel. */
  function pair() {
    const listeners = new Map<string, (e: HouseEvent) => void>();
    const sent: HouseEvent[] = [];
    const wire = (me: string) => ({
      send: (e: HouseEvent) => {
        sent.push(e);
        for (const [who, fn] of listeners) if (who !== me) fn(e);
      },
      on: (fn: (e: HouseEvent) => void) => {
        listeners.set(me, fn);
        return () => void listeners.delete(me);
      },
    });
    const a = new HousePresence('a', wire('a'), () => now);
    const b = new HousePresence('b', wire('b'), () => now);
    return { a, b, sent };
  }

  const pose = (x: number, m: 0 | 1 = 1) => ({ x, y: 0, z: 0, h: 0, m });

  it('sends poses at a steady pace while walking, and one when I stop', () => {
    const { a, b, sent } = pair();
    const poses = () => sent.filter((e) => e.from === 'a' && e.op === 'pose').length;
    a.update(pose(1));
    expect(poses()).toBe(1);
    now += POSE_EVERY_MS / 2;
    a.update(pose(1.1));
    expect(poses()).toBe(1);
    now += POSE_EVERY_MS;
    a.update(pose(1.2));
    expect(poses()).toBe(2);
    expect(b.partner()).toMatchObject({ x: 1.2, m: 1 });
    now += 10;
    a.update(pose(1.3, 0));
    expect(poses()).toBe(3);
    expect(b.partner()).toMatchObject({ x: 1.3, m: 0 });
  });

  it('answers a hello with where I am, and keeps a heartbeat while I stand still', () => {
    const { a, sent } = pair();
    a.update(pose(2, 0));
    const before = sent.length;
    now += IDLE_POSE_EVERY_MS;
    vi.advanceTimersByTime(1_000);
    expect(sent.slice(before).some((e) => e.from === 'a' && e.op === 'pose')).toBe(true);
  });

  it('notices my partner coming in and leaving', () => {
    const { a, b } = pair();
    const seen: boolean[] = [];
    b.onPartnerHere((here) => seen.push(here));
    a.update(pose(0));
    expect(b.partnerHere()).toBe(true);
    a.dispose();
    expect(b.partner()).toBeNull();
    expect(seen).toEqual([true, false]);
  });

  it('forgets a partner who went quiet', () => {
    const { a, b } = pair();
    a.update(pose(0));
    a.dispose = () => {};
    now += POSE_TTL_MS + 1;
    expect(b.partner()).toBeNull();
  });

  it('passes emotes along', () => {
    const { a, b } = pair();
    const got: string[] = [];
    b.onEmote((e) => got.push(e));
    a.emote('wave');
    a.emote('heart');
    expect(got).toEqual(['wave', 'heart']);
  });

  it('ignores poses that are broken or far from the house', () => {
    expect(readPose({ x: 1, y: 0, z: 0, h: 0 })).toMatchObject({ m: 0 });
    expect(readPose({ x: NaN, y: 0, z: 0, h: 0 })).toBeNull();
    expect(readPose({ x: 500, y: 0, z: 0, h: 0 })).toBeNull();
    expect(readPose(null)).toBeNull();
  });
});
