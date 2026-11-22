/**
 * Isle's rules as pure functions: the whole game is one JSON state, and
 * apply(state, seat, action) gives the next state or says why not. Both
 * phones run the same moves through it and land on the same state, dice and
 * all: every random draw comes from the game's seed and a counter kept in
 * the state (randomAt), so nothing random needs to be sent.
 *
 * Four seats, first to 10 points. Seat order is shuffled from the seed, so
 * anyone can go first.
 */

import { mulberry32, randomAt, shuffled } from '../rng';
import { generateBoard, RESOURCES, TOPOLOGY, type Board, type PortKind, type Res } from './board';

export type Hand = Record<Res, number>;
export type Dev = 'knight' | 'vp' | 'roads' | 'plenty' | 'monopoly';

export const WIN_POINTS = 10;
export const BANK_EACH = 19;
export const PIECES = { road: 15, settlement: 5, city: 4 } as const;

export const COST: Record<'road' | 'settlement' | 'city' | 'dev', Partial<Hand>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  dev: { wool: 1, grain: 1, ore: 1 },
};

export const DEV_BAG: readonly Dev[] = [
  ...Array<Dev>(14).fill('knight'),
  ...Array<Dev>(5).fill('vp'),
  'roads',
  'roads',
  'plenty',
  'plenty',
  'monopoly',
  'monopoly',
];

/** Snake order for the opening: 1 2 3 4 4 3 2 1, a town then a road each time. */
export const SETUP_ORDER = [0, 1, 2, 3, 3, 2, 1, 0] as const;

export interface Player {
  id: string;
  name: string;
  bot: boolean;
  hand: Hand;
  /** Development cards ready to play. */
  dev: Dev[];
  /** Bought this turn: they can't be played until the next one. */
  fresh: Dev[];
  knights: number;
  /** For the end screen. */
  got: number;
}

export interface Building {
  p: number;
  city: boolean;
}

export type Phase =
  | 'setup' // opening placements
  | 'roll' // start of a turn: roll (or play a knight first)
  | 'discard' // a 7: everyone over 7 cards gives back half
  | 'robber' // move the robber and steal
  | 'main' // build, trade, play cards, end the turn
  | 'roads' // placing the two free roads of a road-building card
  | 'over';

export interface Offer {
  from: number;
  give: Partial<Hand>;
  want: Partial<Hand>;
  /** Each seat's answer: null until they say. */
  replies: (boolean | null)[];
}

export type IsleEvent =
  | { k: 'start'; p: number }
  | { k: 'settle' | 'city'; p: number; v: number }
  | { k: 'road'; p: number; e: number }
  | { k: 'roll'; p: number; d: [number, number] }
  | { k: 'gain'; p: number; cards: Partial<Hand> }
  | { k: 'discard'; p: number; n: number }
  | { k: 'robber'; p: number; h: number }
  | { k: 'steal'; p: number; from: number }
  | { k: 'buy'; p: number }
  | { k: 'play'; p: number; card: Dev }
  | { k: 'monopoly'; p: number; r: Res; n: number }
  | { k: 'bank'; p: number; give: Res; n: number; get: Res }
  | { k: 'offer'; p: number }
  | { k: 'trade'; p: number; with: number }
  | { k: 'longest' | 'army'; p: number | null }
  | { k: 'end'; p: number }
  | { k: 'win'; p: number };

