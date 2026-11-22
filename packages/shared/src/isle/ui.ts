/**
 * What the game screen shows and what a tap does, the same on phone and
 * web: who's who at the table, my hand, what I can build and afford, the
 * line telling me what's happening, the spots to light up on the board, and
 * the move a tap on one of them makes. The screens only draw this.
 */
import { RESOURCES, TOPOLOGY, type Res } from './board';
import type { Marks, Picked } from './pick';
import {
  canPay,
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
  shownPoints,
  victims,
  waitingOn,
  WIN_POINTS,
  type Dev,
  type Hand,
  type IsleAction,
  type IsleEvent,
  type IsleState,
} from './rules';
import { PLAYER_COLORS } from './scene/parts';

/** What I'm in the middle of on my own screen (nothing to do with the saved game). */
export type Mode =
  | { k: 'idle' }
  | { k: 'build'; what: 'road' | 'settle' | 'city' }
  | { k: 'steal'; h: number; from: number[] }
  | { k: 'trade' }
  | { k: 'plenty' }
  | { k: 'monopoly' };

export const IDLE: Mode = { k: 'idle' };

export const RES_INFO: Record<Res, { label: string; color: string; dark: string; icon: string }> = {
  wood: {
    label: 'Wood',
    color: '#3F8A44',
    dark: '#1F5627',
    icon: 'M12 1.5 5.2 11h3.6L4 17.5h6.9V22h2.2v-4.5H20L15.2 11h3.6z',
  },
  brick: {
    label: 'Brick',
    color: '#C3653A',
    dark: '#7E3415',
    icon: 'M2 5h9.2v5.4H2zm10.8 0H22v5.4h-9.2zM2 12.3h4.4v5.4H2zm6 0h8v5.4H8zm9.6 0H22v5.4h-4.4zM2 19.6h9.2V23H2zm10.8 0H22V23h-9.2z',
  },
  wool: {
    label: 'Wool',
    color: '#8CC55C',
    dark: '#4C7F2A',
    icon: 'M8.5 6.2a3.2 3.2 0 0 1 5.4-.9 3.1 3.1 0 0 1 4.6 2 3.1 3.1 0 0 1 1 5.6 3.2 3.2 0 0 1-3.7 3.8 3.2 3.2 0 0 1-5.3.4 3.2 3.2 0 0 1-4.3-2.9A3.1 3.1 0 0 1 6.6 8a3 3 0 0 1 1.9-1.8zM2 10.4a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0-4.6 0zm7.4 7.2h1.7V22H9.4zm5.1 0h1.7V22h-1.7z',
  },
  grain: {
    label: 'Grain',
    color: '#E4B83A',
    dark: '#93700F',
    icon: 'M11.2 8.5h1.6V23h-1.6zM12 1c1.7 1.6 1.7 3.9 0 5.6-1.7-1.7-1.7-4 0-5.6zM7.2 5.6c2.3 0 3.7 1.5 4 3.8-2.3 0-3.7-1.5-4-3.8zm9.6 0c-2.3 0-3.7 1.5-4 3.8 2.3 0 3.7-1.5 4-3.8zM7.2 10.8c2.3 0 3.7 1.5 4 3.8-2.3 0-3.7-1.5-4-3.8zm9.6 0c-2.3 0-3.7 1.5-4 3.8 2.3 0 3.7-1.5 4-3.8zM7.2 16c2.3 0 3.7 1.5 4 3.8-2.3 0-3.7-1.5-4-3.8zm9.6 0c-2.3 0-3.7 1.5-4 3.8 2.3 0 3.7-1.5 4-3.8z',
  },
  ore: {
    label: 'Ore',
    color: '#8A949D',
    dark: '#3F474F',
    icon: 'M1.5 21 8.6 7.6l3.1 4.6 2.4-3.1L22.5 21zM8.6 7.6l1.7 2.6-1.7 1.4-1.5-1.3z',
  },
};

export const DEV_INFO: Record<Dev, { label: string; text: string }> = {
  knight: { label: 'Knight', text: 'Move the robber and take a card. Three or more make the largest army.' },
  vp: { label: 'Hidden point', text: 'Worth a point. Kept face down until the end.' },
  roads: { label: 'Free roads', text: 'Build two roads for free.' },
  plenty: { label: 'Harvest', text: 'Take any two cards from the bank.' },
  monopoly: { label: 'Monopoly', text: 'Name a card: everyone gives you all of theirs.' },
};

