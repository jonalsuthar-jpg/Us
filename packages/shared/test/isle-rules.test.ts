import { describe, expect, it } from 'vitest';
import {
  apply,
  boardProblem,
  BANK_EACH,
  cardTotals,
  emptyHand,
  generateBoard,
  greedyMove,
  longestRoad,
  newGame,
  nextGreedy,
  points,
  rates,
  RESOURCES,
  roadSpots,
  settleSpots,
  TOPOLOGY,
  victims,
  waitingOn,
  WIN_POINTS,
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

/** A game played (by the greedy bot) to the end of the opening. */
function afterSetup(seed = 7): IsleState {
  let s = newGame(SEATS, seed);
  while (s.phase === 'setup') {
    const m = nextGreedy(s)!;
    s = ok(s, m.seat, m.action);
  }
  return s;
}

/** A finished opening with every hand and the bank reset, for setting up a position by hand. */
function cleanMain(seed = 7): IsleState {
  const s = structuredClone(afterSetup(seed));
  for (const p of s.players) p.hand = emptyHand();
  for (const r of RESOURCES) s.bank[r] = BANK_EACH;
  s.phase = 'main';
  return s;
}

describe('isle board', () => {
  it('has the right shape', () => {
    expect(TOPOLOGY.hexes).toHaveLength(19);
    expect(TOPOLOGY.verts).toHaveLength(54);
    expect(TOPOLOGY.edges).toHaveLength(72);
    expect(TOPOLOGY.coast).toHaveLength(30);
    for (const v of TOPOLOGY.verts) expect(v.near.length).toBeGreaterThanOrEqual(2);
  });

  it('is fair and different every game', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 1000; seed++) {
      const b = generateBoard(seed);
      expect(boardProblem(b)).toBeNull();
      expect(b.terrain.filter((t) => t === 'desert')).toHaveLength(1);
      expect(b.numbers.filter((n) => n == null)).toHaveLength(1);
      expect(new Set(b.ports.map((p) => p.edge)).size).toBe(9);
      seen.add(JSON.stringify(b));
    }
    expect(seen.size).toBe(1000);
    expect(generateBoard(42)).toEqual(generateBoard(42));
  }, 20000);
});

describe('isle opening', () => {
  it('goes 1 2 3 4 4 3 2 1, a town then a road', () => {
    let s = newGame(SEATS, 1);
    expect(waitingOn(s)).toEqual([0]);
    expect(apply(s, 1, { t: 'settle', v: 0 })).toBe('not your turn');
    expect(apply(s, 0, { t: 'road', e: 0 })).toBe('place a town');
    const seen: number[] = [];
    while (s.phase === 'setup') {
      if (s.setupStep % 2 === 0) seen.push(waitingOn(s)[0]!);
      const m = nextGreedy(s)!;
      s = ok(s, m.seat, m.action);
    }
    expect(seen).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect(s.phase).toBe('roll');
    expect(s.towns.filter(Boolean)).toHaveLength(8);
    expect(s.roads.filter((r) => r != null)).toHaveLength(8);
  });

  it('keeps towns apart and roads by the new town', () => {
    let s = newGame(SEATS, 2);
    const v = 10;
    s = ok(s, 0, { t: 'settle', v });
    const far = TOPOLOGY.edges.findIndex((e) => !e.v.includes(v));
    expect(apply(s, 0, { t: 'road', e: far })).toBe('the road has to touch the new town');
    s = ok(s, 0, { t: 'road', e: TOPOLOGY.verts[v]!.edges[0]! });
    for (const o of TOPOLOGY.verts[v]!.near) expect(apply(s, 1, { t: 'settle', v: o })).toBe('can’t build there');
  });

  it('pays the second town its lands', () => {
    const s = afterSetup(3);
    for (let p = 0; p < 4; p++) {
      const towns = s.log.flatMap((e) => (e.k === 'settle' && e.p === p ? [e.v] : []));
      const want = emptyHand();
      for (const h of TOPOLOGY.verts[towns[1]!]!.hexes) {
        const t = s.board.terrain[h]!;
        if (t !== 'desert') want[t]++;
      }
      expect(s.players[p]!.hand).toEqual(want);
    }
    expect(cardTotals(s)).toEqual({ wood: 19, brick: 19, wool: 19, grain: 19, ore: 19 });
  });
});

