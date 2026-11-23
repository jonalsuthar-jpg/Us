import { describe, expect, it } from 'vitest';
import {
  ballAt,
  ballLands,
  bedReady,
  chessMove,
  chessStatus,
  chessTargets,
  chessTurn,
  dinnerDone,
  dinnerStep,
  giftsWaiting,
  LUDO_DONE,
  ludoMove,
  ludoMovable,
  ludoRoll,
  ludoWinner,
  newChess,
  newLudo,
  newTicTacToe,
  nextUnlock,
  seekPhase,
  throwTo,
  ticTacToeMove,
  ticTacToeWinner,
  unlocked,
  warmth,
  waterBed,
  type Bed,
  type Dinner,
  type Ludo,
} from '../src/house/fun';

describe('tic-tac-toe', () => {
  it('takes turns and finds a winner', () => {
    let s = newTicTacToe('a', 'b');
    expect(ticTacToeMove(s, 'b', 0)).toBeNull();
    for (const [who, cell] of [['a', 0], ['b', 3], ['a', 1], ['b', 4], ['a', 2]] as const) s = ticTacToeMove(s, who, cell)!;
    expect(ticTacToeWinner(s.b)).toBe('x');
    expect(ticTacToeMove(s, 'b', 8)).toBeNull();
  });
  it('calls a full board a draw', () => {
    expect(ticTacToeWinner('xoxxoooxx')).toBe('draw');
  });
});

describe('chess', () => {
  it('plays legal moves in turn, and knows checkmate', () => {
    let g = newChess('w', 'b');
    expect(chessTurn(g)).toBe('w');
    expect(chessMove(g, 'b', 'e7', 'e5')).toBeNull();
    expect(chessMove(g, 'w', 'e2', 'e5')).toBeNull();
    expect(chessTargets(g, 'e2').sort()).toEqual(['e3', 'e4']);
    for (const [who, f, t] of [['w', 'f2', 'f3'], ['b', 'e7', 'e5'], ['w', 'g2', 'g4'], ['b', 'd8', 'h4']] as const) g = chessMove(g, who, f, t)!;
    expect(chessStatus(g)).toMatchObject({ over: true, winner: 'b', text: 'Checkmate' });
  });
});

describe('ludo', () => {
  it('needs a six to come out, and rolls again on a six', () => {
    let s = newLudo('a', 'b');
    s = ludoRoll(s, 'a', 3)!;
    expect(s.turn).toBe(1);
    s = ludoRoll(s, 'b', 6)!;
    expect(ludoMovable(s)).toEqual([0, 1]);
    s = ludoMove(s, 'b', 0)!;
    expect(s.pos[1][0]).toBe(0);
    expect(s.turn).toBe(1);
  });
  it('sends a token home when landed on, but not on a star', () => {
    const s: Ludo = { players: ['a', 'b'], pos: [[3, -1], [16, -1]], turn: 0, dice: 1 };
    // b's 16 is square (16 + 14) % 28 = 2 on the loop; a moves 3 → 4 (square 4): no hit.
    expect(ludoMove(s, 'a', 0)!.pos[1][0]).toBe(16);
    const hit: Ludo = { players: ['a', 'b'], pos: [[1, -1], [16, -1]], turn: 0, dice: 1 };
    expect(ludoMove(hit, 'a', 0)!.pos[1][0]).toBe(-1);
  });
  it('wins with both tokens home', () => {
    const s: Ludo = { players: ['a', 'b'], pos: [[LUDO_DONE, LUDO_DONE - 2], [-1, -1]], turn: 0, dice: 2 };
    expect(ludoWinner(ludoMove(s, 'a', 1)!)).toBe('a');
  });
});

describe('hide and seek, treasure, ball', () => {
  it('goes from hiding to seeking to done', () => {
    const at = new Date('2026-11-22T10:00:00Z');
    const s = { hider: 'a', seeker: 'b', at: at.toISOString() };
    expect(seekPhase(s, new Date(at.getTime() + 5_000))).toBe('hide');
    expect(seekPhase(s, new Date(at.getTime() + 60_000))).toBe('seek');
    expect(seekPhase({ ...s, found: true }, at)).toBe('done');
  });
  it('gets warmer closer', () => {
    expect(warmth(1)).toBe('Burning hot!');
    expect(warmth(20)).toBe('Freezing');
  });
  it('throws an arc that lands where it was aimed', () => {
    const t = throwTo('a', [0, 1.4, 0], [4, 2], 0);
    const land = ballLands(t);
    const [x, y, z] = ballAt(t, land);
    expect(x).toBeCloseTo(4, 1);
    expect(z).toBeCloseTo(2, 1);
    expect(y).toBeCloseTo(0.12, 2);
    expect(ballAt(t, land / 2)[1]).toBeGreaterThan(1.4);
  });
});