export const DEV_ORDER: Dev[] = ['knight', 'roads', 'plenty', 'monopoly', 'vp'];

export interface SeatView {
  seat: number;
  /** "You" for me, otherwise their name. */
  name: string;
  /** Their own name, even for me (for the avatar's letter). */
  real: string;
  color: string;
  bot: boolean;
  you: boolean;
  /** Whose turn it is. */
  turn: boolean;
  /** The game is waiting on them (a turn, an answer, cards to give back). */
  waiting: boolean;
  /** Points: everyone's visible ones, mine counting my hidden cards too. */
  points: number;
  cards: number;
  dev: number;
  knights: number;
  road: number;
  longest: boolean;
  army: boolean;
}

export interface BuildOption {
  what: 'road' | 'settle' | 'city' | 'dev';
  label: string;
  cost: Partial<Hand>;
  /** I can afford it, have the piece and somewhere to put it. */
  ok: boolean;
  left: number;
}

export interface TableView {
  me: number;
  seats: SeatView[];
  myTurn: boolean;
  hand: Hand;
  /** My development cards by kind; fresh ones (bought this turn) can't be played yet. */
  dev: { card: Dev; ready: number; fresh: number; playable: boolean }[];
  prompt: string;
  marks: Marks | undefined;
  canRoll: boolean;
  canEnd: boolean;
  canTrade: boolean;
  build: BuildOption[];
  rates: Hand;
  /** I owe this many cards on a 7. */
  discard: number;
  /** An offer someone else made, waiting on my answer. */
  incoming: { from: number; give: Partial<Hand>; want: Partial<Hand>; canAccept: boolean } | null;
  /** My own offer on the table and the answers so far. */
  outgoing: { give: Partial<Hand>; want: Partial<Hand>; replies: (boolean | null)[] } | null;
  over: boolean;
  winner: number | null;
}

export function seatName(s: IsleState, me: number, p: number) {
  return p === me ? 'You' : s.players[p]!.name;
}

function promptFor(s: IsleState, me: number, mode: Mode): string {
  const turn = s.players[s.turn]!;
  const who = seatName(s, me, s.turn);
  if (s.phase === 'over') return s.winner === me ? 'You won!' : `${seatName(s, me, s.winner!)} won`;
  if (s.phase === 'setup') {
    const p = waitingOn(s)[0]!;
    const town = s.setupStep % 2 === 0;
    const second = s.setupStep >= 8;
    if (p === me) return town ? `Place your ${second ? 'second' : 'first'} town` : 'Now a road next to it';
    return `${seatName(s, me, p)} is placing a ${town ? 'town' : 'road'}`;
  }
  if (s.phase === 'discard') {
    if (s.owed[me]) return `A 7! Give back ${s.owed[me]} cards`;
    return 'Waiting for cards to be given back';
  }
  if (s.offer && s.offer.from !== me) {
    if (s.offer.replies[me] === null) return `${seatName(s, me, s.offer.from)} wants to trade`;
    return 'Waiting for the others to answer';
  }
  const rolled = s.dice ? s.dice[0] + s.dice[1] : null;
  if (s.turn !== me) {
    if (s.phase === 'robber') return `${who} is moving the robber`;
    if (rolled && s.phase === 'main') return `${who} rolled ${rolled}`;
    return turn.bot ? `${who} is playing` : `${who}’s turn`;
  }
  if (mode.k === 'steal') return 'Who do you take a card from?';
  if (s.phase === 'robber') return 'Move the robber to a land';
  if (s.phase === 'roads') return `Place a free road (${s.freeRoads} left)`;
  if (s.phase === 'roll') return 'Your turn: roll the dice';
  if (s.offer) return 'Waiting for answers to your offer';
  if (mode.k === 'build') return mode.what === 'road' ? 'Tap where the road goes' : mode.what === 'settle' ? 'Tap where the town goes' : 'Tap a town to make it a city';
  return rolled ? `You rolled ${rolled}: build, trade, or end your turn` : 'Build, trade, or end your turn';
}

