import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyDraw,
  BATCH_MS,
  BOARD_H,
  BOARD_W,
  centerPath,
  checkSecret,
  COLOURING_PAGES,
  decodeDrawing,
  DrawHub,
  DrawingVersionError,
  emptyDraw,
  encodeDrawing,
  fitBoard,
  gameReducer,
  hintOrder,
  hintsShown,
  inkLayers,
  levenshtein,
  maskWith,
  matchGuess,
  normalizeWord,
  outlinePath,
  pickChoices,
  pointsFor,
  replayTimeline,
  secretFor,
  seeded,
  sha256,
  simplifyIndexes,
  snapshotParts,
  strokeLook,
  strokesAt,
  toBoard,
  TURN_MS,
  ourWords,
  drawerOf,
  type DrawEvent,
  type DrawOp,
  type GameMsg,
  type GameState,
  type Stroke,
} from '../src';

const stroke = (id: string, by: string, n: number, p: number[], extra: Partial<Stroke> = {}): Stroke => ({
  id,
  by,
  tool: 'pen',
  c: 1,
  w: 50,
  p,
  n,
  t0: 1000 * n,
  d: 400,
  ...extra,
});

describe('strokes', () => {
  it('maps screen points onto the fixed 3:4 board, whatever the screen', () => {
    expect(toBoard(179, 238.5, 358, 477)).toEqual([1500, 2000]);
    expect(toBoard(270, 360, 540, 720)).toEqual([1500, 2000]);
    expect(toBoard(-5, 900, 540, 720)).toEqual([0, BOARD_H]);
  });

  it('fits the board into any box, centred', () => {
    expect(fitBoard(1000, 800)).toEqual({ width: 600, height: 800, x: 200, y: 0 });
    expect(fitBoard(358, 900)).toEqual({ width: 358, height: 477, x: 0, y: 211 });
  });

  it('simplifies a straight line to its ends and keeps corners', () => {
    const line = Array.from({ length: 50 }, (_, i) => [i * 10, i * 10]).flat();
    expect(simplifyIndexes(line)).toEqual([0, 49]);
    const corner = [0, 0, 100, 0, 200, 0, 200, 100, 200, 200];
    expect(simplifyIndexes(corner)).toEqual([0, 2, 4]);
  });

  it('round-trips through the saved file, and stays small', () => {
    const wobbly = Array.from({ length: 400 }, (_, i) => [Math.round(1500 + 800 * Math.cos(i / 40)), Math.round(2000 + 800 * Math.sin(i / 40))]).flat();
    const strokes = [stroke('a', 'me', 1, wobbly), stroke('b', 'you', 2, [10, 10, 20, 20], { tool: 'marker', c: 5, ws: [40, 60] })];
    const file = encodeDrawing(strokes, { kind: 'page', id: 'mandala' });
    const json = JSON.stringify(file);
    const back = decodeDrawing(JSON.parse(json));
    expect(back.strokes.map((s) => s.id)).toEqual(['a', 'b']);
    expect(back.strokes[1]).toMatchObject({ tool: 'marker', c: 5, ws: [40, 60], p: [10, 10, 20, 20] });
    expect(back.bg).toEqual({ kind: 'page', id: 'mandala' });
    expect(back.strokes[0]!.t0).toBe(0);
    // 400 points of a smooth curve: well under 2 KB once simplified.
    expect(json.length).toBeLessThan(2500);
  });

  it('rescales a file saved on a different board size, and refuses newer formats', () => {
    const back = decodeDrawing({ v: 1, w: 300, h: 400, strokes: [{ id: 'x', by: 'a', tool: 'pen', c: 0, w: 5, p: [150, 200], n: 1, t0: 0, d: 0 }] });
    expect(back.strokes[0]!.p).toEqual([1500, 2000]);
    expect(() => decodeDrawing({ v: 99, strokes: [] })).toThrow(DrawingVersionError);
  });

  it('builds the same path string for every renderer', () => {
    expect(centerPath([0, 0, 100, 0, 100, 100])).toBe('M0 0Q100 0 100 50L100 100');
    expect(centerPath([5, 5])).toBe('M5 5L5.1 5');
    const outline = outlinePath([0, 0, 100, 0, 200, 0], [10, 20, 10]);
    expect(outline.startsWith('M0 5')).toBe(true);
    expect(outline.match(/A/g)).toHaveLength(2);
    expect(outline.endsWith('Z')).toBe(true);
    expect(strokeLook(stroke('e', 'me', 1, [0, 0, 10, 10], { tool: 'eraser', ws: [5, 5] }))).toMatchObject({ erase: true, fill: false });
    expect(strokeLook(stroke('m', 'me', 1, [0, 0, 10, 10], { tool: 'marker' })).alpha).toBeLessThan(1);
  });

  it('groups ink so each eraser only cuts what came before it', () => {
    const s = [
      stroke('a', 'x', 1, [0, 0]),
      stroke('e1', 'x', 2, [0, 0], { tool: 'eraser' }),
      stroke('e2', 'x', 3, [0, 0], { tool: 'eraser' }),
      stroke('b', 'x', 4, [0, 0]),
      stroke('e3', 'x', 5, [0, 0], { tool: 'eraser' }),
      stroke('c', 'x', 6, [0, 0]),
    ];
    const top = inkLayers(s);
    expect(top.ink.map((x) => x.id)).toEqual(['c']);
    expect(top.cut.map((x) => x.id)).toEqual(['e3']);
    expect(top.below!.ink.map((x) => x.id)).toEqual(['b']);
    expect(top.below!.cut.map((x) => x.id)).toEqual(['e1', 'e2']);
    expect(top.below!.below!.ink.map((x) => x.id)).toEqual(['a']);
  });

  it('replays strokes in order at their own pace, squeezing long pauses', () => {
    const s = [stroke('a', 'x', 1, [0, 0, 10, 0, 20, 0, 30, 0], { t0: 0, d: 1000 }), stroke('b', 'x', 2, [0, 0, 5, 5], { t0: 60_000, d: 500 })];
    const t = replayTimeline(s);
    expect(t).toEqual([
      { start: 0, end: 1000 },
      { start: 2200, end: 2700 },
    ]);
    expect(strokesAt(s, 500)[0]!.p).toEqual([0, 0, 10, 0]);
    expect(strokesAt(s, 1500)).toHaveLength(1);
    expect(strokesAt(s, 9999)).toHaveLength(2);
  });

  it('colouring pages are ready-made paths', () => {
    for (const page of COLOURING_PAGES) {
      expect(page.paths.length).toBeGreaterThan(3);
      for (const d of page.paths) expect(d).toMatch(/^M-?\d/);
    }
  });
});

