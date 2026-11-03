import { describe, expect, it } from 'vitest';
import { gameScore, quizState, seatOf } from '../src/api/games';
import { cardAt, DECKS, seededOrder } from '../src/games/cards';
import { KNOW_ME, knowMePrompt, pickQuestions, QUIZ_LENGTH, quizScore, quizVerdict, THIS_OR_THAT } from '../src/games/quiz';
import { applyMove, CHAIN_GOAL, connectFour, IllegalMove, ticTacToe, wordChain, type ConnectFour, type Players, type TicTacToe } from '../src/games/rules';

const P: Players = ['me', 'you'];

describe('tic-tac-toe', () => {
  const play = (moves: number[]) => moves.reduce<TicTacToe>((s, m, i) => ticTacToe.apply(s, m, (i % 2) as 0 | 1), ticTacToe.initial(P));

  it('takes turns, X first', () => {
    const s = play([4]);
    expect(ticTacToe.turn(s)).toBe(1);
    expect(() => ticTacToe.apply(s, 0, 0)).toThrow(IllegalMove);
    expect(() => ticTacToe.apply(s, 4, 1)).toThrow('cell_taken');
  });
  it('finds a win, and stops the game there', () => {
    const s = play([0, 3, 1, 4, 2]);
    expect(ticTacToe.outcome(s)).toEqual({ status: 'won', winner: 0 });
    expect(ticTacToe.line(s)).toEqual([0, 1, 2]);
    expect(() => ticTacToe.apply(s, 8, 1)).toThrow('game_over');
  });
  it('calls a full board with no line a draw', () => {
    expect(ticTacToe.outcome(play([0, 1, 2, 4, 3, 5, 7, 6, 8]))).toEqual({ status: 'draw' });
  });
});

describe('connect four', () => {
  const play = (cols: number[]) => cols.reduce<ConnectFour>((s, c, i) => connectFour.apply(s, c, (i % 2) as 0 | 1), connectFour.initial(P));

  it('stacks discs and refuses a full column', () => {
    let s = play([3, 3, 3, 3, 3, 3]);
    expect(s.cols[3]).toEqual([0, 1, 0, 1, 0, 1]);
    expect(() => connectFour.apply(s, 3, 0)).toThrow('column_full');
    s = connectFour.apply(s, 0, 0);
    expect(s.last).toEqual({ col: 0, row: 0 });
  });
  it('wins across, up and on both diagonals', () => {
    expect(connectFour.outcome(play([0, 0, 1, 1, 2, 2, 3])).winner).toBe(0);
    expect(connectFour.outcome(play([0, 1, 0, 1, 0, 1, 0])).winner).toBe(0);
    // Diagonal up-right for seat 0: (0,0) (1,1) (2,2) (3,3).
    expect(connectFour.outcome(play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3])).status).toBe('won');
    // Diagonal down-right for seat 1: (0,3) (1,2) (2,1) (3,0), found from a disc in the middle too.
    const cols = [[0, 0, 0, 1], [0, 0, 1], [0, 1], [1], [], [], []];
    for (const last of [{ col: 3, row: 0 }, { col: 1, row: 2 }]) {
      const s: ConnectFour = { players: P, cols, last };
      expect(connectFour.outcome(s)).toEqual({ status: 'won', winner: 1 });
      expect(connectFour.line(s)).toHaveLength(4);
    }
  });
});

describe('word chain', () => {
  const s0 = { ...wordChain.initial(P, () => 0), start: 'a' };

  it('needs the right letter, a real-looking word and no repeats', () => {
    expect(wordChain.problem(s0, 'Banana')).toMatch(/start with “A”/);
    expect(wordChain.problem(s0, 'a b')).toMatch(/One word/);
    const s1 = wordChain.apply(s0, 'Apple', 0);
    expect(wordChain.next(s1)).toBe('e');
    const s2 = wordChain.apply(s1, 'eagle', 1);
    expect(wordChain.problem(s2, 'eagle')).toMatch(/used already/);
    const s3 = wordChain.apply(s2, 'elephant', 0);
    const s4 = wordChain.apply(s3, 'tiger', 1);
    expect(wordChain.problem(s4, 'rabbit')).toBeNull();
    expect(() => wordChain.apply(s4, 'rabbit', 1)).toThrow('not_your_turn');
  });
  it('is won together at the goal', () => {
    let s = s0;
    for (let i = 0; i < CHAIN_GOAL; i++) {
      // Every word starts and ends with "a", with a different middle.
      const w = `a${String.fromCharCode(98 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}a`;
      s = wordChain.apply(s, w, (i % 2) as 0 | 1);
    }
    expect(wordChain.outcome(s)).toEqual({ status: 'draw' });
  });
});