export function marksFor(s: IsleState, me: number, mode: Mode): Marks | undefined {
  if (s.phase === 'over' || !waitingOn(s).includes(me)) return undefined;
  if (s.phase === 'setup') return s.setupStep % 2 === 0 ? { verts: settleSpots(s, me) } : { edges: roadSpots(s, me) };
  if (s.turn !== me) return undefined;
  if (s.phase === 'robber') return { hexes: TOPOLOGY.hexes.map((_, h) => h).filter((h) => h !== s.robber) };
  if (s.phase === 'roads') return { edges: roadSpots(s, me) };
  if (s.phase === 'main' && !s.offer && mode.k === 'build') {
    if (mode.what === 'road') return { edges: roadSpots(s, me) };
    if (mode.what === 'settle') return { verts: settleSpots(s, me) };
    return { verts: citySpots(s, me) };
  }
  return undefined;
}

function buildOptions(s: IsleState, me: number): BuildOption[] {
  const hand = s.players[me]!.hand;
  const main = s.phase === 'main' && s.turn === me && !s.offer;
  return [
    {
      what: 'road',
      label: 'Road',
      cost: COST.road,
      left: PIECES.road - roadsOf(s, me),
      ok: main && canPay(hand, COST.road) && roadsOf(s, me) < PIECES.road && roadSpots(s, me).length > 0,
    },
    {
      what: 'settle',
      label: 'Town',
      cost: COST.settlement,
      left: PIECES.settlement - settlementsOf(s, me),
      ok: main && canPay(hand, COST.settlement) && settlementsOf(s, me) < PIECES.settlement && settleSpots(s, me).length > 0,
    },
    {
      what: 'city',
      label: 'City',
      cost: COST.city,
      left: PIECES.city - citiesOf(s, me),
      ok: main && canPay(hand, COST.city) && citiesOf(s, me) < PIECES.city && citySpots(s, me).length > 0,
    },
    {
      what: 'dev',
      label: 'Card',
      cost: COST.dev,
      left: s.devDeck.length,
      ok: main && canPay(hand, COST.dev) && s.devDeck.length > 0,
    },
  ];
}