describe('live session', () => {
  // Two authors' events, each in their own order.
  const a: DrawOp[] = [
    { op: 'start', s: { id: 'a1', by: 'alice', tool: 'pen', c: 1, w: 50, p: [0, 0], n: 1, t0: 0 } },
    { op: 'pts', id: 'a1', p: [10, 10, 20, 20] },
    { op: 'end', id: 'a1', d: 300 },
    { op: 'start', s: { id: 'a2', by: 'alice', tool: 'marker', c: 2, w: 120, p: [5, 5], n: 2, t0: 400 } },
    { op: 'end', id: 'a2', d: 100 },
    { op: 'undo', id: 'a2' },
    { op: 'clear', ids: ['a1', 'b1'] },
  ];
  const b: DrawOp[] = [
    { op: 'start', s: { id: 'b1', by: 'bob', tool: 'pen', c: 5, w: 50, p: [100, 100], n: 1, t0: 10 } },
    { op: 'pts', id: 'b1', p: [110, 110] },
    { op: 'end', id: 'b1', d: 200 },
    { op: 'start', s: { id: 'b2', by: 'bob', tool: 'pen', c: 5, w: 50, p: [300, 300], n: 2, t0: 500 } },
    { op: 'pts', id: 'b2', p: [310, 310] },
    { op: 'end', id: 'b2', d: 50 },
  ];

  function interleave(seed: number): DrawOp[] {
    const rand = seeded(seed);
    const out: DrawOp[] = [];
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (j >= b.length || (i < a.length && rand() < 0.5)) out.push(a[i++]!);
      else out.push(b[j++]!);
    }
    return out;
  }

  it('the same events in any interleaving end in the same picture', () => {
    const results = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const state = interleave(seed).reduce(applyDraw, emptyDraw());
      results.add(JSON.stringify(state.strokes.map((s) => [s.id, s.p])));
    }
    expect(results.size).toBe(1);
    const final = a.concat(b).reduce(applyDraw, emptyDraw());
    // b2 started after alice's clear was written, so it survives.
    expect(final.strokes.map((s) => s.id)).toEqual(['b2']);
  });

  it('stacks strokes the same way on both screens', () => {
    const x = applyDraw(applyDraw(emptyDraw(), a[0]!), b[0]!);
    const y = applyDraw(applyDraw(emptyDraw(), b[0]!), a[0]!);
    expect(x.strokes.map((s) => s.id)).toEqual(y.strokes.map((s) => s.id));
  });

  it('a removed stroke cannot come back from a late message', () => {
    let s = applyDraw(emptyDraw(), a[0]!);
    s = applyDraw(s, { op: 'undo', id: 'a1' });
    s = applyDraw(s, a[0]!);
    s = applyDraw(s, a[1]!);
    expect(s.strokes).toHaveLength(0);
  });

  it('ignores junk', () => {
    const s = emptyDraw();
    expect(applyDraw(s, { op: 'pts', id: 'nope', p: [1, 2] })).toBe(s);
    expect(applyDraw(s, { op: 'start', s: { id: 'z', by: 'x', tool: 'pen', c: 0, w: 1, p: [1, 'x' as never], n: 1, t0: 0 } })).toBe(s);
  });

  it('a late joiner gets everything in snapshot parts', () => {
    let full = emptyDraw();
    for (let k = 0; k < 40; k++) {
      full = applyDraw(full, { op: 'start', s: { id: `s${k}`, by: 'alice', tool: 'pen', c: 0, w: 50, p: Array.from({ length: 400 }, (_, i) => i), n: k + 1, t0: 0 } });
    }
    full = applyDraw(full, { op: 'undo', id: 's3' });
    const parts = snapshotParts(full, 20_000);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(JSON.stringify(part).length).toBeLessThan(30_000);
    const joined = parts.reverse().reduce(applyDraw, emptyDraw());
    expect(joined.strokes.map((s) => s.id)).toEqual(full.strokes.map((s) => s.id));
  });
});

