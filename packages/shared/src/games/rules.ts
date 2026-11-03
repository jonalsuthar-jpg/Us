/**
 * Rules for the turn-based mini games. Pure functions over plain JSON, so the
 * board can be stored as is (games.state) and both apps play by the same
 * code. The database only checks whose turn it is (see game_move).
 *
 * Players are the two of us, in order: index 0 moves first.
 */

export type GameKind = 'tictactoe' | 'connect4' | 'wordchain';
export type Seat = 0 | 1;
export type Players = [string, string];

export interface Outcome {
  status: 'active' | 'won' | 'draw';
  /** Who won, when status is 'won'. */
  winner?: Seat;
}

export class IllegalMove extends Error {}

// ------------------------------------------------------------ tic-tac-toe ---

export interface TicTacToe {
  players: Players;
  /** 9 cells, row by row: -1 empty, else the seat that took it. */
  cells: number[];
  last: number | null;
}

export const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const;

export const ticTacToe = {
  initial: (players: Players): TicTacToe => ({ players, cells: Array(9).fill(-1), last: null }),

  /** Whose turn it is: X (seat 0) whenever both have moved equally often. */
  turn: (s: TicTacToe): Seat => (s.cells.filter((c) => c === 0).length > s.cells.filter((c) => c === 1).length ? 1 : 0),

  apply(s: TicTacToe, cell: number, seat: Seat): TicTacToe {
    if (ticTacToe.outcome(s).status !== 'active') throw new IllegalMove('game_over');
    if (ticTacToe.turn(s) !== seat) throw new IllegalMove('not_your_turn');
    if (!Number.isInteger(cell) || cell < 0 || cell > 8 || s.cells[cell] !== -1) throw new IllegalMove('cell_taken');
    const cells = s.cells.slice();
    cells[cell] = seat;
    return { ...s, cells, last: cell };
  },

  /** The winning line, if there is one. */
  line(s: TicTacToe): readonly number[] | null {
    return TTT_LINES.find(([a, b, c]) => s.cells[a] !== -1 && s.cells[a] === s.cells[b] && s.cells[a] === s.cells[c]) ?? null;
  },

  outcome(s: TicTacToe): Outcome {
    const line = ticTacToe.line(s);
    if (line) return { status: 'won', winner: s.cells[line[0]!] as Seat };
    return s.cells.every((c) => c !== -1) ? { status: 'draw' } : { status: 'active' };
  },
};

// ----------------------------------------------------------- connect four ---

export const C4_COLS = 7;
export const C4_ROWS = 6;

export interface ConnectFour {
  players: Players;
  /** One list per column, bottom first: the seat of each disc. */
  cols: number[][];
  /** The last disc dropped, for the animation and highlighting. */
  last: { col: number; row: number } | null;
}

const C4_DIRS = [
  [1, 0], [0, 1], [1, 1], [1, -1],
] as const;

export const connectFour = {
  initial: (players: Players): ConnectFour => ({ players, cols: Array.from({ length: C4_COLS }, () => []), last: null }),

  turn: (s: ConnectFour): Seat => (s.cols.flat().length % 2 === 0 ? 0 : 1),

  at: (s: ConnectFour, col: number, row: number): number => s.cols[col]?.[row] ?? -1,

  canDrop: (s: ConnectFour, col: number) => Number.isInteger(col) && col >= 0 && col < C4_COLS && s.cols[col]!.length < C4_ROWS,

  apply(s: ConnectFour, col: number, seat: Seat): ConnectFour {
    if (connectFour.outcome(s).status !== 'active') throw new IllegalMove('game_over');
    if (connectFour.turn(s) !== seat) throw new IllegalMove('not_your_turn');
    if (!connectFour.canDrop(s, col)) throw new IllegalMove('column_full');
    const cols = s.cols.map((c, i) => (i === col ? [...c, seat] : c));
    return { ...s, cols, last: { col, row: cols[col]!.length - 1 } };
  },

  /** The four (or more) in a row through the last disc, if it made one. */
  line(s: ConnectFour): { col: number; row: number }[] | null {
    if (!s.last) return null;
    const { col, row } = s.last;
    const seat = connectFour.at(s, col, row);
    for (const [dc, dr] of C4_DIRS) {
      const run = [{ col, row }];
      for (const sign of [1, -1]) {
        for (let k = 1; ; k++) {
          const c = col + dc * k * sign;
          const r = row + dr * k * sign;
          if (connectFour.at(s, c, r) !== seat) break;
          run.push({ col: c, row: r });
        }
      }
      if (run.length >= 4) return run;
    }
    return null;
  },

  outcome(s: ConnectFour): Outcome {
    const line = connectFour.line(s);
    if (line) return { status: 'won', winner: connectFour.at(s, s.last!.col, s.last!.row) as Seat };
    return s.cols.every((c) => c.length >= C4_ROWS) ? { status: 'draw' } : { status: 'active' };
  },
};

