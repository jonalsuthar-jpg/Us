/**
 * Draw & Guess: two players, six rounds, roles swap each round. One draws a
 * word, the other guesses. A team score: the faster the guess, the more you
 * both get.
 *
 * The word never reaches the guesser's device. The drawer sends a salted hash
 * of it (and of its one-letter-short forms, for "so close"), its length and,
 * every 20 seconds, one more letter as a hint. The guesser's app checks each
 * guess against the hashes.
 *
 * In a live game the drawer's device runs the clock for its round; events
 * carry times and the other device follows them. gameReducer() is pure.
 */
import { sha256 } from './sha256';
import { seeded, type Difficulty, type PackId, type Word } from './words';

export const ROUNDS = 6;
export const TURN_MS = 80_000;
export const CHOOSE_MS = 10_000;
export const REVEAL_MS = 4_500;
export const HINT_EVERY_MS = 20_000;
export const LEVEL_MULT: Record<Difficulty, number> = { easy: 1, medium: 1.5, hard: 2 };

// ------------------------------------------------------------ matching ---

/** Lower case, no accents, no spaces or punctuation: "Gol Gappa!" → "golgappa". */
export function normalizeWord(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export type GuessResult = 'right' | 'close' | 'wrong';

/** With the word in hand (the drawer's view, and tests). */
export function matchGuess(guess: string, word: string): GuessResult {
  const g = normalizeWord(guess);
  const w = normalizeWord(word);
  if (!g) return 'wrong';
  if (g === w) return 'right';
  return w.length >= 4 && levenshtein(g, w, 1) <= 1 ? 'close' : 'wrong';
}

/** Every way to drop one letter. */
function deletions(s: string): string[] {
  const out = new Set<string>();
  for (let i = 0; i < s.length; i++) out.add(s.slice(0, i) + s.slice(i + 1));
  return [...out];
}

export interface WordSecret {
  /** sha256(salt + normalised word). */
  hash: string;
  /** Hashes of the word with one letter dropped, for "so close". */
  near: string[];
  /** Letters in the normalised word. */
  len: number;
  /** The word's shape: '_' per letter, spaces and punctuation kept ("____ ________"). */
  mask: string;
}

export function secretFor(word: string, salt: string): WordSecret {
  const w = normalizeWord(word);
  return {
    hash: sha256(salt + w),
    near: w.length >= 4 ? deletions(w).map((d) => sha256(salt + d)) : [],
    len: w.length,
    mask: shapeOf(word),
  };
}

/** Check a guess without knowing the word. */
export function checkSecret(guess: string, secret: WordSecret, salt: string): GuessResult {
  const g = normalizeWord(guess);
  if (!g) return 'wrong';
  const h = sha256(salt + g);
  if (h === secret.hash) return 'right';
  if (!secret.near.length || Math.abs(g.length - secret.len) > 1) return 'wrong';
  const near = new Set(secret.near);
  // One letter missing from the guess.
  if (near.has(h)) return 'close';
  const dels = deletions(g).map((d) => sha256(salt + d));
  // One letter too many, or one letter different.
  if (dels.includes(secret.hash) || dels.some((d) => near.has(d))) return 'close';
  return 'wrong';
}

// --------------------------------------------------------------- hints ---

export function shapeOf(word: string): string {
  return [...word.trim()].map((ch) => (/[\p{L}\p{N}]/u.test(ch) ? '_' : ch)).join('');
}

/** Positions (in the display word) of letters to reveal, in order. Never all of them. */
export function hintOrder(word: string, seed: number): number[] {
  const letters = [...word.trim()].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? i : -1)).filter((i) => i >= 0);
  const max = Math.min(3, Math.max(0, Math.floor(letters.length / 3)));
  const rand = seeded(seed);
  const pool = letters.slice();
  const out: number[] = [];
  while (out.length < max && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!);
  return out;
}

/** How many hint letters show `elapsed` ms into a turn: one at 20 s, 40 s and 60 s. */
export function hintsShown(elapsed: number): number {
  return Math.max(0, Math.min(3, Math.floor(elapsed / HINT_EVERY_MS)));
}

/** The shape with revealed letters filled in. */
export function maskWith(mask: string, revealed: Record<number, string>): string[] {
  return [...mask].map((ch, i) => (ch === '_' ? (revealed[i] ?? '_') : ch));
}

// ------------------------------------------------------------- scoring ---

/** Points for each of us when the word is guessed `elapsed` ms in. */
export function pointsFor(elapsed: number, level: Difficulty): number {
  if (elapsed < 0 || elapsed > TURN_MS) return 0;
  const speed = 1 - elapsed / TURN_MS;
  return Math.round((30 + 70 * speed) * LEVEL_MULT[level]);
}

// ---------------------------------------------------------------- game ---

export type GamePhase = 'invited' | 'choosing' | 'drawing' | 'reveal' | 'done' | 'left';

export interface RoundResult {
  round: number;
  drawer: string;
  word: string;
  level: Difficulty;
  solved: boolean;
  ms: number;
  points: number;
}

export interface GuessEntry {
  by: string;
  text: string;
  result: GuessResult;
  at: number;
}