export function tableView(s: IsleState, me: number, mode: Mode = IDLE): TableView {
  const waiting = new Set(waitingOn(s));
  const seats: SeatView[] = s.players.map((pl, p) => ({
    seat: p,
    name: seatName(s, me, p),
    real: pl.name,
    color: PLAYER_COLORS[p]!,
    bot: pl.bot,
    you: p === me,
    turn: s.phase !== 'over' && (s.phase === 'setup' ? waiting.has(p) : s.turn === p),
    waiting: waiting.has(p),
    points: p === me || s.phase === 'over' ? points(s, p) : shownPoints(s, p),
    cards: handSize(pl.hand),
    dev: pl.dev.length + pl.fresh.length,
    knights: pl.knights,
    road: longestRoad(s, p),
    longest: s.longest === p,
    army: s.army === p,
  }));
  const pl = s.players[me];
  const myTurn = s.turn === me && s.phase !== 'setup' && s.phase !== 'over';
  const main = myTurn && s.phase === 'main' && !s.offer;
  const dev = pl
    ? DEV_ORDER.map((card) => {
        const ready = pl.dev.filter((d) => d === card).length;
        const fresh = pl.fresh.filter((d) => d === card).length;
        const when = card === 'knight' ? (s.phase === 'roll' || s.phase === 'main') && !s.offer : main;
        return { card, ready, fresh, playable: myTurn && card !== 'vp' && ready > 0 && !s.playedDev && when };
      }).filter((d) => d.ready + d.fresh > 0)
    : [];
  const o = s.offer;
  return {
    me,
    seats,
    myTurn,
    hand: pl ? { ...pl.hand } : { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
    dev,
    prompt: promptFor(s, me, mode),
    marks: mode.k === 'steal' ? { hexes: [mode.h] } : marksFor(s, me, mode),
    canRoll: myTurn && s.phase === 'roll',
    canEnd: main,
    canTrade: main && !!pl && handSize(pl.hand) > 0,
    build: buildOptions(s, me),
    rates: rates(s, me),
    discard: s.phase === 'discard' ? s.owed[me] ?? 0 : 0,
    incoming:
      o && o.from !== me && o.replies[me] === null && pl
        ? { from: o.from, give: o.give, want: o.want, canAccept: canPay(pl.hand, o.want) }
        : null,
    outgoing: o && o.from === me ? { give: o.give, want: o.want, replies: o.replies } : null,
    over: s.phase === 'over',
    winner: s.winner,
  };
}

/** What a tap on the board does: a move to make, or the next step on my screen. */
export function tapBoard(s: IsleState, me: number, mode: Mode, picked: Picked | null): { action?: IsleAction; mode?: Mode } {
  if (!picked) return {};
  if (s.phase === 'setup') {
    if (picked.kind === 'vert') return { action: { t: 'settle', v: picked.i } };
    if (picked.kind === 'edge') return { action: { t: 'road', e: picked.i } };
    return {};
  }
  if (s.phase === 'robber' && picked.kind === 'hex') {
    const from = victims(s, me, picked.i);
    if (from.length > 1) return { mode: { k: 'steal', h: picked.i, from } };
    return { action: { t: 'robber', h: picked.i, from: from[0] ?? null }, mode: IDLE };
  }
  if (s.phase === 'roads' && picked.kind === 'edge') return { action: { t: 'road', e: picked.i } };
  if (mode.k === 'build') {
    if (mode.what === 'road' && picked.kind === 'edge') return { action: { t: 'road', e: picked.i }, mode: IDLE };
    if (mode.what === 'settle' && picked.kind === 'vert') return { action: { t: 'settle', v: picked.i }, mode: IDLE };
    if (mode.what === 'city' && picked.kind === 'vert') return { action: { t: 'city', v: picked.i }, mode: IDLE };
  }
  return {};
}

/** A mode that no longer fits the game (the turn moved on, the cards went) falls back to idle. */
export function settleMode(s: IsleState, me: number, mode: Mode): Mode {
  if (mode.k === 'idle') return mode;
  const mine = s.turn === me && s.phase !== 'over';
  if (mode.k === 'steal') return mine && s.phase === 'robber' ? mode : IDLE;
  if (!mine || s.phase !== 'main' || s.offer) return IDLE;
  if (mode.k === 'build') {
    const opt = buildOptions(s, me).find((b) => b.what === mode.what);
    return opt?.ok ? mode : IDLE;
  }
  return mode;
}

const cardsText = (h: Partial<Hand>) =>
  RESOURCES.filter((r) => h[r])
    .map((r) => `${h[r]} ${RES_INFO[r].label.toLowerCase()}`)
    .join(', ');

/** One line for the game log. */
export function describe(s: IsleState, me: number, e: IsleEvent): string | null {
  const who = seatName(s, me, e.p ?? 0);
  switch (e.k) {
    case 'start':
      return 'A new island!';
    case 'settle':
      return `${who} built a town`;
    case 'city':
      return `${who} built a city`;
    case 'road':
      return `${who} built a road`;
    case 'roll':
      return `${who} rolled ${e.d[0] + e.d[1]}`;
    case 'gain':
      return `${who} got ${cardsText(e.cards)}`;
    case 'discard':
      return `${who} gave back ${e.n} cards`;
    case 'robber':
      return `${who} moved the robber`;
    case 'steal':
      return `${who} took a card from ${e.from === me ? 'you' : s.players[e.from]!.name}`;
    case 'buy':
      return `${who} bought a card`;
    case 'play':
      return e.card === 'vp' ? null : `${who} played ${DEV_INFO[e.card].label}`;
    case 'monopoly':
      return `${who} took every ${RES_INFO[e.r].label.toLowerCase()} (${e.n})`;
    case 'bank':
      return `${who} traded ${e.n} ${RES_INFO[e.give].label.toLowerCase()} for 1 ${RES_INFO[e.get].label.toLowerCase()}`;
    case 'offer':
      return `${who} offered a trade`;
    case 'trade':
      return `${who} traded with ${e.with === me ? 'you' : s.players[e.with]!.name}`;
    case 'longest':
      return e.p == null ? 'Nobody has the longest road now' : `${who} ${e.p === me ? 'have' : 'has'} the longest road`;
    case 'army':
      return `${who} ${e.p === me ? 'have' : 'has'} the largest army`;
    case 'end':
      return null;
    case 'win':
      return `${who} ${e.p === me ? 'win' : 'wins'}!`;
  }
}

/** The log, newest last, with its event numbers (for keys and for spotting new ones). */
export function logLines(s: IsleState, me: number): { n: number; text: string; p: number | null }[] {
  const first = s.n - s.log.length + 1;
  return s.log.flatMap((e, i) => {
    const text = describe(s, me, e);
    return text ? [{ n: first + i, text, p: 'p' in e ? (e.p ?? null) : null }] : [];
  });
}

/** Points to win, for the score panel. */
export const GOAL = WIN_POINTS;
