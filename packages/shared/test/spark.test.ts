import { describe, expect, it } from 'vitest';
import type { SparkEvent, SparkSeason } from '../src/database.types';
import { rankFor, SPARK_DIVISIONS, sparkNextLine, sparkState, togetherStreak, type SparkData } from '../src/api/spark';
import { sparkEmblem } from '../src/spark-art';

const TZ = 'Asia/Kolkata';
// 2026-10-26, 15:00 in India.
const now = new Date('2026-10-26T09:30:00Z');

const season = (s: string, sparks: number, extra: Partial<SparkSeason> = {}): SparkSeason => ({
  couple_id: 'c',
  season: s,
  carry_in: 0,
  sparks,
  today: null,
  today_sparks: 0,
  notified_rank: 0,
  ...extra,
});
let id = 0;
const event = (day: string, kind: SparkEvent['kind'], sparks: number): SparkEvent => ({
  id: ++id,
  couple_id: 'c',
  user_id: 'me',
  day,
  kind,
  sparks,
  source: `x:${id}`,
  created_at: `${day}T06:00:00Z`,
});
const data = (seasons: SparkSeason[], mine: SparkEvent[] = []): SparkData => ({ seasons, mine, timezone: TZ });

describe('spark rank', () => {
  it('has 21 steps from Ember I to Aurora III, then Eternal, each wider than the last', () => {
    expect(SPARK_DIVISIONS).toHaveLength(22);
    expect(SPARK_DIVISIONS[0]).toMatchObject({ name: 'Ember I', at: 0, step: 0 });
    expect(SPARK_DIVISIONS[1]).toMatchObject({ name: 'Ember II', at: 100, step: 1 });
    expect(SPARK_DIVISIONS[2]).toMatchObject({ name: 'Ember III', at: 200, step: 2 });
    expect(SPARK_DIVISIONS[3]).toMatchObject({ name: 'Spark I', at: 300 });
    expect(SPARK_DIVISIONS[20]).toMatchObject({ name: 'Aurora III' });
    expect(SPARK_DIVISIONS[21]).toMatchObject({ name: 'Eternal', at: 6870, step: 2 });
  });

  it('finds the rank, what is left, and how far through it we are', () => {
    expect(rankFor(0)).toMatchObject({ toNext: 100, progress: 0 });
    expect(rankFor(99).division.name).toBe('Ember I');
    expect(rankFor(100).division.name).toBe('Ember II');
    expect(rankFor(375)).toMatchObject({ toNext: 75, progress: 0.5 });
    expect(rankFor(375).division.name).toBe('Spark I');
    for (const d of SPARK_DIVISIONS) expect(rankFor(d.at).division.index).toBe(d.index);
    expect(rankFor(99_999)).toMatchObject({ next: null, toNext: 0, progress: 1 });
  });

  it('reads this month, ours today, and only my own effort', () => {
    const s = sparkState(
      data(
        [season('2026-10-01', 760, { today: '2026-10-26', today_sparks: 62 }), season('2026-09-01', 1200)],
        [
          event('2026-09-30', 'snap', 8),
          event('2026-10-25', 'message', 20),
          event('2026-10-26', 'first_move', 15),
          event('2026-10-26', 'message', 6),
          event('2026-10-26', 'snap', 8),
        ],
      ),
      now,
    );
    expect(s).toMatchObject({ season: '2026-10-01', month: 'October', daysLeft: 5, sparks: 760, today: 62 });
    expect(s.rank.division.name).toBe('Glow I');
    expect(s.mine).toMatchObject({ season: 49, today: 29, firstMoves: 1, usedToday: { first_move: 15, message: 6, snap: 8 } });
    expect(s.mine.byKind[0]).toEqual({ kind: 'message', sparks: 26 });
    expect(s.peaks).toEqual([{ season: '2026-09-01', month: 'September', division: rankFor(1200).division }]);
    expect(sparkNextLine(s)).toBe('210 Sparks to Glow II');
  });

  it('opens a new month at 40% of the last, before anything is earned', () => {
    const s = sparkState(data([season('2026-09-01', 1000, { today: '2026-09-30', today_sparks: 80 })]), now);
    expect(s).toMatchObject({ sparks: 400, today: 0 });
    expect(s.rank.division.name).toBe('Spark I');
    expect(sparkState(data([]), now)).toMatchObject({ sparks: 0, peaks: [] });
  });

  it('counts the together streak, with today counting once it is done', () => {
    expect(togetherStreak(['none', 'both', 'both', 'one'])).toBe(2);
    expect(togetherStreak(['none', 'both', 'both', 'both'])).toBe(3);
    expect(togetherStreak(['both', 'none', 'none'])).toBe(0);
  });

  it('dresses each step in more gold: plain, a rim, then wings and a gem', () => {
    const fills = (i: number) => sparkEmblem(i).shapes.map((s) => s.fill ?? s.stroke);
    expect(fills(9).filter((f) => f === 'grad:gold')).toHaveLength(0);
    expect(fills(10).filter((f) => f === 'grad:gold')).toHaveLength(1);
    expect(fills(11).filter((f) => f === 'grad:gold')).toHaveLength(4);
    expect(sparkEmblem(21).shapes).toHaveLength(sparkEmblem(11).shapes.length);
    expect(sparkEmblem(9).gradients.map((g) => g.id)).toEqual(['tier']);
  });
});
