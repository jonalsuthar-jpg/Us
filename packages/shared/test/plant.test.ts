import { describe, expect, it } from 'vitest';
import { plantLine, plantState, type PlantData } from '../src/api/plant';
import { plantScene, CAN_COLORS } from '../src/plant-art';

const TZ = 'Asia/Kolkata';
// 2026-10-26, 15:00 in India.
const now = new Date('2026-10-26T09:30:00Z');
const day = (offset: number) => {
  const d = new Date('2026-10-26T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};
const both = (offset: number) => ({ couple_id: 'c', day: day(offset), a_at: 'x', b_at: 'y' });
const data = (days: PlantData['days']): PlantData => ({ days, timezone: TZ });

describe('plant', () => {
  it('starts as a seed and climbs through the stages by together days', () => {
    expect(plantState(data([]), 'a', now).stage.key).toBe('seed');
    const at = (n: number) => plantState(data(Array.from({ length: n }, (_, i) => both(i))), 'a', now);
    expect(at(1).stage.key).toBe('sprout');
    expect(at(2).stage.key).toBe('sprout');
    expect(at(3).stage.key).toBe('seedling');
    expect(at(7).stage.key).toBe('young');
    expect(at(14).stage.key).toBe('bud');
    expect(at(30).stage.key).toBe('flower');
    expect(at(60).stage.key).toBe('bloom');
    expect(at(100)).toMatchObject({ next: null, daysToNext: null });
    expect(at(100).stage.key).toBe('tree');
    expect(at(8)).toMatchObject({ togetherDays: 8, daysToNext: 6 });
  });

  it('counts only days we both showed up; quiet spells never shrink it', () => {
    const s = plantState(data([both(40), both(39), both(38), { couple_id: 'c', day: day(2), a_at: 'x', b_at: null }]), 'a', now);
    expect(s.togetherDays).toBe(3);
    expect(s.stage.key).toBe('seedling');
  });

  it('knows who watered today, from my side', () => {
    const today = { couple_id: 'c', day: day(0), a_at: 'x', b_at: null };
    expect(plantState(data([today]), 'a', now).today).toEqual({ me: true, partner: false });
    expect(plantState(data([today]), 'b', now).today).toEqual({ me: false, partner: true });
    expect(plantLine(plantState(data([both(3), today]), 'b', now), 'Priya')).toBe('Priya watered it today. Your turn 🌱');
  });

  it('droops after a missed day, and perks up the day we both come back', () => {
    expect(plantState(data([both(1)]), 'a', now).drooping).toBe(false);
    expect(plantState(data([both(2)]), 'a', now).drooping).toBe(true);
    expect(plantState(data([both(2), both(0)]), 'a', now)).toMatchObject({ drooping: false, grewToday: true });
    expect(plantState(data([]), 'a', now).drooping).toBe(false);
  });

  it('marks the last 30 days, ending today', () => {
    const s = plantState(data([both(0), { couple_id: 'c', day: day(1), a_at: 'x', b_at: null }, both(45)]), 'a', now);
    expect(s.last30).toHaveLength(30);
    expect(s.last30.at(-1)).toBe('both');
    expect(s.last30.at(-2)).toBe('one');
    expect(s.last30.filter((d) => d === 'both')).toHaveLength(1);
  });

  it("follows the couple's clock for today and the sky", () => {
    // 23:30 UTC is already the next morning in India.
    const late = new Date('2026-10-25T23:30:00Z');
    const s = plantState(data([{ couple_id: 'c', day: '2026-10-26', a_at: 'x', b_at: null }]), 'a', late);
    expect(s.today.me).toBe(true);
    expect(s.daypart).toBe('morning');
  });

  it('draws every stage, and both cans', () => {
    for (const stage of ['seed', 'sprout', 'seedling', 'young', 'bud', 'flower', 'bloom', 'tree'] as const) {
      const scene = plantScene({ stage, drooping: false, daypart: 'day', fresh: false, left: { ...CAN_COLORS.a, watered: true }, right: { ...CAN_COLORS.b, watered: false } });
      expect(scene.layers.find((l) => l.id === 'plant')!.shapes.length).toBeGreaterThan(0);
      expect(scene.layers.find((l) => l.id === 'drops')!.shapes.length).toBe(3);
      for (const l of scene.layers) for (const sh of l.shapes) if (sh.kind === 'path') expect(sh.d).not.toMatch(/NaN/);
    }
  });
});
