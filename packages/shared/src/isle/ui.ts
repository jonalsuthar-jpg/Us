/**
 * What the game screen shows and what a tap does, the same on phone and
 * web: who's who at the table, my hand, what I can build and afford, the
 * line telling me what's happening, the spots to light up on the board, and
 * the move a tap on one of them makes. The screens only draw this.
 */
import { RESOURCES, TOPOLOGY, type PortKind, type Res } from './board';
import type { Marks, Picked } from './pick';
import {
  canPay,
  citiesOf,
  harboursOf,
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
  type Counter,
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
  knight: { label: 'Knight', text: 'Move the robber and take a card from someone beside it. Can be played before you roll. Three or more make the largest army.' },
  vp: { label: 'Victory Point', text: 'Worth a point. Kept face down; it counts towards your total and shows when you win.' },
  roads: { label: 'Road Building', text: 'Build two roads for free.' },
  plenty: { label: 'Year of Plenty', text: 'Take any two cards from the bank: the same twice, or two different.' },
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
  /** The cards I'm short of for it. */
  missing: Partial<Hand>;
  /** Why it can't be built now, when it can't. */
  why: string | null;
}

export interface TableView {
  me: number;
  seats: SeatView[];
  myTurn: boolean;
  hand: Hand;
  /** My development cards by kind; fresh ones (bought this turn) can't be played yet. */
  dev: { card: Dev; ready: number; fresh: number; playable: boolean; why: string | null }[];
  /** Cards left in the development deck. */
  deck: number;
  /** The harbours my towns stand on. */
  harbours: PortKind[];
  /** Whose turn, counted from the first after the opening (0 during it). */
  turnNo: number;
  prompt: string;
  marks: Marks | undefined;
  canRoll: boolean;
  canEnd: boolean;
  canTrade: boolean;
  build: BuildOption[];
  rates: Hand;
  /** I owe this many cards on a 7. */
  discard: number;
  /**
   * The robber's sequence while it's under way: after a 7 (everyone over 7
   * cards gives back half, then the robber moves and steals) or a knight.
   */
  robber: { cause: 'seven' | 'knight'; step: 'discard' | 'move'; owing: { p: number; n: number }[]; mine: boolean } | null;
  /** An offer someone else made, waiting on my answer. */
  incoming: { from: number; give: Partial<Hand>; want: Partial<Hand>; canAccept: boolean } | null;
  /** My own offer on the table, the answers so far and any counter-offers. */
  outgoing: { give: Partial<Hand>; want: Partial<Hand>; replies: (boolean | null)[]; counters: (Counter | null)[] } | null;
  /** Someone else's offer I've answered, while the others still think. */
  answered: { from: number; give: Partial<Hand>; want: Partial<Hand>; yes: boolean; counter: Counter | null } | null;
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
    if (s.owed[me]) return `A 7! Give back ${s.owed[me]} of your cards`;
    const who = s.owed.flatMap((n, p) => (n ? [seatName(s, me, p)] : []));
    return `A 7! Waiting for ${who.join(' and ')} to give back cards`;
  }
  if (s.offer && s.offer.from !== me) {
    if (s.offer.replies[me] === null) return `${seatName(s, me, s.offer.from)} wants to trade`;
    return 'Waiting for the others to answer';
  }
  const rolled = s.dice ? s.dice[0] + s.dice[1] : null;
  if (s.turn !== me) {
    if (s.phase === 'robber') return `${who} ${rolled === 7 && s.afterRobber === 'main' ? 'rolled 7 and is' : 'is'} moving the robber`;
    if (rolled && s.phase === 'main') return rolled === 7 ? `${who} rolled 7 and moved the robber` : `${who} rolled ${rolled}`;
    return turn.bot ? `${who} is playing` : `${who}’s turn`;
  }
  if (mode.k === 'steal') return mode.from.length ? 'Choose who to take a card from' : 'Nobody to rob there: confirm the move';
  if (s.phase === 'robber') return s.afterRobber === 'roll' ? 'Knight: move the robber to another land' : 'You rolled 7! Move the robber to another land';
  if (s.phase === 'roads') return `Place a free road (${s.freeRoads} left)`;
  if (s.phase === 'roll') return 'Your turn: roll the dice';
  if (s.offer) return 'Waiting for answers to your offer';
  if (mode.k === 'build') return mode.what === 'road' ? 'Tap where the road goes' : mode.what === 'settle' ? 'Tap where the town goes' : 'Tap a town to make it a city';
  if (rolled === 7) return 'Robber moved: build, trade, or end your turn';
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