export interface IsleState {
  v: 1;
  seed: number;
  /** How many random draws so far. */
  rc: number;
  board: Board;
  robber: number;
  /** One entry per corner. */
  towns: (Building | null)[];
  /** One entry per side: the seat whose road it is. */
  roads: (number | null)[];
  players: Player[];
  bank: Hand;
  devDeck: Dev[];
  turn: number;
  turnNo: number;
  phase: Phase;
  /** Opening: which placement we're on (0 to 15: even a town, odd its road). */
  setupStep: number;
  /** Opening: the town just placed, which the road must touch. */
  lastTown: number | null;
  dice: [number, number] | null;
  /** How many cards each seat still has to give back on a 7. */
  owed: number[];
  /** Where to go back to after the robber: before the roll (a knight) or after. */
  afterRobber: 'roll' | 'main';
  playedDev: boolean;
  freeRoads: number;
  offer: Offer | null;
  longest: number | null;
  army: number | null;
  winner: number | null;
  /** How often each total came up (index 2 to 12). */
  rolls: number[];
  /** The latest happenings, newest last; n counts every event ever, for animations. */
  log: IsleEvent[];
  n: number;
  /** Moves made so far: both phones and the server line up on it. */
  mv: number;
  /** The ids of the latest moves, so a move that's already in isn't made twice. */
  recent: string[];
}

export type IsleAction =
  | { t: 'settle'; v: number }
  | { t: 'road'; e: number }
  | { t: 'city'; v: number }
  | { t: 'roll' }
  | { t: 'discard'; cards: Partial<Hand> }
  | { t: 'robber'; h: number; from: number | null }
  | { t: 'buy' }
  | { t: 'knight' }
  | { t: 'roads' }
  | { t: 'plenty'; a: Res; b: Res }
  | { t: 'monopoly'; r: Res }
  | { t: 'bank'; give: Res; get: Res }
  | { t: 'offer'; give: Partial<Hand>; want: Partial<Hand> }
  | { t: 'reply'; yes: boolean }
  | { t: 'accept'; with: number }
  | { t: 'cancel' }
  | { t: 'end' };

export interface Seat {
  id: string;
  name: string;
  bot: boolean;
}

const LOG_KEEP = 40;
const RECENT_KEEP = 32;
/** Keeps the game's draws apart from the board's, which use the seed as it is. */
const GAME_STREAM = 0x9e3779b9;

export const emptyHand = (): Hand => ({ wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 });
export const handSize = (h: Partial<Hand>) => RESOURCES.reduce((n, r) => n + (h[r] ?? 0), 0);
export const canPay = (h: Hand, cost: Partial<Hand>) => RESOURCES.every((r) => h[r] >= (cost[r] ?? 0));

function pay(h: Hand, cost: Partial<Hand>, into?: Hand) {
  for (const r of RESOURCES) {
    const n = cost[r] ?? 0;
    h[r] -= n;
    if (into) into[r] += n;
  }
}

/** A new game: a fresh island from the seed and the four seats in a shuffled order. */
export function newGame(seats: Seat[], seed: number): IsleState {
  if (seats.length !== 4) throw new Error('isle needs four seats');
  const random = mulberry32(seed ^ GAME_STREAM);
  const board = generateBoard(seed);
  const order = shuffled(seats, random);
  const s: IsleState = {
    v: 1,
    seed,
    rc: 0,
    board,
    robber: board.terrain.indexOf('desert'),
    towns: TOPOLOGY.verts.map(() => null),
    roads: TOPOLOGY.edges.map(() => null),
    players: order.map((seat) => ({
      id: seat.id,
      name: seat.name,
      bot: seat.bot,
      hand: emptyHand(),
      dev: [],
      fresh: [],
      knights: 0,
      got: 0,
    })),
    bank: { wood: BANK_EACH, brick: BANK_EACH, wool: BANK_EACH, grain: BANK_EACH, ore: BANK_EACH },
    devDeck: shuffled(DEV_BAG, random),
    turn: 0,
    turnNo: 0,
    phase: 'setup',
    setupStep: 0,
    lastTown: null,
    dice: null,
    owed: [0, 0, 0, 0],
    afterRobber: 'main',
    playedDev: false,
    freeRoads: 0,
    offer: null,
    longest: null,
    army: null,
    winner: null,
    rolls: Array<number>(13).fill(0),
    log: [],
    n: 0,
    mv: 0,
    recent: [],
  };
  note(s, { k: 'start', p: 0 });
  return s;
}

export const seatOf = (s: IsleState, id: string) => s.players.findIndex((p) => p.id === id);