export interface GameState {
  id: string;
  /** players[0] started the game and draws first. */
  players: [string, string];
  packs: PackId[];
  rounds: number;
  round: number;
  phase: GamePhase;
  drawer: string;
  /** When the current phase ends (ms since epoch). */
  until: number;
  startedAt: number;
  secret: WordSecret | null;
  level: Difficulty | null;
  pack: PackId | null;
  /** Only on the drawer's device until the reveal. */
  word: string | null;
  /** The drawer's three choices (drawer's device only). */
  choices: Word[];
  revealed: Record<number, string>;
  guesses: GuessEntry[];
  score: number;
  results: RoundResult[];
  /** Who has joined from the invite. */
  joined: string[];
  leftBy: string | null;
}

export type GameMsg =
  | { k: 'invite'; id: string; players: [string, string]; packs: PackId[]; rounds: number; at: number }
  | { k: 'join'; id: string; by: string }
  | { k: 'choosing'; id: string; round: number; drawer: string; until: number }
  | { k: 'round'; id: string; round: number; drawer: string; secret: WordSecret; level: Difficulty; pack: PackId; at: number; until: number }
  | { k: 'hint'; id: string; round: number; i: number; ch: string }
  | { k: 'guess'; id: string; round: number; by: string; text: string; result: GuessResult; at: number }
  | { k: 'reveal'; id: string; round: number; word: string; solved: boolean; ms: number; points: number; at: number }
  | { k: 'done'; id: string; score: number }
  | { k: 'leave'; id: string; by: string };

/** Things only my own device knows. Never sent. */
export type GameLocal = { k: 'choices'; choices: Word[] } | { k: 'picked'; word: Word };

export function newGame(msg: Extract<GameMsg, { k: 'invite' }>): GameState {
  return {
    id: msg.id,
    players: msg.players,
    packs: msg.packs,
    rounds: msg.rounds,
    round: 0,
    phase: 'invited',
    drawer: msg.players[0],
    until: 0,
    startedAt: msg.at,
    secret: null,
    level: null,
    pack: null,
    word: null,
    choices: [],
    revealed: {},
    guesses: [],
    score: 0,
    results: [],
    joined: [msg.players[0]],
    leftBy: null,
  };
}

/** Who draws a round: the starter on even rounds, the other on odd ones. */
export const drawerOf = (players: [string, string], round: number): string => (round % 2 ? players[1] : players[0]);
export const guesserOf = (s: Pick<GameState, 'players' | 'drawer'>) => (s.players[0] === s.drawer ? s.players[1] : s.players[0]);

export function gameReducer(s: GameState | null, m: GameMsg | GameLocal): GameState | null {
  if (m.k === 'invite') return s && s.id === m.id ? s : newGame(m);
  if (!s) return s;
  if ('id' in m && m.id !== s.id) return s;
  switch (m.k) {
    case 'choices':
      return { ...s, choices: m.choices };
    case 'picked':
      return { ...s, word: m.word.text, level: m.word.level, pack: m.word.pack, choices: [] };
    case 'join':
      return s.joined.includes(m.by) ? s : { ...s, joined: [...s.joined, m.by] };
    case 'choosing':
      if (m.round < s.round || s.phase === 'done' || m.round >= s.rounds) return s;
      return {
        ...s,
        phase: 'choosing',
        round: m.round,
        drawer: m.drawer,
        until: m.until,
        secret: null,
        word: m.round === s.round && s.phase === 'choosing' ? s.word : null,
        level: null,
        pack: null,
        revealed: {},
        guesses: [],
        joined: s.players.slice(),
      };
    case 'round':
      if (m.round < s.round || s.phase === 'done') return s;
      return {
        ...s,
        phase: 'drawing',
        round: m.round,
        drawer: m.drawer,
        secret: m.secret,
        level: m.level,
        pack: m.pack,
        startedAt: m.at,
        until: m.until,
        revealed: m.round === s.round ? s.revealed : {},
        guesses: m.round === s.round ? s.guesses : [],
        choices: [],
      };
    case 'hint':
      if (m.round !== s.round || s.phase !== 'drawing') return s;
      return { ...s, revealed: { ...s.revealed, [m.i]: m.ch } };
    case 'guess':
      if (m.round !== s.round || s.phase !== 'drawing') return s;
      if (s.guesses.some((g) => g.at === m.at && g.text === m.text)) return s;
      return { ...s, guesses: [...s.guesses, { by: m.by, text: m.text, result: m.result, at: m.at }] };
    case 'reveal': {
      if (m.round !== s.round || s.results.some((r) => r.round === m.round)) return s;
      const result: RoundResult = {
        round: m.round,
        drawer: s.drawer,
        word: m.word,
        level: s.level ?? 'easy',
        solved: m.solved,
        ms: m.ms,
        points: m.points,
      };
      return { ...s, phase: 'reveal', word: m.word, until: m.at + REVEAL_MS, results: [...s.results, result], score: s.score + m.points };
    }
    case 'done':
      return { ...s, phase: 'done', score: Math.max(s.score, m.score) };
    case 'leave':
      return s.phase === 'done' ? s : { ...s, phase: 'left', leftBy: m.by };
    default:
      return s;
  }
}

/** The best round of a game: solved, fastest. */
export function bestRound(results: RoundResult[]): RoundResult | null {
  return results.filter((r) => r.solved).sort((a, b) => a.ms - b.ms)[0] ?? null;
}