/** The cards a hand is short of for a cost. */
export function missingFor(hand: Hand, cost: Partial<Hand>): Partial<Hand> {
  return Object.fromEntries(RESOURCES.flatMap((r) => ((cost[r] ?? 0) > hand[r] ? [[r, (cost[r] ?? 0) - hand[r]]] : [])));
}

/** Why I can't do anything on my turn right now, or null when I can. */
function notNow(s: IsleState, me: number): string | null {
  if (s.phase === 'over') return 'The game is over';
  if (s.phase === 'setup') return 'The opening: pieces go down free';
  if (s.turn !== me) return 'Not your turn';
  if (s.phase === 'roll') return 'Roll the dice first';
  if (s.offer) return 'Finish the trade first';
  if (s.phase !== 'main') return 'Not now';
  return null;
}

function buildOptions(s: IsleState, me: number): BuildOption[] {
  const hand = s.players[me]!.hand;
  const wait = notNow(s, me);
  const option = (what: BuildOption['what'], label: string, cost: Partial<Hand>, left: number, spots: number, none: string): BuildOption => {
    const missing = missingFor(hand, cost);
    const short = handSize(missing);
    const why = wait ?? (left <= 0 ? none : short ? `Need ${cardsText(missing)}` : spots ? null : 'Nowhere to build it');
    return { what, label, cost, left, missing, why, ok: why == null };
  };
  return [
    option('road', 'Road', COST.road, PIECES.road - roadsOf(s, me), roadSpots(s, me).length, 'No roads left'),
    option('settle', 'Town', COST.settlement, PIECES.settlement - settlementsOf(s, me), settleSpots(s, me).length, 'No towns left'),
    option('city', 'City', COST.city, PIECES.city - citiesOf(s, me), citySpots(s, me).length, 'No cities left'),
    option('dev', 'Card', COST.dev, s.devDeck.length, 1, 'The deck is empty'),
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
        const playable = myTurn && card !== 'vp' && ready > 0 && !s.playedDev && when;
        const why = playable
          ? null
          : card === 'vp'
            ? 'Counts towards your points; kept hidden'
            : !ready
              ? 'Bought this turn: play it from your next turn'
              : !myTurn
                ? 'Not your turn'
                : s.playedDev
                  ? 'One card a turn: you’ve played one already'
                  : card !== 'knight' && s.phase === 'roll'
                    ? 'Roll the dice first'
                    : s.offer
                      ? 'Finish the trade first'
                      : 'Not now';
        return { card, ready, fresh, playable, why };
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
    marks: marksFor(s, me, mode),
    canRoll: myTurn && s.phase === 'roll',
    canEnd: main,
    canTrade: main && !!pl && handSize(pl.hand) > 0,
    build: buildOptions(s, me),
    rates: rates(s, me),
    deck: s.devDeck.length,
    harbours: harboursOf(s, me),
    turnNo: s.turnNo,
    discard: s.phase === 'discard' ? s.owed[me] ?? 0 : 0,
    robber:
      s.phase === 'discard' || s.phase === 'robber'
        ? {
            cause: s.phase === 'robber' && s.afterRobber === 'roll' ? 'knight' : 'seven',
            step: s.phase === 'discard' ? 'discard' : 'move',
            owing: s.owed.flatMap((n, p) => (n ? [{ p, n }] : [])),
            mine: s.turn === me,
          }
        : null,
    incoming:
      o && o.from !== me && o.replies[me] === null && pl
        ? { from: o.from, give: o.give, want: o.want, canAccept: canPay(pl.hand, o.want) }
        : null,
    outgoing: o && o.from === me ? { give: o.give, want: o.want, replies: o.replies, counters: o.counters ?? o.replies.map(() => null) } : null,
    answered:
      o && o.from !== me && o.replies[me] !== null && o.replies[me] !== undefined
        ? { from: o.from, give: o.give, want: o.want, yes: o.replies[me] === true, counter: o.counters?.[me] ?? null }
        : null,
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
  // The robber's land is chosen first, then confirmed with who to rob (if anyone), so a stray tap can't move it.
  if (s.phase === 'robber' && picked.kind === 'hex') return { mode: { k: 'steal', h: picked.i, from: victims(s, me, picked.i) } };
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
    case 'counter':
      return `${who} made a counter-offer`;
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
