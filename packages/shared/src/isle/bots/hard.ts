/**
 * The hard bot. Each time it's asked for a move it works out a plan: the
 * build that brings points soonest for what it costs (a city, a town spot it
 * can reach, a development card, or the longest road), counted in turns from
 * its hand and what its towns bring in. Everything else serves the plan:
 * bank swaps and offers that bring it closer, discards that keep what it
 * needs, cards played when they pay. It robs the leader, won't feed anyone
 * close to winning, and only reads what a player at the table could see:
 * how many cards each seat holds, not which ones.
 *
 * It's deterministic (state in, move out), so both phones work out the same
 * move for a bot and only one gets saved.
 */

import { PIPS, RESOURCES, TOPOLOGY, type PortKind, type Res } from '../board';
import {
  canPay,
  canRoad,
  canSettle,
  citiesOf,
  citySpots,
  COST,
  handSize,
  longestRoad,
  PIECES,
  points,
  rates,
  roadSpots,
  roadsOf,
  settleSpots,
  settlementsOf,
  SETUP_ORDER,
  shownPoints,
  victims,
  WIN_POINTS,
  type Hand,
  type IsleAction,
  type IsleState,
} from '../rules';

/** What each card is worth to a player in general; grain and ore build cities. */
const WORTH: Record<Res, number> = { wood: 1, brick: 1, wool: 0.75, grain: 1.05, ore: 1.05 };
/** In the opening, wood and brick matter most: they make the first roads and towns. */
const OPENING: Record<Res, number> = { wood: 1.15, brick: 1.15, wool: 0.8, grain: 1, ore: 0.95 };

/** The weights the simulator tunes (test/isle-sim.test.ts). */
export const HARD_TUNE = {
  /** About how many cards make a point. */
  cardsPerPoint: 8,
  /** Each road out to a town spot is a chance someone else takes it first. */
  roadRisk: 0.82,
  roadTurns: 0.35,
  devWorth: 0.5,
  cityWorth: 1,
  /** Play knights whenever free (each steals a card and blocks someone). */
  freeKnights: true,
  // The opening.
  /** How much the first town counts what's likely left for the second. */
  secondLook: 0.8,
  kindsBonus: 1.2,
  numbersBonus: 0.3,
  anyPort: 1.5,
  /** Lean towards wood and brick (1), or count every land the same (0). */
  openingLean: 1,
  /** How much less a second helping of the same land is worth. */
  repeatCut: 0.8,
  /** Build any city or town that's affordable now, even when the plan is something else. */
  grab: false,
  /** Lay roads towards a town spot only once at most this many cards are missing for the town. */
  roadWhenMissing: 9,
};

type Flow = Record<Res, number>;
const zero = (): Flow => ({ wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 });
const chance = (s: IsleState, h: number) => (PIPS[s.board.numbers[h] ?? 0] ?? 0) / 36;

/** What one town on a corner brings in per roll (half under the robber, who moves on). */
function cornerFlow(s: IsleState, v: number, times = 1): Flow {
  const out = zero();
  for (const h of TOPOLOGY.verts[v]!.hexes) {
    const t = s.board.terrain[h]!;
    if (t === 'desert') continue;
    out[t] += chance(s, h) * times * (h === s.robber ? 0.5 : 1);
  }
  return out;
}

/** What a seat brings in per roll, every roll at the table. */
export function income(s: IsleState, p: number): Flow {
  const out = zero();
  s.towns.forEach((t, v) => {
    if (t?.p !== p) return;
    const f = cornerFlow(s, v, t.city ? 2 : 1);
    for (const r of RESOURCES) out[r] += f[r];
  });
  return out;
}

const portAt = (s: IsleState): Map<number, PortKind> => {
  const out = new Map<number, PortKind>();
  for (const port of s.board.ports) for (const v of TOPOLOGY.edges[port.edge]!.v) out.set(v, port.kind);
  return out;
};

/**
 * Roughly how many of its own turns a seat needs before it can pay a cost:
 * what's missing, less what spare cards swap for at the bank, over what comes
 * in (four rolls to a round, plus a share of swappable income).
 */