describe('isle turns', () => {
  it('rolls the same dice on both phones', () => {
    const s = afterSetup(11);
    const a = ok(s, 0, { t: 'roll' });
    const b = ok(s, 0, { t: 'roll' });
    expect(a.dice).toEqual(b.dice);
    expect(apply(a, 0, { t: 'roll' })).toBe('already rolled');
    expect(apply(s, 1, { t: 'roll' })).toBe('not your turn');
  });

  it('never changes the state it is given', () => {
    const s = afterSetup(12);
    const copy = structuredClone(s);
    ok(s, 0, { t: 'roll' });
    expect(s).toEqual(copy);
  });

  it('pays towns and cities on their number, not under the robber', () => {
    const s = cleanMain(5);
    const h = s.board.numbers.findIndex((n) => n != null);
    const res = s.board.terrain[h] as (typeof RESOURCES)[number];
    for (const v of TOPOLOGY.verts.keys()) s.towns[v] = null;
    const [v1, , v3] = TOPOLOGY.hexes[h]!.verts;
    s.towns[v1!] = { p: 1, city: false };
    s.towns[v3!] = { p: 2, city: true };
    s.robber = s.board.terrain.indexOf('desert');
    s.phase = 'roll';
    // Find a seed draw that rolls this hex's number.
    for (let rc = 0; rc < 500; rc++) {
      const t = structuredClone(s);
      t.rc = rc;
      const after = ok(t, 0, { t: 'roll' });
      if (after.dice![0] + after.dice![1] !== s.board.numbers[h]) continue;
      expect(after.players[1]!.hand[res]).toBeGreaterThanOrEqual(1);
      expect(after.players[2]!.hand[res]).toBeGreaterThanOrEqual(2);
      t.robber = h;
      const blocked = ok(t, 0, { t: 'roll' });
      expect(blocked.players[1]!.hand[res]).toBe(after.players[1]!.hand[res] - 1);
      return;
    }
    throw new Error('never rolled it');
  });

  it('a 7: give back half, move the robber, steal one', () => {
    const s = cleanMain(6);
    s.phase = 'roll';
    s.players[1]!.hand = { wood: 4, brick: 2, wool: 2, grain: 1, ore: 0 };
    s.bank.wood -= 4;
    s.bank.brick -= 2;
    s.bank.wool -= 2;
    s.bank.grain -= 1;
    let t: IsleState | null = null;
    for (let rc = 0; rc < 500 && !t; rc++) {
      const u = structuredClone(s);
      u.rc = rc;
      const r = ok(u, 0, { t: 'roll' });
      if (r.dice![0] + r.dice![1] === 7) t = r;
    }
    expect(t!.phase).toBe('discard');
    expect(t!.owed).toEqual([0, 4, 0, 0]);
    expect(waitingOn(t!)).toEqual([1]);
    expect(apply(t!, 1, { t: 'discard', cards: { wood: 3 } })).toBe('wrong cards');
    t = ok(t!, 1, { t: 'discard', cards: { wood: 2, brick: 2 } });
    expect(t.phase).toBe('robber');
    const h = TOPOLOGY.hexes.findIndex((_, i) => i !== t!.robber && victims(t!, 0, i).includes(1));
    if (h >= 0) {
      expect(apply(t, 0, { t: 'robber', h, from: null })).toBe('can’t steal from them');
      const u = ok(t, 0, { t: 'robber', h, from: 1 });
      expect(RESOURCES.reduce((n, r) => n + u.players[0]!.hand[r], 0)).toBe(1);
      expect(u.phase).toBe('main');
      expect(cardTotals(u)).toEqual(cardTotals(s));
    }
  });

  it('gives harbour rates and trades with the bank', () => {
    const s = cleanMain(8);
    const port = s.board.ports.find((x) => x.kind !== 'any')!;
    const v = TOPOLOGY.edges[port.edge]!.v[0];
    s.towns[v] = { p: 0, city: false };
    const res = port.kind as (typeof RESOURCES)[number];
    expect(rates(s, 0)[res]).toBe(2);
    s.players[0]!.hand[res] = 2;
    s.bank[res] -= 2;
    const other = RESOURCES.find((r) => r !== res)!;
    const t = ok(s, 0, { t: 'bank', give: res, get: other });
    expect(t.players[0]!.hand[other]).toBe(1);
    expect(t.players[0]!.hand[res]).toBe(0);
    expect(apply(t, 0, { t: 'bank', give: res, get: other })).toBe('not enough cards');
  });

  it('trades between players once someone says yes', () => {
    const s = cleanMain(9);
    s.players[0]!.hand.wood = 2;
    s.players[2]!.hand.ore = 1;
    s.bank.wood -= 2;
    s.bank.ore -= 1;
    let t = ok(s, 0, { t: 'offer', give: { wood: 2 }, want: { ore: 1 } });
    expect(waitingOn(t).sort()).toEqual([1, 2, 3]);
    expect(apply(t, 0, { t: 'end' })).toBe('finish the trade first');
    expect(apply(t, 1, { t: 'reply', yes: true })).toBe('you don’t have those cards');
    t = ok(t, 1, { t: 'reply', yes: false });
    t = ok(t, 2, { t: 'reply', yes: true });
    t = ok(t, 3, { t: 'reply', yes: false });
    expect(apply(t, 0, { t: 'accept', with: 1 })).toBe('they haven’t said yes');
    t = ok(t, 0, { t: 'accept', with: 2 });
    expect(t.players[0]!.hand.ore).toBe(1);
    expect(t.players[2]!.hand.wood).toBe(2);
    expect(t.offer).toBeNull();
  });

  it('holds new cards back until the next turn', () => {
    const s = cleanMain(10);
    s.players[0]!.hand = { wood: 0, brick: 0, wool: 1, grain: 1, ore: 1 };
    s.devDeck.push('knight');
    let t = ok(s, 0, { t: 'buy' });
    expect(t.players[0]!.fresh).toEqual(['knight']);
    expect(apply(t, 0, { t: 'knight' })).toBe('no knight to play');
    t = ok(t, 0, { t: 'end' });
    expect(t.players[0]!.dev).toEqual(['knight']);
  });

  it('counts the longest road, and another town breaks it', () => {
    const s = cleanMain(13);
    s.towns = s.towns.map(() => null);
    s.roads = s.roads.map(() => null);
    // A run of six sides round hex 9 (the middle).
    const ring = TOPOLOGY.hexes[9]!.edges;
    for (const e of ring.slice(0, 5)) s.roads[e] = 0;
    expect(longestRoad(s, 0)).toBe(5);
    s.roads[ring[5]!] = 0;
    expect(longestRoad(s, 0)).toBe(6);
    // A town of seat 1 on the far corner splits the loop at that point only.
    s.towns[TOPOLOGY.hexes[9]!.verts[3]!] = { p: 1, city: false };
    expect(longestRoad(s, 0)).toBe(6);
    s.roads[ring[5]!] = null;
    expect(longestRoad(s, 0)).toBe(3);
  });

  it('offers only legal spots', () => {
    const s = afterSetup(14);
    for (let p = 0; p < 4; p++) {
      for (const e of roadSpots(s, p)) expect(s.roads[e]).toBeNull();
      for (const v of settleSpots(s, p)) expect(s.towns[v]).toBeNull();
    }
  });
});

