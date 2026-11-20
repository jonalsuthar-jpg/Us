/**
 * Our House, things to do together: the rules, pure and testable. Their
 * state lives in house_items (games, gifts, the garden, the pet…), so both
 * of us see the same board, the same gift, the same tomatoes.
 */
import { Chess } from 'chess.js';

// ---------------------------------------------------------------- tic-tac-toe

export interface TicTacToe {
  /** Nine cells: '.', 'x' or 'o'. */
  b: string;
  x: string;
  o: string;
  turn: 'x' | 'o';
}

export const newTicTacToe = (x: string, o: string): TicTacToe => ({ b: '.........', x, o, turn: 'x' });

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function ticTacToeWinner(b: string): 'x' | 'o' | 'draw' | null {
  for (const [p, q, r] of LINES) if (b[p!] !== '.' && b[p!] === b[q!] && b[p!] === b[r!]) return b[p!] as 'x' | 'o';
  return b.includes('.') ? null : 'draw';
}

/** My move in a cell, or null if it isn't my turn, the cell is taken, or the game is over. */
export function ticTacToeMove(s: TicTacToe, me: string, cell: number): TicTacToe | null {
  if (ticTacToeWinner(s.b) || cell < 0 || cell > 8 || s.b[cell] !== '.') return null;
  if (s[s.turn] !== me) return null;
  const b = s.b.slice(0, cell) + s.turn + s.b.slice(cell + 1);
  return { ...s, b, turn: s.turn === 'x' ? 'o' : 'x' };
}

// ---------------------------------------------------------------------- chess

export interface ChessGame {
  fen: string;
  w: string;
  b: string;
  /** The last move, to show it. */
  last?: [string, string];
}

export const newChess = (w: string, b: string): ChessGame => ({ fen: new Chess().fen(), w, b });

export function chessTurn(g: ChessGame): string {
  return new Chess(g.fen).turn() === 'w' ? g.w : g.b;
}

/** My move from one square to another (a pawn reaching the end becomes a queen), or null if not allowed. */
export function chessMove(g: ChessGame, me: string, from: string, to: string): ChessGame | null {
  const c = new Chess(g.fen);
  if ((c.turn() === 'w' ? g.w : g.b) !== me || c.isGameOver()) return null;
  try {
    c.move({ from, to, promotion: 'q' });
  } catch {
    return null;
  }
  return { ...g, fen: c.fen(), last: [from, to] };
}

/** Where a piece on a square can go. */
export function chessTargets(g: ChessGame, from: string): string[] {
  try {
    return new Chess(g.fen).moves({ square: from as never, verbose: true }).map((m) => m.to);
  } catch {
    return [];
  }
}

export function chessStatus(g: ChessGame): { over: boolean; winner: string | null; check: boolean; text: string } {
  const c = new Chess(g.fen);
  if (c.isCheckmate()) {
    const winner = c.turn() === 'w' ? g.b : g.w;
    return { over: true, winner, check: true, text: 'Checkmate' };
  }
  if (c.isDraw() || c.isStalemate()) return { over: true, winner: null, check: false, text: 'A draw' };
  return { over: false, winner: null, check: c.inCheck(), text: c.inCheck() ? 'Check' : '' };
}

/** The board as 8 rows of 8 ('' empty, else e.g. 'wK', 'bp'), white at the bottom. */
export function chessBoard(g: ChessGame): string[][] {
  return new Chess(g.fen).board().map((row) => row.map((p) => (p ? `${p.color}${p.type}` : '')));
}

// ----------------------------------------------------------------------- ludo

/**
 * Ludo for two, a little quicker: two tokens each, a 28-square loop, then 4
 * home squares. A six brings a token out and rolls again; landing on the
 * other's token (off a star square) sends it home.
 */
export const LUDO_LOOP = 28;
export const LUDO_HOME = 4;
export const LUDO_DONE = LUDO_LOOP + LUDO_HOME;

export interface Ludo {
  players: [string, string];
  /** Per player, per token: -1 at the start, 0…27 round the loop (from their own start), 28…31 home, 32 done. */
  pos: [[number, number], [number, number]];
  turn: 0 | 1;
  dice: number | null;
}

export const newLudo = (a: string, b: string): Ludo => ({ players: [a, b], pos: [[-1, -1], [-1, -1]], turn: 0, dice: null });

/** The square on the shared loop, or null when not on it. Player 1 starts halfway round. */
const onLoop = (player: number, p: number) => (p >= 0 && p < LUDO_LOOP ? (p + player * (LUDO_LOOP / 2)) % LUDO_LOOP : null);
/** Stars: safe squares, including both starts. */
export const LUDO_STARS = new Set([0, 7, 14, 21]);