function note(s: IsleState, e: IsleEvent) {
  s.log.push(e);
  if (s.log.length > LOG_KEEP) s.log.splice(0, s.log.length - LOG_KEEP);
  s.n++;
}

function draw(s: IsleState): number {
  return randomAt(s.seed ^ GAME_STREAM, 1000 + s.rc++);
}

// ---- What's where -------------------------------------------------------

export const settlementsOf = (s: IsleState, p: number) => s.towns.filter((t) => t?.p === p && !t.city).length;
export const citiesOf = (s: IsleState, p: number) => s.towns.filter((t) => t?.p === p && t.city).length;
export const roadsOf = (s: IsleState, p: number) => s.roads.filter((r) => r === p).length;

/** Points everyone can see (hidden victory cards left out). */
export function shownPoints(s: IsleState, p: number): number {
  return (
    settlementsOf(s, p) + 2 * citiesOf(s, p) + (s.longest === p ? 2 : 0) + (s.army === p ? 2 : 0)
  );
}

export const points = (s: IsleState, p: number) =>
  shownPoints(s, p) + [...s.players[p]!.dev, ...s.players[p]!.fresh].filter((d) => d === 'vp').length;

/** A town can go on an empty corner with no town one side away. */
function spacious(s: IsleState, v: number): boolean {
  return !s.towns[v] && TOPOLOGY.verts[v]!.near.every((o) => !s.towns[o]);
}

export function canSettle(s: IsleState, p: number, v: number): boolean {
  if (!spacious(s, v)) return false;
  if (s.phase === 'setup') return true;
  return TOPOLOGY.verts[v]!.edges.some((e) => s.roads[e] === p);
}

export function canRoad(s: IsleState, p: number, e: number): boolean {
  if (s.roads[e] != null) return false;
  if (s.phase === 'setup') return s.lastTown != null && TOPOLOGY.edges[e]!.v.includes(s.lastTown);
  return TOPOLOGY.edges[e]!.v.some((v) => {
    const t = s.towns[v];
    if (t) return t.p === p;
    // Through an empty corner, joining one of our roads.
    return TOPOLOGY.verts[v]!.edges.some((o) => o !== e && s.roads[o] === p);
  });
}

export const settleSpots = (s: IsleState, p: number) =>
  TOPOLOGY.verts.flatMap((_, v) => (canSettle(s, p, v) ? [v] : []));
export const roadSpots = (s: IsleState, p: number) =>
  TOPOLOGY.edges.flatMap((_, e) => (canRoad(s, p, e) ? [e] : []));
export const citySpots = (s: IsleState, p: number) =>
  s.towns.flatMap((t, v) => (t?.p === p && !t.city ? [v] : []));

/** The best bank rate for each resource: 4, or 3 or 2 with a harbour. */
export function rates(s: IsleState, p: number): Hand {
  const out: Hand = { wood: 4, brick: 4, wool: 4, grain: 4, ore: 4 };
  for (const port of s.board.ports) {
    if (!TOPOLOGY.edges[port.edge]!.v.some((v) => s.towns[v]?.p === p)) continue;
    for (const r of RESOURCES) out[r] = Math.min(out[r], port.kind === 'any' ? 3 : port.kind === r ? 2 : 4);
  }
  return out;
}

export const harboursOf = (s: IsleState, p: number): PortKind[] =>
  s.board.ports.filter((port) => TOPOLOGY.edges[port.edge]!.v.some((v) => s.towns[v]?.p === p)).map((x) => x.kind);

/** The longest run of a seat's roads, where another seat's town breaks the run. */
export function longestRoad(s: IsleState, p: number): number {
  const mine = s.roads.flatMap((r, e) => (r === p ? [e] : []));
  if (!mine.length) return 0;
  const used = new Set<number>();
  let best = 0;
  const walk = (v: number, len: number) => {
    best = Math.max(best, len);
    const t = s.towns[v];
    if (len > 0 && t && t.p !== p) return;
    for (const e of TOPOLOGY.verts[v]!.edges) {
      if (s.roads[e] !== p || used.has(e)) continue;
      used.add(e);
      const [a, b] = TOPOLOGY.edges[e]!.v;
      walk(a === v ? b : a, len + 1);
      used.delete(e);
    }
  };
  const ends = new Set(mine.flatMap((e) => TOPOLOGY.edges[e]!.v));
  for (const v of ends) walk(v, 0);
  return best;
}