describe('games api helpers', () => {
  it('finds my seat and keeps the score', () => {
    expect(seatOf({ state: ticTacToe.initial(P) }, 'you')).toBe(1);
    expect(seatOf({ state: ticTacToe.initial(P) }, 'them')).toBeNull();
    const games = [
      { kind: 'tictactoe', status: 'won', winner: 'me' },
      { kind: 'connect4', status: 'won', winner: 'you' },
      { kind: 'tictactoe', status: 'draw', winner: null },
      { kind: 'tictactoe', status: 'active', winner: null },
    ] as const;
    expect(gameScore([...games], 'me')).toEqual({ me: 1, partner: 1, draws: 1 });
    expect(gameScore([...games], 'me', 'tictactoe')).toEqual({ me: 1, partner: 0, draws: 1 });
  });
  it('applyMove reports the outcome with the new board', () => {
    const { outcome } = applyMove('tictactoe', ticTacToe.initial(P), 4, 0);
    expect(outcome.status).toBe('active');
  });
});

describe('quizzes', () => {
  it('has unique ids and sensible questions', () => {
    expect(new Set(KNOW_ME.map((q) => q.id)).size).toBe(KNOW_ME.length);
    expect(new Set(THIS_OR_THAT.map((q) => q.id)).size).toBe(THIS_OR_THAT.length);
    for (const q of KNOW_ME) expect(q.options.length).toBeGreaterThanOrEqual(3);
  });
  it('words know-me questions for whoever reads them', () => {
    const q = KNOW_ME.find((x) => x.id === 'k04')!;
    expect(knowMePrompt(q, 'Parul', false)).toBe('Parul’s dream holiday?'.replace('’', "'"));
    expect(knowMePrompt(q, 'Parul', true)).toBe('Your dream holiday?');
    const fire = KNOW_ME.find((x) => x.id === 'k03')!;
    expect(knowMePrompt(fire, 'Parul', true)).toBe('What would you grab first in a fire?');
    const stress = KNOW_ME.find((x) => x.id === 'k09')!;
    expect(knowMePrompt(stress, 'Parul', true)).toBe('When you is stressed, you…'.replace('you is', 'you are'));
  });
  it('picks fresh questions first, then recycles the oldest', () => {
    const first = pickQuestions('know_me', [], () => 0.5);
    expect(first).toHaveLength(QUIZ_LENGTH);
    const used = KNOW_ME.map((q) => q.id).filter((id) => !['k01', 'k02'].includes(id));
    const next = pickQuestions('know_me', used, () => 0.5);
    expect(next).toHaveLength(QUIZ_LENGTH);
    expect(next).toEqual(expect.arrayContaining(['k01', 'k02']));
  });
  it('scores matches and names the result', () => {
    expect(quizScore([0, 1, 2], [0, 1, 1])).toBe(2);
    expect(quizScore(null, [0])).toBe(0);
    expect(quizVerdict('know_me', 10, 10)).toMatch(/Soulmates/);
    expect(quizVerdict('this_or_that', 2, 10)).toMatch(/Opposites attract/);
    expect(quizState({ my_answers: null, partner_answers: null })).toBe('mine');
    expect(quizState({ my_answers: [0], partner_answers: null })).toBe('waiting');
    expect(quizState({ my_answers: [0], partner_answers: [1] })).toBe('revealed');
  });
});

describe('talk cards', () => {
  it('deals the same order from the same seed, and every card once', () => {
    expect(seededOrder(30, 42)).toEqual(seededOrder(30, 42));
    expect(seededOrder(30, 42)).not.toEqual(seededOrder(30, 43));
    expect([...seededOrder(30, 7)].sort((a, b) => a - b)).toEqual([...Array(30).keys()]);
  });
  it('runs out at the end of the deck', () => {
    const deck = DECKS[0]!;
    expect(cardAt({ deck: deck.id, seed: 1, index: 0 })).toBeTypeOf('string');
    expect(cardAt({ deck: deck.id, seed: 1, index: deck.cards.length })).toBeNull();
  });
});