// ------------------------------------------------------------- word chain ---

/** A chain this long is a shared win: you kept it going together. */
export const CHAIN_GOAL = 30;

export interface WordChain {
  players: Players;
  /** Every word so far, in order, with who gave it. */
  words: { w: string; by: Seat }[];
  /** The opening letter, picked when the game starts. */
  start: string;
}

const LETTERS = 'abcdefghijklmnoprstw';

export const wordChain = {
  initial: (players: Players, random = Math.random): WordChain => ({ players, words: [], start: LETTERS[Math.floor(random() * LETTERS.length)]! }),

  turn: (s: WordChain): Seat => (s.words.length % 2 === 0 ? 0 : 1),

  /** The letter the next word has to start with. */
  next: (s: WordChain): string => (s.words.length ? s.words[s.words.length - 1]!.w.slice(-1) : s.start),

  normalise: (word: string) => word.trim().toLocaleLowerCase(),

  /** Why a word can't be played, or null when it can. */
  problem(s: WordChain, word: string): string | null {
    const w = wordChain.normalise(word);
    if (!/^[a-z]{2,20}$/.test(w)) return 'One word, letters only (2–20).';
    if (!w.startsWith(wordChain.next(s))) return `It has to start with “${wordChain.next(s).toUpperCase()}”.`;
    if (s.words.some((x) => x.w === w)) return 'That word’s been used already.';
    return null;
  },

  apply(s: WordChain, word: string, seat: Seat): WordChain {
    if (wordChain.outcome(s).status !== 'active') throw new IllegalMove('game_over');
    if (wordChain.turn(s) !== seat) throw new IllegalMove('not_your_turn');
    const problem = wordChain.problem(s, word);
    if (problem) throw new IllegalMove(problem);
    return { ...s, words: [...s.words, { w: wordChain.normalise(word), by: seat }] };
  },

  /** Nobody wins outright: reaching the goal together is a draw ("we did it"); getting stuck is resigning. */
  outcome: (s: WordChain): Outcome => (s.words.length >= CHAIN_GOAL ? { status: 'draw' } : { status: 'active' }),
};

// ----------------------------------------------------------------- shared ---

export type BoardState = TicTacToe | ConnectFour | WordChain;
export type GameMove = number | string;

export function initialState(kind: GameKind, players: Players): BoardState {
  if (kind === 'tictactoe') return ticTacToe.initial(players);
  if (kind === 'connect4') return connectFour.initial(players);
  return wordChain.initial(players);
}

export function applyMove(kind: GameKind, state: BoardState, move: GameMove, seat: Seat): { state: BoardState; outcome: Outcome } {
  if (kind === 'tictactoe') {
    const next = ticTacToe.apply(state as TicTacToe, Number(move), seat);
    return { state: next, outcome: ticTacToe.outcome(next) };
  }
  if (kind === 'connect4') {
    const next = connectFour.apply(state as ConnectFour, Number(move), seat);
    return { state: next, outcome: connectFour.outcome(next) };
  }
  const next = wordChain.apply(state as WordChain, String(move), seat);
  return { state: next, outcome: wordChain.outcome(next) };
}

export const GAME_INFO: Record<GameKind, { title: string; blurb: string; emoji: string }> = {
  tictactoe: { title: 'Tic-tac-toe', blurb: 'Three in a row', emoji: '❌' },
  connect4: { title: 'Connect Four', blurb: 'Drop four in a line', emoji: '🔴' },
  wordchain: { title: 'Word chain', blurb: `Keep it going to ${CHAIN_GOAL}`, emoji: '🔤' },
};