function updateLongest(s: IsleState) {
  const lens = s.players.map((_, p) => longestRoad(s, p));
  const holder = s.longest;
  const top = Math.max(...lens);
  let next: number | null;
  if (holder != null && lens[holder]! >= 5 && lens[holder] === top) next = holder;
  else {
    const leaders = lens.flatMap((l, p) => (l === top ? [p] : []));
    next = top >= 5 && leaders.length === 1 ? leaders[0]! : null;
  }
  if (next !== holder) {
    s.longest = next;
    note(s, { k: 'longest', p: next });
  }
}

function updateArmy(s: IsleState, p: number) {
  const k = s.players[p]!.knights;
  if (k < 3 || s.army === p) return;
  if (s.army != null && s.players[s.army]!.knights >= k) return;
  s.army = p;
  note(s, { k: 'army', p });
}

function checkWin(s: IsleState) {
  if (s.phase === 'over' || s.phase === 'setup') return;
  if (points(s, s.turn) >= WIN_POINTS) {
    s.winner = s.turn;
    s.phase = 'over';
    s.offer = null;
    note(s, { k: 'win', p: s.turn });
  }
}

// ---- Dice and resources ---------------------------------------------------

function produce(s: IsleState, total: number) {
  const owed = s.players.map(() => emptyHand());
  TOPOLOGY.hexes.forEach((hex, h) => {
    if (s.board.numbers[h] !== total || h === s.robber) return;
    const res = s.board.terrain[h] as Res;
    for (const v of hex.verts) {
      const t = s.towns[v];
      if (t) owed[t.p]![res] += t.city ? 2 : 1;
    }
  });
  for (const r of RESOURCES) {
    const want = owed.reduce((n, h) => n + h[r], 0);
    if (want <= s.bank[r]) continue;
    // Not enough in the bank: nobody gets any, unless only one seat is owed.
    const who = owed.flatMap((h, p) => (h[r] ? [p] : []));
    for (const p of who) owed[p]![r] = who.length === 1 ? s.bank[r] : 0;
  }
  owed.forEach((h, p) => {
    if (!handSize(h)) return;
    give(s, p, h);
    note(s, { k: 'gain', p, cards: trim(h) });
  });
}

function give(s: IsleState, p: number, h: Partial<Hand>) {
  const pl = s.players[p]!;
  for (const r of RESOURCES) {
    const n = h[r] ?? 0;
    pl.hand[r] += n;
    s.bank[r] -= n;
    pl.got += n;
  }
}

const trim = (h: Partial<Hand>): Partial<Hand> =>
  Object.fromEntries(RESOURCES.flatMap((r) => (h[r] ? [[r, h[r]]] : [])));

function goodHand(h: unknown): h is Partial<Hand> {
  if (!h || typeof h !== 'object') return false;
  return Object.entries(h).every(
    ([r, n]) => (RESOURCES as readonly string[]).includes(r) && Number.isInteger(n) && (n as number) >= 0,
  );
}

/** Who robbing hex h could steal from. */
export function victims(s: IsleState, p: number, h: number): number[] {
  const out = new Set<number>();
  for (const v of TOPOLOGY.hexes[h]!.verts) {
    const t = s.towns[v];
    if (t && t.p !== p && handSize(s.players[t.p]!.hand) > 0) out.add(t.p);
  }
  return [...out].sort((a, b) => a - b);
}