export function ludoRoll(s: Ludo, me: string, roll: number): Ludo | null {
  if (s.players[s.turn] !== me || s.dice !== null || ludoWinner(s) !== null) return null;
  const next = { ...s, dice: roll };
  // Nothing can move: the turn passes.
  return ludoMovable(next).length ? next : { ...next, dice: null, turn: roll === 6 ? s.turn : ((1 - s.turn) as 0 | 1) };
}

/** Which of my tokens can move with this dice. */
export function ludoMovable(s: Ludo): number[] {
  if (s.dice === null) return [];
  return [0, 1].filter((t) => {
    const p = s.pos[s.turn][t]!;
    if (p === -1) return s.dice === 6;
    return p + s.dice! <= LUDO_DONE;
  });
}

export function ludoMove(s: Ludo, me: string, token: number): Ludo | null {
  if (s.players[s.turn] !== me || !ludoMovable(s).includes(token)) return null;
  const pos = s.pos.map((p) => [...p]) as Ludo['pos'];
  const p = pos[s.turn][token]!;
  const np = p === -1 ? 0 : p + s.dice!;
  pos[s.turn][token] = np;
  // Landing on the other's token sends it back to the start (not on a star).
  const sq = onLoop(s.turn, np);
  if (sq !== null && !LUDO_STARS.has(sq)) {
    const other = 1 - s.turn;
    pos[other] = pos[other]!.map((q) => (onLoop(other, q) === sq ? -1 : q)) as [number, number];
  }
  const again = s.dice === 6;
  return { ...s, pos, dice: null, turn: again ? s.turn : ((1 - s.turn) as 0 | 1) };
}

export function ludoWinner(s: Ludo): string | null {
  for (const i of [0, 1] as const) if (s.pos[i].every((p) => p === LUDO_DONE)) return s.players[i];
  return null;
}

// ------------------------------------------------- hide and seek, treasure

/** How close the seeker is, in words. */
export function warmth(distance: number): string {
  if (distance < 1.5) return 'Burning hot!';
  if (distance < 3.5) return 'Hot';
  if (distance < 6) return 'Warm';
  if (distance < 10) return 'Cold';
  return 'Freezing';
}

export const HIDE_S = 20;
export const SEEK_S = 180;

export interface Seek {
  hider: string;
  seeker: string;
  /** When hiding started (ISO). */
  at: string;
  found?: boolean;
}

/** Where hide and seek is: the hider hiding, the seeker seeking, or done. */
export function seekPhase(s: Seek, now: Date): 'hide' | 'seek' | 'done' {
  if (s.found) return 'done';
  const t = (now.getTime() - Date.parse(s.at)) / 1000;
  if (t < HIDE_S) return 'hide';
  return t < HIDE_S + SEEK_S ? 'seek' : 'done';
}

// ---------------------------------------------------------------------- ball

export interface Throw {
  by: string;
  /** Where from, the velocity, and when (ms). */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  at: number;
}

export const GRAVITY = 9.8;

/** Where a thrown ball is t seconds in (it stops on the ground). */
export function ballAt(t: Throw, seconds: number): [number, number, number] {
  const land = ballLands(t);
  const s = Math.min(seconds, land);
  return [t.x + t.vx * s, Math.max(0.12, t.y + t.vy * s - (GRAVITY * s * s) / 2), t.z + t.vz * s];
}

