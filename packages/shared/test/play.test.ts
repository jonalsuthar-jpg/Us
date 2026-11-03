import { describe, expect, it } from 'vitest';
import { quizState } from '../src/api/quizzes';
import { cardAt, DECKS, seededOrder } from '../src/games/cards';
import { KNOW_ME, knowMePrompt, pickQuestions, QUIZ_LENGTH, quizScore, quizVerdict, THIS_OR_THAT } from '../src/games/quiz';

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