describe('DrawHub', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Two hubs joined by an in-memory channel. */
  function pair() {
    const wire: { send: (e: DrawEvent) => void; listeners: ((e: DrawEvent) => void)[] }[] = [];
    const sent: DrawEvent[] = [];
    const make = () => {
      const end = {
        listeners: [] as ((e: DrawEvent) => void)[],
        send: (e: DrawEvent) => {
          sent.push(e);
          for (const other of wire) if (other !== end) other.listeners.forEach((fn) => fn(JSON.parse(JSON.stringify(e))));
        },
      };
      wire.push(end);
      return { send: end.send, on: (fn: (e: DrawEvent) => void) => (end.listeners.push(fn), () => {}) };
    };
    return { alice: new DrawHub('alice', make()), bob: new DrawHub('bob', make()), sent };
  }

  it('sends my stroke in ~40 ms batches and both canvases match', () => {
    const { alice, bob, sent } = pair();
    const mine = alice.session('live');
    const theirs = bob.session('live');
    mine.begin(100, 100, 'pen', 1, 50);
    for (let i = 1; i <= 20; i++) mine.move(100 + i * 10, 100 + i * 10);
    expect(sent.filter((e) => e.op === 'pts')).toHaveLength(0);
    vi.advanceTimersByTime(BATCH_MS);
    expect(sent.filter((e) => e.op === 'pts')).toHaveLength(1);
    mine.move(400, 400);
    mine.finish();
    expect(theirs.snapshot.strokes).toEqual(mine.snapshot.strokes);
    expect(theirs.partnerHere).toBe(true);
  });

  it('undo takes back only my own last stroke', () => {
    const { alice, bob } = pair();
    const mine = alice.session('live');
    const theirs = bob.session('live');
    mine.begin(0, 0, 'pen', 0, 50);
    mine.finish();
    theirs.begin(10, 10, 'pen', 5, 50);
    theirs.finish();
    expect(mine.undo()).toBe(true);
    expect(mine.snapshot.strokes.map((s) => s.by)).toEqual(['bob']);
    expect(theirs.snapshot.strokes.map((s) => s.by)).toEqual(['bob']);
    expect(mine.undo()).toBe(false);
  });

  it('opening a canvas mid-drawing shows what is already there', () => {
    const { alice, bob } = pair();
    const mine = alice.session('live');
    mine.begin(0, 0, 'pen', 0, 50);
    mine.move(500, 500);
    mine.finish();
    mine.setBackground({ kind: 'page', id: 'rangoli' });
    // Bob opens the canvas later and says hello.
    const theirs = bob.session('late');
    theirs.hello();
    expect(theirs.snapshot.strokes).toHaveLength(0);
    const live = bob.session('live');
    live.hello();
    expect(live.snapshot.strokes).toHaveLength(1);
    expect(live.snapshot.bg).toEqual({ kind: 'page', id: 'rangoli' });
  });

  it('shows my partner’s pen and forgets it when they leave', () => {
    const { alice, bob } = pair();
    const theirs = bob.session('live');
    const seen: unknown[] = [];
    theirs.onCursor((c) => seen.push(c && [c.x, c.y]));
    alice.session('live').cursor(1500, 2000);
    alice.session('live').here(false);
    expect(seen).toEqual([[1500, 2000], null]);
  });
});