export function turnsFor(hand: Hand, cost: Partial<Hand>, inc: Flow, rate: Hand): number {
  const short = zero();
  let spare = 0;
  for (const r of RESOURCES) {
    const need = cost[r] ?? 0;
    short[r] = Math.max(0, need - hand[r]);
    spare += Math.floor(Math.max(0, hand[r] - need) / rate[r]);
  }
  // Spend spare swaps on whatever would take longest to come in.
  const slow = (r: Res) => short[r] / Math.max(inc[r], 0.01);
  while (spare > 0) {
    const r = RESOURCES.reduce((a, b) => (slow(b) > slow(a) ? b : a));
    if (short[r] <= 0) break;
    short[r]--;
    spare--;
  }
  let rolls = 0;
  for (const r of RESOURCES) {
    if (!short[r]) continue;
    // What other income could be swapped into this one.
    const swap = RESOURCES.reduce((n, o) => (o === r || cost[o] ? n : n + inc[o] / rate[o]), 0);
    rolls = Math.max(rolls, short[r] / Math.max(inc[r] + swap * 0.5, 0.004));
  }
  return rolls / 4;
}

type Plan =
  | { kind: 'city'; v: number; cost: Partial<Hand>; score: number }
  | { kind: 'settle'; v: number; path: number[]; cost: Partial<Hand>; score: number }
  | { kind: 'dev'; cost: Partial<Hand>; score: number }
  | { kind: 'longest'; path: number[]; cost: Partial<Hand>; score: number };

const addCost = (a: Partial<Hand>, b: Partial<Hand>, times = 1): Partial<Hand> => {
  const out: Partial<Hand> = { ...a };
  for (const r of RESOURCES) if (b[r]) out[r] = (out[r] ?? 0) + b[r]! * times;
  return out;
};

/** How much a flow of cards is worth to this seat: more for lands it lacks. */
function flowWorth(add: Flow, have: Flow): number {
  return RESOURCES.reduce((n, r) => n + add[r] * WORTH[r] * (have[r] < 0.03 ? 1.6 : have[r] < 0.08 ? 1.2 : 1), 0);
}

/** Free corners a seat can reach with up to three new roads, and the roads to get there. */
function reach(s: IsleState, p: number): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const seen = new Map<number, number[]>();
  const queue: number[] = [];
  const passable = (v: number) => !s.towns[v] || s.towns[v]!.p === p;
  s.towns.forEach((t, v) => {
    if (t?.p === p && !seen.has(v)) {
      seen.set(v, []);
      queue.push(v);
    }
  });
  s.roads.forEach((r, e) => {
    if (r !== p) return;
    for (const v of TOPOLOGY.edges[e]!.v) {
      if (!seen.has(v) && passable(v)) {
        seen.set(v, []);
        queue.push(v);
      }
    }
  });
  while (queue.length) {
    const v = queue.shift()!;
    const path = seen.get(v)!;
    if (!s.towns[v] && canSettleFree(s, v)) out.set(v, path);
    if (path.length >= 3 || !passable(v)) continue;
    for (const e of TOPOLOGY.verts[v]!.edges) {
      if (s.roads[e] != null) continue;
      const [a, b] = TOPOLOGY.edges[e]!.v;
      const w = a === v ? b : a;
      if (seen.has(w)) continue;
      seen.set(w, [...path, e]);
      queue.push(w);
    }
  }
  return out;
}

const canSettleFree = (s: IsleState, v: number) =>
  !s.towns[v] && TOPOLOGY.verts[v]!.near.every((o) => !s.towns[o]);

/** Roughly how many more of its own turns the game has left for this seat. */
const horizon = (s: IsleState, p: number) => Math.min(20, Math.max(3, 19 - 1.7 * points(s, p)));

/** The longest-road plan: which roads would take (or keep) the bonus, if two or three do it. */
function longestPlan(s: IsleState, p: number): number[] | null {
  if (roadsOf(s, p) >= PIECES.road) return null;
  const mine = longestRoad(s, p);
  const others = Math.max(...s.players.map((_, o) => (o === p ? 0 : longestRoad(s, o))));
  const holding = s.longest === p;
  if (holding && others < mine - 1) return null;
  const target = holding ? mine + 1 : Math.max(5, others + 1);
  const need = target - mine;
  if (need < 1 || need > 3 || roadsOf(s, p) + need > PIECES.road) return null;
  const t: IsleState = { ...s, roads: s.roads.slice() };
  const path: number[] = [];
  for (let i = 0; i < need; i++) {
    let best = -1;
    let len = -1;
    for (const e of roadSpots(t, p)) {
      t.roads[e] = p;
      const l = longestRoad(t, p);
      t.roads[e] = null;
      if (l > len) {
        len = l;
        best = e;
      }
    }
    if (best < 0) return null;
    t.roads[best] = p;
    path.push(best);
  }
  return longestRoad(t, p) >= target ? path : null;
}

