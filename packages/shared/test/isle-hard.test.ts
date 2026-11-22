import { describe, expect, it } from 'vitest';
import {
  apply,
  BANK_EACH,
  emptyHand,
  hardMove,
  newGame,
  RESOURCES,
  TOPOLOGY,
  waitingOn,
  type IsleAction,
  type IsleState,
} from '../src/isle';

const SEATS = [
  { id: 'a', name: 'A', bot: false },
  { id: 'b', name: 'B', bot: false },
  { id: 'x', name: 'Bot 1', bot: true },
  { id: 'y', name: 'Bot 2', bot: true },
];

function ok(s: IsleState, seat: number, a: IsleAction): IsleState {
  const next = apply(s, seat, a);
  if (typeof next === 'string') throw new Error(`${JSON.stringify(a)} by ${seat}: ${next}`);
  return next;
}

/** The opening played by hard bots, then everyone's cards cleared, mid-turn for seat 0. */
function table(seed = 31): IsleState {
  let s = newGame(SEATS, seed);
  while (s.phase === 'setup') {
    const seat = waitingOn(s)[0]!;
    s = ok(s, seat, hardMove(s, seat));
  }
  s = structuredClone(s);
  for (const p of s.players) p.hand = emptyHand();
  for (const r of RESOURCES) s.bank[r] = BANK_EACH;
  s.phase = 'main';
  return s;
}

function deal(s: IsleState, p: number, cards: Partial<Record<(typeof RESOURCES)[number], number>>) {
  for (const r of RESOURCES) {
    s.players[p]!.hand[r] += cards[r] ?? 0;
    s.bank[r] -= cards[r] ?? 0;
  }
}

describe('the hard bot', () => {
  it('opens on rich, mixed corners', () => {
    const s = table();
    for (let p = 0; p < 4; p++) {
      const towns = s.towns.flatMap((t, v) => (t?.p === p ? [v] : []));
      expect(towns).toHaveLength(2);
      const lands = new Set(towns.flatMap((v) => TOPOLOGY.verts[v]!.hexes.map((h) => s.board.terrain[h])));
      expect(lands.size).toBeGreaterThanOrEqual(3);
    }
  });

  it('makes the same move from the same state, quickly', () => {
    const s = table();
    deal(s, 0, { wood: 2, brick: 1, grain: 2, ore: 2, wool: 1 });
    const t = performance.now();
    const a = hardMove(s, 0);
    expect(performance.now() - t).toBeLessThan(100);
    expect(hardMove(structuredClone(s), 0)).toEqual(a);
    expect(typeof apply(s, 0, a)).not.toBe('string');
  });

  it('takes a trade that finishes a city', () => {
    const s = table();
    deal(s, 2, { ore: 3, grain: 1, wool: 3 });
    deal(s, 0, { grain: 2 });
    const t = ok(s, 0, { t: 'offer', give: { grain: 1 }, want: { wool: 1 } });
    expect(hardMove(t, 2)).toEqual({ t: 'reply', yes: true });
  });

  it('won’t feed someone about to win', () => {
    const s = table();
    deal(s, 2, { ore: 3, grain: 1, wool: 3 });
    deal(s, 0, { grain: 2 });
    // Seat 0 on 8 points showing: its two towns made cities, and two more.
    let cities = 0;
    s.towns.forEach((t, v) => {
      if (t?.p === 0) t.city = true;
      else if (!t && cities < 2 && TOPOLOGY.verts[v]!.near.every((o) => !s.towns[o])) {
        s.towns[v] = { p: 0, city: true };
        cities++;
      }
    });
    const t = ok(s, 0, { t: 'offer', give: { grain: 1 }, want: { wool: 1 } });
    expect(hardMove(t, 2)).toEqual({ t: 'reply', yes: false });
  });

  it('never robs its own lands when it has a choice', () => {
    for (const seed of [31, 32, 33, 34, 35]) {
      const s = table(seed);
      s.phase = 'robber';
      s.turn = 2;
      deal(s, 0, { wood: 2 });
      const a = hardMove(s, 2);
      expect(a.t).toBe('robber');
      if (a.t !== 'robber') continue;
      expect(TOPOLOGY.hexes[a.h]!.verts.some((v) => s.towns[v]?.p === 2)).toBe(false);
      expect(typeof apply(s, 2, a)).not.toBe('string');
    }
  });

  it('keeps the cards its plan needs when giving back half', () => {
    const s = table();
    s.phase = 'discard';
    deal(s, 2, { ore: 3, grain: 2, wool: 4, wood: 1 });
    s.owed = [0, 0, 5, 0];
    const a = hardMove(s, 2);
    expect(a.t).toBe('discard');
    if (a.t !== 'discard') return;
    const left = { ...s.players[2]!.hand };
    for (const r of RESOURCES) left[r] -= a.cards[r] ?? 0;
    // Three ore and two grain make a city: those stay.
    expect(left.ore).toBe(3);
    expect(left.grain).toBe(2);
  });
});