/** Seats the game is waiting for right now. */
export function waitingOn(s: IsleState): number[] {
  if (s.phase === 'over') return [];
  if (s.phase === 'setup') return [SETUP_ORDER[Math.floor(s.setupStep / 2) % 8]!];
  if (s.phase === 'discard') return s.owed.flatMap((n, p) => (n > 0 ? [p] : []));
  if (s.offer && s.offer.replies.some((r, p) => p !== s.offer!.from && r === null)) {
    return s.offer.replies.flatMap((r, p) => (p !== s.offer!.from && r === null ? [p] : []));
  }
  return [s.turn];
}

// ---- Moves ----------------------------------------------------------------

/**
 * The next state after a seat's move, or why it can't be made. Never changes
 * the state given. The id (any short string) is kept in recent, so the same
 * move arriving twice can be spotted.
 */
export function apply(prev: IsleState, seat: number, a: IsleAction, id?: string): IsleState | string {
  if (prev.phase === 'over') return 'the game is over';
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) return 'not at the table';
  if (!a || typeof a !== 'object') return 'not a move';
  const s = structuredClone(prev);
  const why = step(s, seat, a);
  if (why) return why;
  checkWin(s);
  s.mv++;
  if (id) {
    s.recent.push(id);
    if (s.recent.length > RECENT_KEEP) s.recent.splice(0, s.recent.length - RECENT_KEEP);
  }
  return s;
}