function makePlan(s: IsleState, p: number): Plan | null {
  const me = s.players[p]!;
  const inc = income(s, p);
  const rate = rates(s, p);
  const T = horizon(s, p);
  const plans: Plan[] = [];
  const turns = (cost: Partial<Hand>) => turnsFor(me.hand, cost, inc, rate);
  // Cards to points: about six cards make a point.
  const value = (flow: Flow) => (flowWorth(flow, inc) * 4 * T) / HARD_TUNE.cardsPerPoint;
  const ports = portAt(s);

  if (citiesOf(s, p) < PIECES.city) {
    for (const v of citySpots(s, p)) {
      const gain = HARD_TUNE.cityWorth + value(cornerFlow(s, v));
      plans.push({ kind: 'city', v, cost: COST.city, score: gain / (turns(COST.city) + 0.6) });
    }
  }
  if (settlementsOf(s, p) < PIECES.settlement) {
    const roadsLeft = PIECES.road - roadsOf(s, p);
    for (const [v, path] of reach(s, p)) {
      if (path.length > roadsLeft) continue;
      let gain = 1 + value(cornerFlow(s, v));
      const port = ports.get(v);
      if (port === 'any') gain += 0.35;
      else if (port) gain += Math.min(0.9, inc[port] * 6);
      const cost = addCost(COST.settlement, COST.road, path.length);
      // Every road out is a turn someone else might take the spot.
      const risk = Math.pow(HARD_TUNE.roadRisk, path.length);
      plans.push({ kind: 'settle', v, path, cost, score: (gain * risk) / (turns(cost) + 0.6 + HARD_TUNE.roadTurns * path.length) });
    }
  }
  if (s.devDeck.length) {
    const most = Math.max(...s.players.map((pl, o) => (o === p ? 0 : pl.knights)));
    const army = s.army !== p && me.knights + 1 >= Math.max(3, most + 1) - 1 ? 0.35 : 0;
    const gain = HARD_TUNE.devWorth + army + (settleSpots(s, p).length || reach(s, p).size ? 0 : 0.25);
    plans.push({ kind: 'dev', cost: COST.dev, score: gain / (turns(COST.dev) + 0.6) });
  }
  const road = longestPlan(s, p);
  if (road) {
    const cost = addCost({}, COST.road, road.length);
    const gain = s.longest === p ? 1.6 : s.longest != null ? 2.6 : 2;
    plans.push({ kind: 'longest', path: road, cost, score: gain / (turns(cost) + 0.6 + 0.2 * road.length) });
  }
  return plans.length ? plans.reduce((a, b) => (b.score > a.score ? b : a)) : null;
}

/** How many turns the plan's cost is away with a given hand. */
function planTurns(s: IsleState, p: number, plan: Plan | null, hand: Hand): number {
  if (!plan) return 0;
  return turnsFor(hand, plan.cost, income(s, p), rates(s, p));
}

// ---- The opening -----------------------------------------------------------

function openingValue(s: IsleState, v: number, have: Flow, ports: Map<number, PortKind>): number {
  const hexes = TOPOLOGY.verts[v]!.hexes;
  let score = 0;
  const kinds = new Set<Res>();
  const nums = new Set<number>();
  for (const h of hexes) {
    const t = s.board.terrain[h]!;
    if (t === 'desert') continue;
    kinds.add(t);
    nums.add(s.board.numbers[h]!);
    const lean = 1 + (OPENING[t] - 1) * HARD_TUNE.openingLean;
    score += PIPS[s.board.numbers[h]!]! * lean * (have[t] > 0 ? HARD_TUNE.repeatCut : 1.15);
  }
  score += kinds.size * HARD_TUNE.kindsBonus + nums.size * HARD_TUNE.numbersBonus;
  const port = ports.get(v);
  if (port === 'any') score += HARD_TUNE.anyPort;
  else if (port) {
    const pips = hexes.reduce((n, h) => n + (s.board.terrain[h] === port ? PIPS[s.board.numbers[h]!]! : 0), 0);
    score += 0.35 * (pips + have[port] * 36);
  }
  return score;
}