describe('gifts, the garden, unlocks, dinner', () => {
  it('shows me gifts left for me, not mine, and lets flowers wilt', () => {
    const now = new Date('2026-11-22T10:00:00Z');
    const g = [
      { kind: 'box' as const, by: 'b', at: now.toISOString() },
      { kind: 'flowers' as const, by: 'b', at: new Date(now.getTime() - 4 * 86_400_000).toISOString() },
      { kind: 'heart' as const, by: 'a', at: now.toISOString() },
      { kind: 'lamp' as const, by: 'b', at: now.toISOString(), opened: true },
    ];
    expect(giftsWaiting(g, 'a', now).map((x) => x.kind)).toEqual(['box']);
  });
  it('grows a bed a step a watered day', () => {
    let b: Bed = { crop: 'carrot', days: [] };
    for (const d of ['2026-11-20', '2026-11-20', '2026-11-21', '2026-11-22']) b = waterBed(b, d);
    expect(b.days).toHaveLength(3);
    expect(bedReady(b)).toBe(true);
  });
  it('unlocks with the days together', () => {
    const paired = '2026-10-01T00:00:00Z';
    const now = new Date('2026-11-05T00:00:00Z');
    expect([...unlocked(paired, now)]).toEqual(['fire_pit', 'garden_beds', 'hot_tub']);
    expect(nextUnlock(paired, now)).toEqual({ label: 'A telescope on the balcony', inDays: 65 });
  });
  it('takes dinner steps in turn', () => {
    let d: Dinner = { recipe: 'pasta', step: 0, first: 'a', second: 'b' };
    expect(dinnerStep(d, 'b')).toBeNull();
    for (const who of ['a', 'b', 'a', 'b']) d = dinnerStep(d, who)!;
    expect(dinnerDone(d)).toBe(true);
  });
});

describe('house: cooking with what we have', () => {
  it('needs bread for breakfast, spices for paneer, vegetables for parathas', async () => {
    const { RECIPES, recipeBlocked } = await import('../src/house/fun');
    const empty = { bread: false, spices: 0, veg: 0 };
    expect(recipeBlocked('pasta', empty, 20)).toBeNull();
    expect(recipeBlocked('dal', empty, 20)).toBeNull();
    expect(recipeBlocked('breakfast', empty, 8)).toMatch(/bread/);
    expect(recipeBlocked('breakfast', { ...empty, bread: true }, 8)).toBeNull();
    expect(recipeBlocked('breakfast', { ...empty, bread: true }, 19)).toMatch(/morning/);
    expect(recipeBlocked('paneer', empty, 20)).toMatch(/spices/);
    expect(recipeBlocked('paneer', { ...empty, spices: 1 }, 20)).toBeNull();
    expect(recipeBlocked('paratha', empty, 20)).toMatch(/vegetables/);
    // Everything we cook is vegetarian.
    const words = Object.values(RECIPES).flatMap((r) => [r.label, ...r.steps]).join(' ').toLowerCase();
    for (const w of ['chicken', 'fish', 'meat', 'mutton', 'egg', 'prawn', 'beef', 'pork']) expect(words).not.toContain(w);
  });
});

describe('house: park cricket', () => {
  it('scores by timing', async () => {
    const { cricketShot } = await import('../src/house/fun');
    expect(cricketShot(-0.03)).toEqual({ runs: 6, out: false });
    expect(cricketShot(0.05)).toEqual({ runs: 4, out: false });
    expect(cricketShot(-0.2)).toEqual({ runs: 2, out: false });
    expect(cricketShot(-0.38)).toEqual({ runs: 1, out: false });
    expect(cricketShot(0.3)).toEqual({ runs: 0, out: true });
    expect(cricketShot(-0.6)).toEqual({ runs: 0, out: true });
  });
});