function step(s: IsleState, p: number, a: IsleAction): string | null {
  const me = s.players[p]!;
  if (s.phase === 'setup') return setupStep(s, p, a);

  if (a.t === 'discard') {
    if (s.phase !== 'discard' || !s.owed[p]) return 'nothing to give back';
    if (!goodHand(a.cards) || handSize(a.cards) !== s.owed[p] || !canPay(me.hand, a.cards)) return 'wrong cards';
    pay(me.hand, a.cards, s.bank);
    note(s, { k: 'discard', p, n: s.owed[p]! });
    s.owed[p] = 0;
    if (s.owed.every((n) => !n)) s.phase = 'robber';
    return null;
  }

  if (a.t === 'reply') {
    const o = s.offer;
    if (!o || o.from === p || o.replies[p] !== null) return 'no offer to answer';
    if (a.yes && !canPay(me.hand, o.want as Hand)) return 'you don’t have those cards';
    o.replies[p] = a.yes;
    return null;
  }

  if (p !== s.turn) return 'not your turn';
  if (s.phase === 'discard') return 'waiting for cards to be given back';

  switch (a.t) {
    case 'roll': {
      if (s.phase !== 'roll') return 'already rolled';
      const d: [number, number] = [1 + Math.floor(draw(s) * 6), 1 + Math.floor(draw(s) * 6)];
      const total = d[0] + d[1];
      s.dice = d;
      s.rolls[total]!++;
      note(s, { k: 'roll', p, d });
      if (total === 7) {
        s.owed = s.players.map((pl) => (handSize(pl.hand) > 7 ? Math.floor(handSize(pl.hand) / 2) : 0));
        s.afterRobber = 'main';
        s.phase = s.owed.some((n) => n) ? 'discard' : 'robber';
      } else {
        produce(s, total);
        s.phase = 'main';
      }
      return null;
    }

    case 'robber': {
      if (s.phase !== 'robber') return 'not moving the robber';
      if (!Number.isInteger(a.h) || a.h < 0 || a.h >= TOPOLOGY.hexes.length || a.h === s.robber) {
        return 'the robber has to move';
      }
      const can = victims(s, p, a.h);
      if (can.length ? !can.includes(a.from as number) : a.from != null) return 'can’t steal from them';
      s.robber = a.h;
      note(s, { k: 'robber', p, h: a.h });
      if (a.from != null) {
        const theirs = s.players[a.from]!.hand;
        const pile = RESOURCES.flatMap((r) => Array<Res>(theirs[r]).fill(r));
        const r = pile[Math.floor(draw(s) * pile.length)]!;
        theirs[r]--;
        me.hand[r]++;
        note(s, { k: 'steal', p, from: a.from });
      }
      s.phase = s.afterRobber;
      return null;
    }

    case 'knight': {
      if (s.phase !== 'roll' && s.phase !== 'main') return 'not now';
      if (s.playedDev || !me.dev.includes('knight')) return 'no knight to play';
      if (s.offer) return 'answer the trade first';
      useDev(s, p, 'knight');
      me.knights++;
      updateArmy(s, p);
      s.afterRobber = s.phase === 'roll' ? 'roll' : 'main';
      s.phase = 'robber';
      return null;
    }

    case 'road': {
      if (s.phase === 'roads') {
        if (!canRoad(s, p, a.e)) return 'can’t build there';
        s.roads[a.e] = p;
        note(s, { k: 'road', p, e: a.e });
        updateLongest(s);
        s.freeRoads--;
        if (!s.freeRoads || roadsOf(s, p) >= PIECES.road || !roadSpots(s, p).length) {
          s.freeRoads = 0;
          s.phase = 'main';
        }
        return null;
      }
      if (s.phase !== 'main') return 'not now';
      if (roadsOf(s, p) >= PIECES.road) return 'no roads left';
      if (!canPay(me.hand, COST.road)) return 'not enough cards';
      if (!canRoad(s, p, a.e)) return 'can’t build there';
      pay(me.hand, COST.road, s.bank);
      s.roads[a.e] = p;
      note(s, { k: 'road', p, e: a.e });
      updateLongest(s);
      return null;
    }
  }

  if (s.phase !== 'main') return 'not now';
  if (s.offer && a.t !== 'accept' && a.t !== 'cancel') return 'finish the trade first';

  switch (a.t) {
    case 'settle': {
      if (settlementsOf(s, p) >= PIECES.settlement) return 'no towns left';
      if (!canPay(me.hand, COST.settlement)) return 'not enough cards';
      if (!canSettle(s, p, a.v)) return 'can’t build there';
      pay(me.hand, COST.settlement, s.bank);
      s.towns[a.v] = { p, city: false };
      note(s, { k: 'settle', p, v: a.v });
      updateLongest(s);
      return null;
    }

    case 'city': {
      if (citiesOf(s, p) >= PIECES.city) return 'no cities left';
      if (!canPay(me.hand, COST.city)) return 'not enough cards';
      const t = s.towns[a.v];
      if (!t || t.p !== p || t.city) return 'needs one of your towns';
      pay(me.hand, COST.city, s.bank);
      t.city = true;
      note(s, { k: 'city', p, v: a.v });
      return null;
    }

    case 'buy': {
      if (!s.devDeck.length) return 'no cards left';
      if (!canPay(me.hand, COST.dev)) return 'not enough cards';
      pay(me.hand, COST.dev, s.bank);
      me.fresh.push(s.devDeck.pop()!);
      note(s, { k: 'buy', p });
      return null;
    }

    case 'roads': {
      if (s.playedDev || !me.dev.includes('roads')) return 'no road card to play';
      useDev(s, p, 'roads');
      const left = PIECES.road - roadsOf(s, p);
      s.freeRoads = Math.min(2, left);
      if (s.freeRoads && roadSpots(s, p).length) s.phase = 'roads';
      else s.freeRoads = 0;
      return null;
    }

    case 'plenty': {
      if (s.playedDev || !me.dev.includes('plenty')) return 'no plenty card to play';
      if (!RESOURCES.includes(a.a) || !RESOURCES.includes(a.b)) return 'pick two cards';
      const want = emptyHand();
      want[a.a]++;
      want[a.b]++;
      if (!canPay(s.bank, want)) return 'the bank is out of that';
      useDev(s, p, 'plenty');
      give(s, p, want);
      note(s, { k: 'gain', p, cards: trim(want) });
      return null;
    }

    case 'monopoly': {
      if (s.playedDev || !me.dev.includes('monopoly')) return 'no monopoly card to play';
      if (!RESOURCES.includes(a.r)) return 'pick a card';
      useDev(s, p, 'monopoly');
      let n = 0;
      s.players.forEach((pl, o) => {
        if (o === p) return;
        n += pl.hand[a.r];
        pl.hand[a.r] = 0;
      });
      me.hand[a.r] += n;
      note(s, { k: 'monopoly', p, r: a.r, n });
      return null;
    }

    case 'bank': {
      if (!RESOURCES.includes(a.give) || !RESOURCES.includes(a.get) || a.give === a.get) return 'pick two cards';
      const n = rates(s, p)[a.give];
      if (me.hand[a.give] < n) return 'not enough cards';
      if (s.bank[a.get] < 1) return 'the bank is out of that';
      me.hand[a.give] -= n;
      s.bank[a.give] += n;
      me.hand[a.get]++;
      s.bank[a.get]--;
      note(s, { k: 'bank', p, give: a.give, n, get: a.get });
      return null;
    }

    case 'offer': {
      if (!goodHand(a.give) || !goodHand(a.want) || !handSize(a.give) || !handSize(a.want)) return 'pick cards';
      if (RESOURCES.some((r) => a.give[r] && a.want[r])) return 'can’t swap a card for itself';
      if (!canPay(me.hand, a.give)) return 'you don’t have those cards';
      s.offer = { from: p, give: trim(a.give), want: trim(a.want), replies: s.players.map(() => null) };
      note(s, { k: 'offer', p });
      return null;
    }

    case 'accept': {
      const o = s.offer;
      if (!o) return 'no offer out';
      if (o.replies[a.with] !== true) return 'they haven’t said yes';
      const them = s.players[a.with]!;
      if (!canPay(me.hand, o.give) || !canPay(them.hand, o.want)) return 'the cards have changed';
      pay(me.hand, o.give, them.hand);
      pay(them.hand, o.want, me.hand);
      s.offer = null;
      note(s, { k: 'trade', p, with: a.with });
      return null;
    }

    case 'cancel':
      if (!s.offer) return 'no offer out';
      s.offer = null;
      return null;

    case 'end': {
      s.offer = null;
      me.dev.push(...me.fresh);
      me.fresh = [];
      s.playedDev = false;
      note(s, { k: 'end', p });
      s.turn = (s.turn + 1) % 4;
      s.turnNo++;
      s.phase = 'roll';
      s.dice = null;
      return null;
    }
  }
  return 'not a move';
}