function openingTown(s: IsleState, p: number): number {
  const ports = portAt(s);
  const have = income(s, p);
  const spots = settleSpots(s, p);
  const base = (v: number) => openingValue(s, v, have, ports);
  if (s.setupStep >= 8) {
    // The second town: what fits with the first, plus the cards it pays now.
    const pay = (v: number) =>
      TOPOLOGY.verts[v]!.hexes.reduce((n, h) => {
        const t = s.board.terrain[h]!;
        return t === 'desert' ? n : n + (t === 'wood' || t === 'brick' ? 0.6 : 0.4);
      }, 0);
    return spots.reduce((a, b) => (base(b) + pay(b) > base(a) + pay(a) ? b : a));
  }
  // The first town: also think about what will be left for the second.
  const seat = SETUP_ORDER.indexOf(p as 0 | 1 | 2 | 3);
  const between = 6 - 2 * seat;
  const top = spots.slice().sort((a, b) => base(b) - base(a)).slice(0, 10);
  let best = top[0]!;
  let bestScore = -Infinity;
  for (const v of top) {
    const taken = new Set<number>([v, ...TOPOLOGY.verts[v]!.near]);
    const free = (w: number) => !taken.has(w) && canSettle(s, p, w);
    const order = spots.filter(free).sort((a, b) => base(b) - base(a));
    for (let i = 0, picked = 0; i < order.length && picked < between; i++) {
      const w = order[i]!;
      if (taken.has(w)) continue;
      taken.add(w);
      for (const o of TOPOLOGY.verts[w]!.near) taken.add(o);
      picked++;
    }
    const after = cornerFlow(s, v);
    const second = spots
      .filter((w) => !taken.has(w))
      .reduce((m, w) => Math.max(m, openingValue(s, w, after, ports)), 0);
    const score = base(v) + HARD_TUNE.secondLook * second;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

/** The opening road: towards the best free corner two sides away. */
function openingRoad(s: IsleState, p: number): number {
  const ports = portAt(s);
  const have = income(s, p);
  let best = roadSpots(s, p)[0]!;
  let top = -Infinity;
  for (const e of roadSpots(s, p)) {
    const [a, b] = TOPOLOGY.edges[e]!.v;
    const far = a === s.lastTown ? b : a;
    let score = -1;
    for (const w of TOPOLOGY.verts[far]!.near) {
      if (w !== s.lastTown && canSettleFree(s, w)) score = Math.max(score, openingValue(s, w, have, ports));
    }
    // Leading off the island's edge goes nowhere.
    score += TOPOLOGY.verts[far]!.hexes.length;
    if (score > top) {
      top = score;
      best = e;
    }
  }
  return best;
}

// ---- Robber, discards, trades ------------------------------------------------

/** How much this seat wants to slow someone down: the leader most. */
const threat = (s: IsleState, p: number, o: number) => (o === p ? 0 : Math.pow(1 + shownPoints(s, o), 2));

function robberMove(s: IsleState, p: number): IsleAction {
  let best = -1;
  let top = -Infinity;
  TOPOLOGY.hexes.forEach((hex, h) => {
    if (h === s.robber) return;
    let score = 0;
    for (const v of hex.verts) {
      const t = s.towns[v];
      if (!t) continue;
      const w = chance(s, h) * 36 * (t.city ? 2 : 1);
      score += t.p === p ? -w * 30 : w * threat(s, p, t.p);
    }
    // Somebody to steal from is worth something too.
    score += victims(s, p, h).reduce((m, o) => Math.max(m, threat(s, p, o)), 0) * 0.5;
    if (score > top) {
      top = score;
      best = h;
    }
  });
  const can = victims(s, p, best);
  const from = can.length
    ? can.reduce((a, b) => (stealWorth(s, p, b) > stealWorth(s, p, a) ? b : a))
    : null;
  return { t: 'robber', h: best, from };
}

const stealWorth = (s: IsleState, p: number, o: number) =>
  threat(s, p, o) * 0.2 + handSize(s.players[o]!.hand);

function discardMove(s: IsleState, p: number): IsleAction {
  const plan = makePlan(s, p);
  const hand = { ...s.players[p]!.hand };
  const cards: Partial<Hand> = {};
  for (let n = s.owed[p]!; n > 0; n--) {
    let pick: Res = 'wool';
    let least = Infinity;
    for (const r of RESOURCES) {
      if (!hand[r]) continue;
      hand[r]--;
      // The cost of losing it to the plan, and a little for the card itself.
      const loss = planTurns(s, p, plan, hand) * 3 + WORTH[r] * 0.1 - hand[r] * 0.05;
      hand[r]++;
      if (loss < least) {
        least = loss;
        pick = r;
      }
    }
    hand[pick]--;
    cards[pick] = (cards[pick] ?? 0) + 1;
  }
  return { t: 'discard', cards };
}

/** Whether this seat says yes to the offer on the table. */
function replyTo(s: IsleState, p: number): boolean {
  const o = s.offer!;
  const me = s.players[p]!;
  const after = { ...me.hand };
  for (const r of RESOURCES) after[r] += (o.give[r] ?? 0) - (o.want[r] ?? 0);
  if (RESOURCES.some((r) => after[r] < 0)) return false;
  const lead = shownPoints(s, o.from);
  if (lead >= WIN_POINTS - 2) return false;
  const plan = makePlan(s, p);
  const gain = planTurns(s, p, plan, me.hand) - planTurns(s, p, plan, after);
  const cards = handSize(o.give) - handSize(o.want);
  // Help someone way ahead only for a real gain.
  const bar = lead >= Math.max(...s.players.map((_, q) => (q === o.from ? 0 : shownPoints(s, q)))) + 2 ? 0.5 : 0.08;
  return gain > bar || (gain >= 0 && cards > 0 && lead < WIN_POINTS - 3);
}

/** A one-for-one (or two-for-one) offer to the table for a card the plan is short of. */
function offerFor(s: IsleState, p: number, plan: Plan): IsleAction | null {
  // One offer a turn is plenty.
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i]!;
    if (e.k === 'offer' && e.p === p) return null;
    if (e.k === 'roll' || e.k === 'end') break;
  }
  const hand = s.players[p]!.hand;
  const short = RESOURCES.filter((r) => hand[r] < (plan.cost[r] ?? 0));
  const missing = short.reduce((n, r) => n + (plan.cost[r] ?? 0) - hand[r], 0);
  if (!short.length || missing > 2) return null;
  const spare = RESOURCES.filter((r) => hand[r] > (plan.cost[r] ?? 0)).sort(
    (a, b) => hand[b] - (plan.cost[b] ?? 0) - (hand[a] - (plan.cost[a] ?? 0)),
  );
  if (!spare.length) return null;
  const want = short[0]!;
  const extra = hand[spare[0]!] - (plan.cost[spare[0]!] ?? 0);
  return { t: 'offer', give: { [spare[0]!]: extra >= 3 ? 2 : 1 }, want: { [want]: 1 } };
}

