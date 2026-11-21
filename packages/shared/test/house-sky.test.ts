import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HousePresence, type HouseEvent } from '../src/house/presence';
import { formatWorldTime, isNight, NIGHT_FOR_NOW_MS, skyAt, untilWorld, weatherFor, WORLD_DAY_MS, worldHours } from '../src/house/sky';
import { nearness, stepSound } from '../src/house/sound';

describe('house: the sky', () => {
  it('is night at midnight, day at noon, golden at sunset', () => {
    expect(skyAt(0).night).toBe(true);
    expect(skyAt(12).daylight).toBe(1);
    expect(skyAt(12).night).toBe(false);
    expect(skyAt(18.6).golden).toBeGreaterThan(0.3);
    expect(skyAt(12).golden).toBe(0);
    expect(skyAt(23).night).toBe(true);
  });

  it('puts the sun high at noon and low near sunrise', () => {
    expect(skyAt(12).sun[1]).toBeGreaterThan(skyAt(7).sun[1]);
  });

  it('runs a whole world day in 4 real hours, the same for both of us', () => {
    const t = Date.parse('2026-11-22T12:00:00Z');
    expect(worldHours(t + WORLD_DAY_MS, 'c1')).toBeCloseTo(worldHours(t, 'c1'), 6);
    // An hour of real time is six world hours.
    expect((worldHours(t + 3600_000, 'c1') - worldHours(t, 'c1') + 24) % 24).toBeCloseTo(6, 6);
    // Both phones, whatever their time zones, read the same world hour.
    expect(worldHours(new Date(t), 'c1')).toBe(worldHours(t, 'c1'));
    expect(formatWorldTime(18 + 40 / 60)).toBe('6:40 pm');
    expect(formatWorldTime(0.5)).toBe('12:30 am');
    // From noon: dusk at 6:45 pm is 6¾ world hours away, 67½ real minutes.
    expect(untilWorld(12).dusk).toBeCloseTo(67.5, 6);
  });

  it('lets the moon button decide for half an hour, then the world clock', () => {
    // The moment the world (no couple offset) is at noon.
    const noon = new Date(WORLD_DAY_MS / 2);
    const now = noon.toISOString();
    expect(isNight({ on: true, at: now }, noon)).toBe(true);
    expect(isNight({ on: true, at: now }, new Date(noon.getTime() + NIGHT_FOR_NOW_MS + 1000))).toBe(false);
    expect(isNight(undefined, noon)).toBe(false);
    // An old "on" with no time is the clock's call.
    expect(isNight({ on: true }, noon)).toBe(false);
  });

  it('gives both of us the same weather, and it changes from day to day', () => {
    const c = '1b2c3d4e-0000-4000-8000-000000000000';
    expect(weatherFor(c, '2026-11-22')).toBe(weatherFor(c, '2026-11-22'));
    const days = Array.from({ length: 60 }, (_, i) => weatherFor(c, `2026-12-${String((i % 28) + 1).padStart(2, '0')}-${i}`));
    expect(new Set(days).size).toBeGreaterThan(2);
    expect(days.filter((d) => d === 'clear').length).toBeGreaterThan(days.filter((d) => d === 'fog').length);
  });
});

describe('house: sounds', () => {
  it('steps sound like the floor', () => {
    expect(stepSound('kitchen')).toBe('step_tile');
    expect(stepSound('gardenN')).toBe('step_grass');
    expect(stepSound('living')).toBe('step_wood');
  });
  it('is quieter further away', () => {
    expect(nearness(0)).toBe(1);
    expect(nearness(3)).toBeLessThan(nearness(1));
  });
});

describe('house: doing things together', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes an invitation and its answer between us', () => {
    const listeners = new Map<string, (e: HouseEvent) => void>();
    const wire = (me: string) => ({
      send: (e: HouseEvent) => {
        for (const [who, fn] of listeners) if (who !== me) fn(e);
      },
      on: (fn: (e: HouseEvent) => void) => {
        listeners.set(me, fn);
        return () => void listeners.delete(me);
      },
    });
    const a = new HousePresence('a', wire('a'));
    const b = new HousePresence('b', wire('b'));
    const atA: unknown[] = [];
    const atB: unknown[] = [];
    a.onInvite((m) => atA.push(m));
    b.onInvite((m) => atB.push(m));
    a.invite('hands');
    expect(atB).toEqual([{ kind: 'hands' }]);
    b.answer('hands', true);
    expect(atA).toEqual([{ kind: 'hands', answer: true }]);
    // Something that isn't one of ours is ignored.
    listeners.get('b')!({ op: 'invite', kind: 'fight' as never, from: 'a' });
    expect(atB).toHaveLength(1);
  });
});
