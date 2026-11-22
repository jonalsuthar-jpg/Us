/**
 * A plain, greedy player: it builds the dearest thing it can afford, trades
 * its spare cards with the bank towards the next thing, and robs whoever has
 * the most. It's the yardstick the hard bot is tuned against, and a safe
 * fallback that always makes a legal move.
 */

import { PIPS, RESOURCES, TOPOLOGY, type Res } from '../board';
import {
  canPay,
  citySpots,
  COST,
  handSize,
  PIECES,
  rates,
  roadSpots,
  roadsOf,
  settleSpots,
  settlementsOf,
  citiesOf,
  shownPoints,
  victims,
  waitingOn,
  type Hand,
  type IsleAction,
  type IsleState,
} from '../rules';

const hexPips = (s: IsleState, h: number) => PIPS[s.board.numbers[h] ?? 0] ?? 0;

/** How good a corner is for a town: its dots, with a little extra for different lands. */
export function spotValue(s: IsleState, v: number): number {
  const hexes = TOPOLOGY.verts[v]!.hexes;
  const kinds = new Set(hexes.map((h) => s.board.terrain[h]).filter((t) => t !== 'desert'));
  return hexes.reduce((n, h) => n + hexPips(s, h), 0) + kinds.size;
}

const empty = (s: IsleState, v: number) =>
  !s.towns[v] && TOPOLOGY.verts[v]!.near.every((o) => !s.towns[o]);

/** The road that heads best towards a free corner. */
function bestRoad(s: IsleState, p: number): number | null {
  let best: number | null = null;
  let top = 0;
  for (const e of roadSpots(s, p)) {
    for (const v of TOPOLOGY.edges[e]!.v) {
      if (s.towns[v] && s.towns[v]!.p !== p) continue;
      let score = empty(s, v) ? spotValue(s, v) : 0;
      for (const o of TOPOLOGY.verts[v]!.near) if (empty(s, o)) score = Math.max(score, spotValue(s, o) * 0.6);
      if (score > top) {
        top = score;
        best = e;
      }
    }
  }
  return best;
}

/** What it's saving for next. */
function goal(s: IsleState, p: number): Partial<Hand> | null {
  if (citySpots(s, p).length && citiesOf(s, p) < PIECES.city) return COST.city;
  if (settleSpots(s, p).length && settlementsOf(s, p) < PIECES.settlement) return COST.settlement;
  if (roadsOf(s, p) < PIECES.road && bestRoad(s, p) != null) return COST.road;
  if (s.devDeck.length) return COST.dev;
  return null;
}

/** A bank swap that gets closer to the goal without spending what it needs. */
function bankSwap(s: IsleState, p: number, want: Partial<Hand>): IsleAction | null {
  const hand = s.players[p]!.hand;
  const rate = rates(s, p);
  const need = RESOURCES.find((r) => hand[r] < (want[r] ?? 0) && s.bank[r] > 0);
  if (!need) return null;
  const spare = RESOURCES.filter((r) => r !== need && hand[r] - (want[r] ?? 0) >= rate[r]).sort(
    (a, b) => hand[b] - (want[b] ?? 0) - (hand[a] - (want[a] ?? 0)),
  )[0];
  return spare ? { t: 'bank', give: spare, get: need } : null;
}

function discardFor(s: IsleState, p: number): IsleAction {
  const hand = { ...s.players[p]!.hand };
  const cards: Partial<Hand> = {};
  for (let n = s.owed[p]!; n > 0; n--) {
    const r = RESOURCES.reduce((a, b) => (hand[b] > hand[a] ? b : a));
    hand[r]--;
    cards[r] = (cards[r] ?? 0) + 1;
  }
  return { t: 'discard', cards };
}

function robberFor(s: IsleState, p: number): IsleAction {
  let best = { h: -1, score: -Infinity };
  TOPOLOGY.hexes.forEach((hex, h) => {
    if (h === s.robber) return;
    let score = 0;
    for (const v of hex.verts) {
      const t = s.towns[v];
      if (!t) continue;
      const w = hexPips(s, h) * (t.city ? 2 : 1);
      score += t.p === p ? -2 * w : w * (1 + shownPoints(s, t.p) / 5);
    }
    if (score > best.score) best = { h, score };
  });
  const can = victims(s, p, best.h);
  const from = can.length
    ? can.reduce((a, b) => (handSize(s.players[b]!.hand) > handSize(s.players[a]!.hand) ? b : a))
    : null;
  return { t: 'robber', h: best.h, from };
}

