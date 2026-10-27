import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyDraw,
  BOARD_H,
  BOARD_W,
  calligraphyWidths,
  clampSettings,
  colorOf,
  decodeDrawing,
  DrawHub,
  DrawSession,
  emptyDraw,
  encodeDrawing,
  FILL_MAX_CHARS,
  fillRegion,
  fillsAndInk,
  hintOrder,
  hintsShown,
  hintTimes,
  hslToHex,
  normalizeColor,
  pickChoices,
  pointsFor,
  seeded,
  settingsSummary,
  strokeLook,
  type DrawEvent,
  type Stroke,
  GameStore,
  type UsClient,
} from '../src';

const square = (x0: number, y0: number, x1: number, y1: number): Stroke => ({
  id: 'sq',
  by: 'a',
  tool: 'pen',
  c: 0,
  w: 40,
  p: [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0],
  n: 1,
  t0: 0,
  d: 0,
});

/** Is (x, y) inside an even-odd path made of M/L/Z polygons? */
function inside(d: string, x: number, y: number): boolean {
  let hit = false;
  for (const poly of d.split('Z').filter(Boolean)) {
    const pts = poly.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number);
    for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
      const [xi, yi, xj, yj] = [pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

describe('paint bucket', () => {
  it('fills inside a closed shape, up to (and just under) the lines', () => {
    const d = fillRegion([square(1000, 1000, 2000, 2000)], 1500, 1500)!;
    expect(d).toBeTruthy();
    expect(inside(d, 1500, 1500)).toBe(true);
    expect(inside(d, 1100, 1900)).toBe(true);
    expect(inside(d, 500, 500)).toBe(false);
    expect(inside(d, 2500, 1500)).toBe(false);
  });

  it('tapping outside fills the background, not the shape', () => {
    const d = fillRegion([square(1000, 1000, 2000, 2000)], 200, 200)!;
    expect(inside(d, 200, 3800)).toBe(true);
    expect(inside(d, 2900, 100)).toBe(true);
    expect(inside(d, 1500, 1500)).toBe(false);
  });

  it('an empty board fills completely; an eraser opens a gap', () => {
    expect(inside(fillRegion([], 10, 10)!, 2990, 3990)).toBe(true);
    const gap: Stroke = { ...square(0, 0, 0, 0), id: 'e', tool: 'eraser', w: 200, p: [2000, 1500, 2000, 1500], n: 2 };
    const d = fillRegion([square(1000, 1000, 2000, 2000), gap], 1500, 1500)!;
    expect(inside(d, 2600, 1500)).toBe(true);
  });

  it('is the same every time, and small enough for one message', () => {
    const scribble: Stroke = { ...square(0, 0, 0, 0), id: 'z', p: Array.from({ length: 300 }, (_, i) => [1500 + Math.round(1200 * Math.sin(i / 7)), 200 + i * 12]).flat() };
    const a = fillRegion([scribble], 100, 2000);
    expect(a).toBe(fillRegion([scribble], 100, 2000));
    expect(a!.length).toBeLessThanOrEqual(FILL_MAX_CHARS);
  });

  it('travels as a stroke both sides draw the same, under the lines', () => {
    const ends: ((e: DrawEvent) => void)[][] = [[], []];
    const link = (i: number) => ({ send: (e: DrawEvent) => ends[1 - i]!.forEach((f) => f(JSON.parse(JSON.stringify(e)))), on: (f: (e: DrawEvent) => void) => (ends[i]!.push(f), () => {}) });
    const a = new DrawHub('a', link(0)).session('live');
    const b = new DrawHub('b', link(1)).session('live');
    a.begin(1000, 1000, 'pen', 0, 40);
    for (const [x, y] of [[2000, 1000], [2000, 2000], [1000, 2000], [1000, 1000]] as const) a.move(x, y);
    a.finish();
    expect(b.fill(1500, 1500, '#ff00aa')).toBe(true);
    const fill = a.snapshot.strokes.find((s) => s.tool === 'fill')!;
    expect(fill.c).toBe('#FF00AA');
    expect(a.snapshot.strokes).toEqual(b.snapshot.strokes);
    expect(strokeLook(fill)).toMatchObject({ fill: true, evenOdd: true, color: '#FF00AA' });
    expect(fillsAndInk(a.snapshot.strokes).fills).toHaveLength(1);
    // Undo takes the fill back like any stroke.
    expect(b.undo()).toBe(true);
    expect(a.snapshot.strokes.some((s) => s.tool === 'fill')).toBe(false);
  });

  it('a fill with a bad path is ignored', () => {
    const s = emptyDraw();
    expect(applyDraw(s, { op: 'start', s: { id: 'x', by: 'b', tool: 'fill', c: 0, w: 0, p: [1, 1], f: '<script>', n: 1, t0: 0 } })).toBe(s);
  });
});

describe('brushes and colours', () => {
  it('calligraphy is thin along the nib and thick across it', () => {
    const along = calligraphyWidths([0, 0, 100, 100, 200, 200, 300, 300], 100);
    const across = calligraphyWidths([0, 300, 100, 200, 200, 100, 300, 0], 100);
    expect(Math.max(...along)).toBeLessThan(30);
    expect(Math.min(...across)).toBeGreaterThan(80);
    expect(strokeLook({ tool: 'calligraphy', c: 0, w: 60, p: [0, 0, 50, 10, 100, 40] }).fill).toBe(true);
    expect(strokeLook({ tool: 'pencil', c: 0, w: 30, p: [0, 0, 50, 10] }).alpha).toBeLessThan(1);
  });

  it('custom colours round-trip; palette colours stay indexes; old files still open', () => {
    expect(normalizeColor('#f5547c')).toBe(1);
    expect(normalizeColor('#123abc')).toBe('#123ABC');
    expect(colorOf('#123abc')).toBe('#123ABC');
    expect(colorOf('nope')).toBe('#15121A');
    expect(hslToHex(0, 1, 0.5)).toBe('#FF0000');
    const fill: Stroke = { id: 'f', by: 'a', tool: 'fill', c: '#123ABC', w: 0, p: [10, 10], f: 'M0 0L3000 0L3000 4000L0 4000Z', n: 2, t0: 5, d: 0 };
    const back = decodeDrawing(JSON.parse(JSON.stringify(encodeDrawing([square(0, 0, 10, 10), fill]))));
    expect(back.strokes[1]).toMatchObject({ tool: 'fill', c: '#123ABC', f: fill.f });
    const old = decodeDrawing({ v: 1, w: BOARD_W, h: BOARD_H, strokes: [{ id: 'o', by: 'a', tool: 'marker', c: 3, w: 9, p: [1, 2], n: 1, t0: 0, d: 0 }] });
    expect(old.strokes[0]).toMatchObject({ tool: 'marker', c: 3 });
  });
});

describe('game settings', () => {
  it('keeps settings within the limits', () => {
    expect(clampSettings({ rounds: 40, drawMs: 12_345, hints: -2, choices: 9 })).toEqual({ rounds: 10, drawMs: 30_000, hints: 0, choices: 5 });
    expect(clampSettings(null)).toEqual({ rounds: 6, drawMs: 80_000, hints: 2, choices: 3 });
    expect(settingsSummary({ rounds: 4, drawMs: 60_000, hints: 2, choices: 3 })).toBe('4 rounds · 60 s · 2 hints · 3 words to pick from');
  });

  it('spreads hints over the draw time, and scores by it', () => {
    expect(hintTimes(80_000, 3)).toEqual([20_000, 40_000, 60_000]);
    expect(hintTimes(60_000, 2)).toEqual([20_000, 40_000]);
    expect(hintsShown(45_000, 60_000, 2)).toBe(2);
    expect(hintsShown(45_000, 60_000, 0)).toBe(0);
    expect(hintOrder('Auto rickshaw', 3, 5)).toHaveLength(4);
    expect(hintOrder('Auto rickshaw', 3, 1)).toHaveLength(1);
    expect(pointsFor(30_000, 'easy', 60_000)).toBeLessThan(pointsFor(30_000, 'easy', 120_000));
  });

  it('offers as many words as asked', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(pickChoices(['everyday', 'food'], [], [], seeded(n), n)).toHaveLength(n);
  });
});

describe('a live game with our own settings', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays 2 rounds of 30 s with 5 word choices and no hints', async () => {
    const calls: string[] = [];
    const chain = { insert: () => chain, select: () => chain, single: async () => ({ data: { id: 'g9' }, error: null }) };
    const sb = { from: () => chain, rpc: async (fn: string, a: unknown) => (calls.push(`${fn}:${JSON.stringify(a)}`), { data: null, error: null }) } as unknown as UsClient;
    const ends: ((e: DrawEvent) => void)[][] = [[], []];
    const link = (i: number) => ({ send: (e: DrawEvent) => queueMicrotask(() => ends[1 - i]!.forEach((f) => f(JSON.parse(JSON.stringify(e))))), on: (f: (e: DrawEvent) => void) => (ends[i]!.push(f), () => {}) });
    const alice = new GameStore(new DrawHub('alice', link(0)), sb, 'c', 'alice', 'bob');
    const bob = new GameStore(new DrawHub('bob', link(1)), sb, 'c', 'bob', 'alice');
    for (const s of [alice, bob]) s.subscribe(() => s.tick());

    await alice.invite(['everyday'], { rounds: 2, drawMs: 30_000, hints: 0, choices: 5 });
    await vi.advanceTimersByTimeAsync(1);
    expect(bob.state?.settings).toEqual({ rounds: 2, drawMs: 30_000, hints: 0, choices: 5 });
    await bob.join();
    await vi.advanceTimersByTimeAsync(1);
    for (const drawer of [alice, bob]) {
      expect(drawer.state?.choices).toHaveLength(5);
      drawer.pick(drawer.state!.choices[0]!);
      await vi.advanceTimersByTimeAsync(1);
      expect(drawer.state!.until - drawer.state!.startedAt).toBe(30_000);
      await vi.advanceTimersByTimeAsync(29_000);
      const other = drawer === alice ? bob : alice;
      expect(Object.keys(other.state!.revealed)).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1_500);
      expect(other.state?.phase).toBe('reveal');
      await vi.advanceTimersByTimeAsync(5_000);
    }
    expect(alice.state?.phase).toBe('done');
    expect(calls.filter((c) => c.startsWith('finish_draw_game'))).toHaveLength(1);
    void DrawSession;
  });
});