/** Cards still missing for a cost, counting nothing as swapped. */
const missing = (hand: Hand, cost: Partial<Hand>) =>
  RESOURCES.reduce((n, r) => n + Math.max(0, (cost[r] ?? 0) - hand[r]), 0);

/** A bank swap of cards the plan doesn't need for one it's missing, slowest-coming first. */
function bankFor(s: IsleState, p: number, plan: Plan): IsleAction | null {
  const hand = s.players[p]!.hand;
  const rate = rates(s, p);
  const inc = income(s, p);
  const need = RESOURCES.filter((r) => hand[r] < (plan.cost[r] ?? 0) && s.bank[r] > 0).sort(
    (a, b) => ((plan.cost[b] ?? 0) - hand[b]) / Math.max(inc[b], 0.01) - ((plan.cost[a] ?? 0) - hand[a]) / Math.max(inc[a], 0.01),
  );
  if (!need.length) return null;
  // Only when the swap leaves the rest within reach soon; no point swapping towards something far off.
  if (missing(hand, plan.cost) > 3) return null;
  const spare = RESOURCES.filter((r) => hand[r] - (plan.cost[r] ?? 0) >= rate[r]).sort(
    (a, b) => hand[b] - (plan.cost[b] ?? 0) - rate[b] - (hand[a] - (plan.cost[a] ?? 0) - rate[a]),
  );
  return spare.length ? { t: 'bank', give: spare[0]!, get: need[0]! } : null;
}