describe('Draw & Guess: words', () => {
  it('normalises guesses', () => {
    expect(normalizeWord('  Gol Gappa! ')).toBe('golgappa');
    expect(normalizeWord('Café')).toBe('cafe');
  });

  it('matches exactly, close, or not', () => {
    expect(matchGuess('golgappa', 'Golgappa')).toBe('right');
    expect(matchGuess('gol gappa', 'Golgappa')).toBe('right');
    expect(matchGuess('golgapa', 'Golgappa')).toBe('close');
    expect(matchGuess('golgappas', 'Golgappa')).toBe('close');
    expect(matchGuess('pani puri', 'Golgappa')).toBe('wrong');
    expect(matchGuess('cat', 'Car')).toBe('wrong');
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('checks guesses from hashes alone, the same as with the word', () => {
    const salt = 'game:3';
    const secret = secretFor('Golgappa', salt);
    expect(JSON.stringify(secret)).not.toMatch(/golgappa/i);
    for (const g of ['golgappa', 'Gol Gappa', 'golgapa', 'golgappas', 'golgoppa', 'pani puri', 'puri', 'g']) {
      const viaHash = checkSecret(g, secret, salt);
      const plain = matchGuess(g, 'Golgappa');
      expect(viaHash === plain || (plain === 'wrong' && viaHash === 'close')).toBe(true);
    }
    expect(checkSecret('golgoppa', secret, salt)).toBe('close');
    expect(checkSecret('golgappa', secret, 'other')).toBe('wrong');
  });

  it('sha256 matches the standard', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hints: a letter at 20, 40 and 60 seconds, never the whole word', () => {
    expect([0, 19_999, 20_000, 45_000, 79_000].map((t) => hintsShown(t))).toEqual([0, 0, 1, 2, 3]);
    const order = hintOrder('Golgappa', 7);
    expect(order).toHaveLength(2);
    expect(new Set(order).size).toBe(2);
    expect(hintOrder('Cat', 1)).toHaveLength(1);
    expect(secretFor('Auto rickshaw', 's').mask).toBe('____ ________');
    expect(maskWith('____ ________', { 1: 'u', 7: 'c' }).join('')).toBe('_u__ __c_____');
  });

  it('faster guesses and harder words score more, for both of us', () => {
    expect(pointsFor(0, 'easy')).toBe(100);
    expect(pointsFor(TURN_MS, 'easy')).toBe(30);
    expect(pointsFor(TURN_MS + 1, 'easy')).toBe(0);
    expect(pointsFor(10_000, 'hard')).toBeGreaterThan(pointsFor(10_000, 'medium'));
    expect(pointsFor(10_000, 'medium')).toBeGreaterThan(pointsFor(40_000, 'medium'));
  });

  it('offers an easy, a medium and a hard word, not ones we have had, ours when on', () => {
    const rand = seeded(42);
    const picks = pickChoices(['food'], [], [], rand);
    expect(picks.map((w) => w.level)).toEqual(['easy', 'medium', 'hard']);
    expect(picks.every((w) => w.pack === 'food')).toBe(true);
    const ours = ourWords(['Our Goa trip', 'our goa trip', '  ']);
    expect(ours).toHaveLength(1);
    const mixed = pickChoices(['everyday', 'ours'], ours, [], rand);
    expect(mixed[2]!.text).toBe('Our Goa trip');
    const again = pickChoices(['everyday', 'ours'], ours, ['Our Goa trip'], rand);
    expect(again.some((w) => w.text === 'Our Goa trip')).toBe(false);
  });
});

describe('Draw & Guess: game', () => {
  const invite: GameMsg = { k: 'invite', id: 'g1', players: ['alice', 'bob'], packs: ['everyday'], rounds: 6, at: 0 };

  function play(state: GameState | null, msgs: GameMsg[]) {
    return msgs.reduce<GameState | null>((s, m) => gameReducer(s, m), state);
  }

  it('six rounds, roles swap, scores add up, then done', () => {
    let s = play(null, [invite, { k: 'join', id: 'g1', by: 'bob' }]);
    expect(s!.joined).toEqual(['alice', 'bob']);
    let total = 0;
    for (let round = 0; round < 6; round++) {
      const drawer = drawerOf(s!.players, round);
      expect(drawer).toBe(round % 2 ? 'bob' : 'alice');
      const secret = secretFor('Chai', `g1:${round}`);
      const solved = round !== 5;
      const points = solved ? pointsFor(12_000, 'easy') : 0;
      total += points;
      s = play(s, [
        { k: 'choosing', id: 'g1', round, drawer, until: 10_000 },
        { k: 'round', id: 'g1', round, drawer, secret, level: 'easy', pack: 'food', at: 1000, until: 81_000 },
        { k: 'hint', id: 'g1', round, i: 1, ch: 'h' },
        { k: 'guess', id: 'g1', round, by: 'x', text: 'tea', result: 'wrong', at: 5000 },
        { k: 'reveal', id: 'g1', round, word: 'Chai', solved, ms: 12_000, points, at: 13_000 },
      ]);
      expect(s!.phase).toBe('reveal');
      expect(s!.drawer).toBe(drawer);
    }
    s = gameReducer(s, { k: 'done', id: 'g1', score: total });
    expect(s!.phase).toBe('done');
    expect(s!.score).toBe(total);
    expect(s!.results).toHaveLength(6);
    expect(s!.results.filter((r) => r.solved)).toHaveLength(5);
  });

  it('only the drawer’s device knows the word until the reveal', () => {
    let s = play(null, [invite, { k: 'choosing', id: 'g1', round: 0, drawer: 'alice', until: 10_000 }]);
    s = gameReducer(s, { k: 'picked', word: { text: 'Golgappa', pack: 'food', level: 'medium' } });
    expect(s!.word).toBe('Golgappa');
    const other = play(null, [invite, { k: 'choosing', id: 'g1', round: 0, drawer: 'alice', until: 10_000 }]);
    const round: GameMsg = { k: 'round', id: 'g1', round: 0, drawer: 'alice', secret: secretFor('Golgappa', 'g1:0'), level: 'medium', pack: 'food', at: 0, until: TURN_MS };
    expect(gameReducer(other, round)!.word).toBeNull();
    expect(gameReducer(s, round)!.word).toBe('Golgappa');
  });

  it('ignores stale or foreign messages, and a reveal counts once', () => {
    let s = play(null, [invite, { k: 'choosing', id: 'g1', round: 2, drawer: 'alice', until: 0 }]);
    expect(gameReducer(s, { k: 'choosing', id: 'g1', round: 1, drawer: 'bob', until: 0 })).toBe(s);
    expect(gameReducer(s, { k: 'hint', id: 'other', round: 2, i: 0, ch: 'x' })).toBe(s);
    s = gameReducer(s, { k: 'round', id: 'g1', round: 2, drawer: 'alice', secret: secretFor('Sun', 'x'), level: 'easy', pack: 'everyday', at: 0, until: 1 });
    const reveal: GameMsg = { k: 'reveal', id: 'g1', round: 2, word: 'Sun', solved: true, ms: 1, points: 50, at: 0 };
    s = gameReducer(gameReducer(s, reveal), reveal);
    expect(s!.score).toBe(50);
    expect(gameReducer(s, { k: 'leave', id: 'g1', by: 'bob' })!.phase).toBe('left');
  });
});

describe('board units', () => {
  it('is 3:4', () => {
    expect(BOARD_W / BOARD_H).toBe(0.75);
  });
});
