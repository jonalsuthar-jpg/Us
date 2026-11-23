import { describe, expect, it } from 'vitest';
import { nextStreak, REQUESTS, requestsFor, stampOfMoment, stampOfRegion, STAMPS, taskOfMoment, todayFor } from '../src/house/daily';
import { VILLAGERS } from '../src/house/villagers';

describe('house: daily life in the village', () => {
  it('two different requests a day, the same on both phones, from people who exist', () => {
    for (const day of ['2026-11-23', '2026-11-24', '2026-12-01']) {
      const [a, b] = requestsFor(day, 'c1');
      expect(a!.id).not.toBe(b!.id);
      expect(requestsFor(day, 'c1')).toEqual([a, b]);
    }
    for (const r of REQUESTS) expect(VILLAGERS.some((v) => v.id === r.who), r.id).toBe(true);
    // Over a month, every request comes up.
    const seen = new Set<string>();
    for (let d = 1; d <= 30; d++) for (const r of requestsFor(`2026-11-${String(d).padStart(2, '0')}`, 'c1')) seen.add(r.id);
    expect(seen.size).toBe(REQUESTS.length);
  });

  it('three different things to do together each day', () => {
    const t = todayFor('2026-11-23', 'c1');
    expect(new Set(t).size).toBe(3);
    expect(todayFor('2026-11-23', 'c1')).toEqual(t);
    expect(todayFor('2026-11-24', 'c1')).not.toEqual(t);
  });

  it('moments count towards the day and the stamp book', () => {
    expect(taskOfMoment('coffee:2026', 'A coffee date ☕')).toBe('coffee');
    expect(taskOfMoment('cycle:1', 'Out on the cycle 🚲')).toBeNull();
    expect(taskOfMoment('cycle:1', 'Riding together 🚲')).toBe('cycle');
    expect(stampOfMoment('six:1', 'A six!')).toBe('first_six');
    expect(stampOfRegion('templeHall')).toBe('temple');
    expect(stampOfRegion('living')).toBeNull();
    expect(new Set(STAMPS.map((s) => s.id)).size).toBe(STAMPS.length);
  });

  it('keeps the streak going day after day', () => {
    expect(nextStreak(null, '2026-11-23')).toBe(1);
    expect(nextStreak({ last: '2026-11-22', streak: 4 }, '2026-11-23')).toBe(5);
    expect(nextStreak({ last: '2026-11-20', streak: 4 }, '2026-11-23')).toBe(1);
    expect(nextStreak({ last: '2026-11-23', streak: 5 }, '2026-11-23')).toBe(5);
    expect(nextStreak({ last: '2026-11-30', streak: 2 }, '2026-12-01')).toBe(3);
  });
});