// ---- Cards ---------------------------------------------------------------------

/** Takes largest army with one more knight, or is close to it. */
function armyNow(s: IsleState, p: number): boolean {
  if (s.army === p) return false;
  const k = s.players[p]!.knights + 1;
  return k >= 3 && (s.army == null || k > s.players[s.army]!.knights);
}

const robbed = (s: IsleState, p: number) =>
  TOPOLOGY.hexes[s.robber]!.verts.some((v) => s.towns[v]?.p === p) && chance(s, s.robber) >= 3 / 36;

/** What the others probably hold of a card: their hand sizes, split by what they bring in. */
function guessHeld(s: IsleState, p: number, r: Res): number {
  let n = 0;
  s.players.forEach((pl, o) => {
    if (o === p) return;
    const inc = income(s, o);
    const total = RESOURCES.reduce((m, x) => m + inc[x], 0);
    n += handSize(pl.hand) * (total > 0 ? inc[r] / total : 0.2);
  });
  return n;
}

function cardMove(s: IsleState, p: number, plan: Plan | null): IsleAction | null {
  const me = s.players[p]!;
  if (s.playedDev) return null;
  if (me.dev.includes('knight') && (armyNow(s, p) || robbed(s, p))) return { t: 'knight' };
  if (me.dev.includes('monopoly')) {
    const need = (r: Res) => (plan && me.hand[r] < (plan.cost[r] ?? 0) ? 1.4 : 1);
    const r = RESOURCES.reduce((a, b) => (guessHeld(s, p, b) * need(b) > guessHeld(s, p, a) * need(a) ? b : a));
    if (guessHeld(s, p, r) >= 3.5) return { t: 'monopoly', r };
  }
  if (me.dev.includes('plenty') && plan) {
    const hand = { ...me.hand };
    const pick: Res[] = [];
    for (let i = 0; i < 2; i++) {
      const r =
        RESOURCES.find((x) => hand[x] < (plan.cost[x] ?? 0) && s.bank[x] > pick.filter((y) => y === x).length) ??
        RESOURCES.reduce((a, b) => (s.bank[b] > s.bank[a] ? b : a));
      hand[r]++;
      pick.push(r);
    }
    const saved = planTurns(s, p, plan, me.hand) - planTurns(s, p, plan, hand);
    if (canPay(hand, plan.cost) || saved >= 1) return { t: 'plenty', a: pick[0]!, b: pick[1]! };
  }
  if (
    me.dev.includes('roads') &&
    plan &&
    (plan.kind === 'longest' || (plan.kind === 'settle' && plan.path.length > 0)) &&
    roadsOf(s, p) < PIECES.road
  ) {
    return { t: 'roads' };
  }
  // A knight that isn't needed yet still moves the robber onto the leader late on.
  if (me.dev.includes('knight') && (HARD_TUNE.freeKnights || points(s, p) >= 7)) return { t: 'knight' };
  return null;
}

// ---- The turn -----------------------------------------------------------------

function buildNow(s: IsleState, p: number, plan: Plan): IsleAction | null {
  const hand = s.players[p]!.hand;
  switch (plan.kind) {
    case 'city':
      return canPay(hand, COST.city) ? { t: 'city', v: plan.v } : null;
    case 'dev':
      return canPay(hand, COST.dev) ? { t: 'buy' } : null;
    case 'settle':
      if (!plan.path.length) return canPay(hand, COST.settlement) ? { t: 'settle', v: plan.v } : null;
      // The next road out; the town follows when the cards come.
      if (
        canPay(hand, COST.road) &&
        canRoad(s, p, plan.path[0]!) &&
        missing(hand, plan.cost) <= HARD_TUNE.roadWhenMissing
      ) {
        return { t: 'road', e: plan.path[0]! };
      }
      return null;
    case 'longest':
      return canPay(hand, COST.road) && canRoad(s, p, plan.path[0]!) ? { t: 'road', e: plan.path[0]! } : null;
  }
}