function setupMove(s: IsleState, p: number): IsleAction {
  if (s.setupStep % 2 === 0) {
    const spots = settleSpots(s, p);
    return { t: 'settle', v: spots.reduce((a, b) => (spotValue(s, b) > spotValue(s, a) ? b : a)) };
  }
  return { t: 'road', e: bestRoad(s, p) ?? roadSpots(s, p)[0]! };
}

/** The greedy bot's move for a seat the game is waiting on. */
export function greedyMove(s: IsleState, p: number): IsleAction {
  if (s.phase === 'setup') return setupMove(s, p);
  if (s.phase === 'discard') return discardFor(s, p);
  const me = s.players[p]!;

  if (s.offer && s.offer.from !== p) {
    const o = s.offer;
    const after = { ...me.hand };
    for (const r of RESOURCES) after[r] += (o.give[r] ?? 0) - (o.want[r] ?? 0);
    const g = goal(s, p);
    const helps =
      RESOURCES.every((r) => after[r] >= 0) &&
      g != null &&
      canPay(after, g) &&
      !canPay(me.hand, g) &&
      shownPoints(s, o.from) < 8;
    return { t: 'reply', yes: helps };
  }
  if (s.offer) {
    const yes = s.offer.replies.findIndex((r) => r === true);
    return yes >= 0 ? { t: 'accept', with: yes } : { t: 'cancel' };
  }

  if (s.phase === 'robber') return robberFor(s, p);
  if (s.phase === 'roll') {
    const blocked = TOPOLOGY.hexes[s.robber]!.verts.some((v) => s.towns[v]?.p === p);
    if (blocked && !s.playedDev && me.dev.includes('knight')) return { t: 'knight' };
    return { t: 'roll' };
  }
  if (s.phase === 'roads') return { t: 'road', e: bestRoad(s, p) ?? roadSpots(s, p)[0]! };

  // Main part of the turn.
  const cities = citySpots(s, p);
  if (cities.length && citiesOf(s, p) < PIECES.city && canPay(me.hand, COST.city)) {
    return { t: 'city', v: cities.reduce((a, b) => (spotValue(s, b) > spotValue(s, a) ? b : a)) };
  }
  const spots = settleSpots(s, p);
  if (spots.length && settlementsOf(s, p) < PIECES.settlement && canPay(me.hand, COST.settlement)) {
    return { t: 'settle', v: spots.reduce((a, b) => (spotValue(s, b) > spotValue(s, a) ? b : a)) };
  }
  if (!s.playedDev) {
    if (me.dev.includes('knight')) return { t: 'knight' };
    if (me.dev.includes('roads') && bestRoad(s, p) != null) return { t: 'roads' };
    const g = goal(s, p);
    if (me.dev.includes('plenty') && g) {
      const need = RESOURCES.filter((r) => me.hand[r] < (g[r] ?? 0) && s.bank[r] > 0);
      const a = need[0] ?? 'ore';
      const b = need[1] ?? need[0] ?? 'grain';
      if (s.bank[a] > 0 && s.bank[b] > (a === b ? 1 : 0)) return { t: 'plenty', a, b };
    }
    if (me.dev.includes('monopoly')) {
      const r = RESOURCES.reduce((a, b) => (sumOthers(s, p, b) > sumOthers(s, p, a) ? b : a));
      if (sumOthers(s, p, r) >= 3) return { t: 'monopoly', r };
    }
  }
  const g = goal(s, p);
  if (g === COST.road && canPay(me.hand, COST.road)) {
    const e = bestRoad(s, p);
    if (e != null) return { t: 'road', e };
  }
  if (g && !canPay(me.hand, g)) {
    const swap = bankSwap(s, p, g);
    if (swap) return swap;
  }
  if (s.devDeck.length && canPay(me.hand, COST.dev) && (g !== COST.settlement || !spots.length)) {
    return { t: 'buy' };
  }
  if (roadsOf(s, p) < PIECES.road && canPay(me.hand, COST.road) && !spots.length) {
    const e = bestRoad(s, p);
    if (e != null) return { t: 'road', e };
  }
  return { t: 'end' };
}

const sumOthers = (s: IsleState, p: number, r: Res) =>
  s.players.reduce((n, pl, o) => (o === p ? n : n + pl.hand[r]), 0);

/** Whose move the game needs next and what the greedy bot would do there. */
export function nextGreedy(s: IsleState): { seat: number; action: IsleAction } | null {
  const seat = waitingOn(s)[0];
  return seat == null ? null : { seat, action: greedyMove(s, seat) };
}