describe('isle full games', () => {
  it('greedy bots play hundreds of games to a winner with no illegal move', () => {
    let wins = 0;
    let turns = 0;
    for (let seed = 1; seed <= 150; seed++) {
      let s = newGame(SEATS, seed * 7919);
      let moves = 0;
      while (s.phase !== 'over' && s.turnNo < 400) {
        const m = nextGreedy(s)!;
        const next = apply(s, m.seat, m.action);
        if (typeof next === 'string') throw new Error(`seed ${seed}: ${JSON.stringify(m)} ${next}`);
        s = next;
        if (++moves > 20000) throw new Error(`seed ${seed} stuck in ${s.phase}`);
      }
      const totals = cardTotals(s);
      for (const r of RESOURCES) expect(totals[r]).toBe(BANK_EACH);
      if (s.phase === 'over') {
        wins++;
        turns += s.turnNo;
        expect(points(s, s.winner!)).toBeGreaterThanOrEqual(WIN_POINTS);
      }
      expect(JSON.stringify(s).length).toBeLessThan(20000);
    }
    console.log(`greedy: ${wins}/150 finished, ${(turns / wins).toFixed(1)} turns on average`);
    expect(wins).toBeGreaterThanOrEqual(148);
    expect(turns / wins).toBeLessThan(120);
  }, 60000);

  it('a bot always has a move the game accepts', () => {
    const s = afterSetup(21);
    for (let p = 0; p < 4; p++) {
      const t = structuredClone(s);
      t.turn = p;
      expect(typeof apply(t, p, greedyMove(t, p))).not.toBe('string');
    }
  });
});