/** Anything that wins right now. */
function winNow(s: IsleState, p: number): IsleAction | null {
  const left = WIN_POINTS - points(s, p);
  const hand = s.players[p]!.hand;
  if (left <= 1) {
    if (citiesOf(s, p) < PIECES.city && canPay(hand, COST.city) && citySpots(s, p).length) {
      return { t: 'city', v: citySpots(s, p)[0]! };
    }
    if (settlementsOf(s, p) < PIECES.settlement && canPay(hand, COST.settlement) && settleSpots(s, p).length) {
      return { t: 'settle', v: settleSpots(s, p)[0]! };
    }
  }
  if (left <= 2 && !s.playedDev && s.players[p]!.dev.includes('knight') && armyNow(s, p)) return { t: 'knight' };
  return null;
}

/** The best city or town that can be paid for right now. */
function grabAny(s: IsleState, p: number): IsleAction | null {
  const hand = s.players[p]!.hand;
  const inc = income(s, p);
  const best = (spots: number[]) =>
    spots.reduce((a, b) => (flowWorth(cornerFlow(s, b), inc) > flowWorth(cornerFlow(s, a), inc) ? b : a));
  const cities = citySpots(s, p);
  if (cities.length && citiesOf(s, p) < PIECES.city && canPay(hand, COST.city)) return { t: 'city', v: best(cities) };
  const spots = settleSpots(s, p);
  if (spots.length && settlementsOf(s, p) < PIECES.settlement && canPay(hand, COST.settlement)) {
    return { t: 'settle', v: best(spots) };
  }
  return null;
}

/** Spending down before ending with too many cards in hand, where a 7 would cost half. */
function spendDown(s: IsleState, p: number): IsleAction | null {
  const hand = s.players[p]!.hand;
  if (handSize(hand) <= 7) return null;
  const cities = citySpots(s, p);
  if (cities.length && citiesOf(s, p) < PIECES.city && canPay(hand, COST.city)) return { t: 'city', v: cities[0]! };
  const spots = settleSpots(s, p);
  if (spots.length && settlementsOf(s, p) < PIECES.settlement && canPay(hand, COST.settlement)) {
    return { t: 'settle', v: spots[0]! };
  }
  if (s.devDeck.length && canPay(hand, COST.dev)) return { t: 'buy' };
  if (roadsOf(s, p) < PIECES.road && canPay(hand, COST.road)) {
    const goTo = [...reach(s, p).values()].find((path) => path.length > 0);
    if (goTo) return { t: 'road', e: goTo[0]! };
  }
  return null;
}

/** The hard bot's move for a seat the game is waiting on. */
export function hardMove(s: IsleState, p: number): IsleAction {
  if (s.phase === 'setup') {
    return s.setupStep % 2 === 0 ? { t: 'settle', v: openingTown(s, p) } : { t: 'road', e: openingRoad(s, p) };
  }
  if (s.phase === 'discard') return discardMove(s, p);
  if (s.offer && s.offer.from !== p) return { t: 'reply', yes: replyTo(s, p) };
  if (s.offer) {
    const yes = s.offer.replies
      .flatMap((r, o) => (r === true ? [o] : []))
      .sort((a, b) => shownPoints(s, a) - shownPoints(s, b));
    return yes.length ? { t: 'accept', with: yes[0]! } : { t: 'cancel' };
  }
  if (s.phase === 'robber') return robberMove(s, p);

  const me = s.players[p]!;
  if (s.phase === 'roll') {
    if (!s.playedDev && me.dev.includes('knight') && (robbed(s, p) || armyNow(s, p))) return { t: 'knight' };
    return { t: 'roll' };
  }
  if (s.phase === 'roads') {
    const plan = makePlan(s, p);
    const e =
      plan && (plan.kind === 'settle' || plan.kind === 'longest') && plan.path.length && canRoad(s, p, plan.path[0]!)
        ? plan.path[0]!
        : ([...reach(s, p).values()].find((path) => path.length > 0)?.[0] ?? roadSpots(s, p)[0]!);
    return { t: 'road', e };
  }

  // The main part of the turn.
  const win = winNow(s, p);
  if (win) return win;
  const plan = makePlan(s, p);
  const card = cardMove(s, p, plan);
  if (card) return card;
  if (HARD_TUNE.grab) {
    const grab = grabAny(s, p);
    if (grab) return grab;
  }
  if (plan) {
    const build = buildNow(s, p, plan);
    if (build) return build;
    const swap = bankFor(s, p, plan);
    if (swap) return swap;
    const offer = offerFor(s, p, plan);
    if (offer) return offer;
  }
  return spendDown(s, p) ?? { t: 'end' };
}