/** When it reaches the ground. */
export function ballLands(t: Throw): number {
  // y + vy·s − g·s²/2 = 0.12
  const a = GRAVITY / 2;
  const b = -t.vy;
  const c = 0.12 - t.y;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** A throw from me towards a point: a gentle arc that lands there. */
export function throwTo(by: string, from: [number, number, number], to: [number, number], at: number, time = 1.1): Throw {
  const vx = (to[0] - from[0]) / time;
  const vz = (to[1] - from[2]) / time;
  const vy = (0.12 - from[1] + (GRAVITY * time * time) / 2) / time;
  return { by, x: from[0], y: from[1], z: from[2], vx, vy, vz, at };
}

// --------------------------------------------------------------------- gifts

export type GiftKind = 'flowers' | 'box' | 'lamp' | 'heart';
export const GIFT_LABEL: Record<GiftKind, string> = { flowers: 'Flowers', box: 'A gift', lamp: 'A light left on', heart: 'A heart on the door' };
/** Flowers last three days; the rest until opened. */
export const FLOWERS_LAST_MS = 3 * 24 * 3600 * 1000;

export interface Gift {
  kind: GiftKind;
  by: string;
  at: string;
  text?: string;
  /** A Memories photo's path, for a gift box. */
  photo?: string;
  opened?: boolean;
}

export function giftFresh(g: Gift, now: Date): boolean {
  return g.kind !== 'flowers' || now.getTime() - Date.parse(g.at) < FLOWERS_LAST_MS;
}

/** Gifts left for me that I haven't opened. */
export function giftsWaiting(gifts: Gift[], me: string, now: Date): Gift[] {
  return gifts.filter((g) => g.by !== me && !g.opened && giftFresh(g, now));
}

// -------------------------------------------------------------------- garden

export type Crop = 'tomato' | 'carrot' | 'strawberry' | 'rose' | 'sunflower' | 'tulip';
export const CROPS: Record<Crop, { label: string; days: number; veg: boolean; color: string }> = {
  tomato: { label: 'Tomatoes', days: 4, veg: true, color: '#D9412B' },
  carrot: { label: 'Carrots', days: 3, veg: true, color: '#E8862A' },
  strawberry: { label: 'Strawberries', days: 5, veg: true, color: '#D3243F' },
  rose: { label: 'Roses', days: 5, veg: false, color: '#C8204A' },
  sunflower: { label: 'Sunflowers', days: 6, veg: false, color: '#F2C21B' },
  tulip: { label: 'Tulips', days: 3, veg: false, color: '#E86A92' },
};

export interface Bed {
  crop: Crop;
  /** Days it has been watered (YYYY-MM-DD), one step each. */
  days: string[];
}

export const bedGrowth = (b: Bed) => Math.min(1, b.days.length / CROPS[b.crop].days);
export const bedReady = (b: Bed) => bedGrowth(b) >= 1;

export function waterBed(b: Bed, day: string): Bed {
  return b.days.includes(day) || bedReady(b) ? b : { ...b, days: [...b.days, day] };
}

// ------------------------------------------------------------------- unlocks

/** Things the house gains as the days together add up. */
export const UNLOCKS = [
  { key: 'fire_pit', days: 7, label: 'A fire pit in the garden' },
  { key: 'garden_beds', days: 14, label: 'Garden beds to plant' },
  { key: 'hot_tub', days: 30, label: 'A hot tub on the deck' },
  { key: 'telescope', days: 100, label: 'A telescope on the balcony' },
  { key: 'fairy_lights', days: 182, label: 'Fairy lights across the garden' },
  { key: 'swing', days: 365, label: 'A swing for two under the tree' },
] as const;
export type Unlock = (typeof UNLOCKS)[number]['key'];

export function daysTogetherSince(pairedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(pairedAt)) / 86_400_000));
}

export function unlocked(pairedAt: string, now: Date): Set<Unlock> {
  const d = daysTogetherSince(pairedAt, now);
  return new Set(UNLOCKS.filter((u) => d >= u.days).map((u) => u.key));
}

/** The next thing to come, and in how many days. */
export function nextUnlock(pairedAt: string, now: Date): { label: string; inDays: number } | null {
  const d = daysTogetherSince(pairedAt, now);
  const u = UNLOCKS.find((x) => x.days > d);
  return u ? { label: u.label, inDays: u.days - d } : null;
}

// --------------------------------------------------------------------- moods

export const MOODS = [
  { key: 'happy', emoji: '😊', label: 'Happy', ring: '#FFD54A' },
  { key: 'sleepy', emoji: '😴', label: 'Sleepy', ring: '#9FA8DA' },
  { key: 'missing', emoji: '🥺', label: 'Missing you', ring: '#F48FB1' },
  { key: 'excited', emoji: '🤩', label: 'Excited', ring: '#FF8A65' },
  { key: 'cosy', emoji: '🥰', label: 'Cosy', ring: '#CE93D8' },
  { key: 'tired', emoji: '😮‍💨', label: 'Tired', ring: '#B0BEC5' },
] as const;
export type Mood = (typeof MOODS)[number]['key'];
export const moodOf = (k: string | undefined) => MOODS.find((m) => m.key === k);

// -------------------------------------------------------------------- dinner

/** A dinner date: steps taken in turn, the next always the other's. */
export const RECIPES = {
  pasta: { label: 'Pasta', steps: ['Chop the tomatoes', 'Boil the pasta', 'Stir the sauce', 'Plate up'] },
  curry: { label: 'Curry', steps: ['Chop the onions', 'Fry the spices', 'Simmer the curry', 'Plate up'] },
  salad: { label: 'Garden salad', steps: ['Wash the veg', 'Chop it all', 'Dress it', 'Plate up'] },
} as const;
export type Recipe = keyof typeof RECIPES;

export interface Dinner {
  recipe: Recipe;
  step: number;
  /** Who started (they do steps 0, 2, …; the other 1, 3, …). */
  first: string;
  second: string;
}

export const dinnerWho = (d: Dinner) => (d.step % 2 === 0 ? d.first : d.second);
export const dinnerDone = (d: Dinner) => d.step >= RECIPES[d.recipe].steps.length;

export function dinnerStep(d: Dinner, me: string): Dinner | null {
  if (dinnerDone(d) || dinnerWho(d) !== me) return null;
  return { ...d, step: d.step + 1 };
}