function useDev(s: IsleState, p: number, card: Dev) {
  const me = s.players[p]!;
  me.dev.splice(me.dev.indexOf(card), 1);
  s.playedDev = true;
  note(s, { k: 'play', p, card });
}

function setupStep(s: IsleState, p: number, a: IsleAction): string | null {
  const who = SETUP_ORDER[Math.floor(s.setupStep / 2)]!;
  if (p !== who) return 'not your turn';
  const town = s.setupStep % 2 === 0;
  if (town) {
    if (a.t !== 'settle') return 'place a town';
    if (!canSettle(s, p, a.v)) return 'can’t build there';
    s.towns[a.v] = { p, city: false };
    s.lastTown = a.v;
    note(s, { k: 'settle', p, v: a.v });
    // The second town brings a card from each land around it.
    if (s.setupStep >= 8) {
      const got = emptyHand();
      for (const h of TOPOLOGY.verts[a.v]!.hexes) {
        const t = s.board.terrain[h]!;
        if (t !== 'desert') got[t]++;
      }
      if (handSize(got)) {
        give(s, p, got);
        note(s, { k: 'gain', p, cards: trim(got) });
      }
    }
  } else {
    if (a.t !== 'road') return 'place a road';
    if (!canRoad(s, p, a.e)) return 'the road has to touch the new town';
    s.roads[a.e] = p;
    s.lastTown = null;
    note(s, { k: 'road', p, e: a.e });
  }
  s.setupStep++;
  if (s.setupStep === 16) {
    s.phase = 'roll';
    s.turn = 0;
    s.turnNo = 1;
  }
  return null;
}

/** Every card in play plus the bank: always 19 of each, for tests. */
export function cardTotals(s: IsleState): Hand {
  const out = { ...s.bank };
  for (const pl of s.players) for (const r of RESOURCES) out[r] += pl.hand[r];
  return out;
}
